import express from "express";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { createServer as createViteServer } from "vite";
import webpush from "web-push";
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.json());

const VAPID_KEYS_FILE = path.join(process.cwd(), "vapid.json");
let vapidKeys: { publicKey: string, privateKey: string };

if (fs.existsSync(VAPID_KEYS_FILE)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, "utf-8"));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(vapidKeys));
}

webpush.setVapidDetails(
  "mailto:contact@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const SUBSCRIPTIONS_FILE = path.join(process.cwd(), "subscriptions.json");
let subscriptions: any[] = [];
if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
  subscriptions = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf-8"));
}

app.get("/api/vapidPublicKey", (req, res) => {
  res.send(vapidKeys.publicKey);
});

app.post("/api/subscribe", (req, res) => {
  const subscription = req.body;
  if (subscription && subscription.endpoint) {
    if (!subscriptions.find(s => s.endpoint === subscription.endpoint)) {
      subscriptions.push(subscription);
      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions));
    }
  }
  res.status(201).json({});
});

// Polling background logic to send push when new result arrives
let previousResultHash = "";

setInterval(async () => {
  const currentHour = new Date().getHours();
  // XSMB draw happens between 18:00 and 18:35 Vietnam time roughly
  // We can poll continuously and hash the result to see if there's any new data.
  if (currentHour >= 18 && currentHour <= 19) {
    try {
      const data = await scrapeXosoMe();
      if (data) {
        // Collect all non-empty results across all prizes
        let numCount = 0;
        let dbStr = "";
        if (data.dac_biet.length > 0) dbStr = data.dac_biet[0];
        for (let i = 1; i <= 7; i++) {
          numCount += data[`giai_${i}`].length;
        }
        
        const currentHash = `db:${dbStr}-total:${numCount}`;
        
        if (previousResultHash && currentHash !== previousResultHash) {
          // Send push notification about new result
          const payload = JSON.stringify({
            title: "Kết quả XSMB có cập nhật mới!",
            body: `Cập nhật kết quả mới. Đặc biệt: ${dbStr || 'Chưa có'}. Đang có ${numCount} lô đã ra.`,
            icon: "/vite.svg"
          });
          
          subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload).catch(err => {
              console.error("Push Error", err);
              // potentially remove dead subscription
            });
          });
        }
        previousResultHash = currentHash;
      }
    } catch (e) {
      console.error("Background polling error:", e);
    }
  }
}, 30000);

// --- Scraper Logic for North Vietnam Lottery (XSMB) ---

async function scrapeXosoMe() {
  const url = "https://xoso.me/xsmb-sxmb-xstd-xshn-kqxsmb-ket-qua-xo-so-mien-bac.html";
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const $ = cheerio.load(data);
    
    const kqxs: any = {
      dac_biet: [], giai_1: [], giai_2: [], giai_3: [],
      giai_4: [], giai_5: [], giai_6: [], giai_7: [],
      time: ""
    };

    kqxs.time = $(".title-kq-mien").text().trim() || $("h2").first().text().trim();
    
    const db = $(".v-gdb").text().trim();
    if (db) kqxs.dac_biet = [db];

    for (let i = 1; i <= 7; i++) {
        $(`.v-g${i}`).each((_, el) => {
          const text = $(el).text().trim();
          if (text) {
            kqxs[`giai_${i}`].push(...text.split('-').map(s => s.trim()).filter(Boolean));
          }
        });
    }

    return kqxs;
  } catch (error) {
    console.error("Error scraping xoso.me:", error);
    return null;
  }
}

async function scrapeMinhNgoc(dateStr?: string) {
  let url = "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac.html";
  if (dateStr) {
    // format expected: DD-MM-YYYY
    url = `https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/${dateStr}.html`;
  }
  
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const $ = cheerio.load(data);
    
    const kqxs: any = {
      dac_biet: [], giai_1: [], giai_2: [], giai_3: [],
      giai_4: [], giai_5: [], giai_6: [], giai_7: [],
      time: ""
    };

    // Extract time
    let timeText = $(".ngay").first().text().trim();
    if (timeText.includes("Ký hiệu")) {
      timeText = timeText.split("Ký hiệu")[0].trim();
    }
    kqxs.time = timeText;
    
    // Giai Dac Biet
    $(".giaidb").first().find('div').each((_, el) => {
        const text = $(el).text().trim();
        if (text) kqxs.dac_biet.push(text);
    });

    // Other prizes
    for (let i = 1; i <= 7; i++) {
        $(`.giai${i}`).first().find('div').each((_, el) => {
            let text = $(el).text().trim();
            if (text) {
                // Sometime numbers are joined with dashes, although minhngoc usually uses divs
                kqxs[`giai_${i}`].push(...text.split(/\s+|-/).filter(Boolean));
            }
        });
    }

    return kqxs;
  } catch (error) {
    console.error("Error scraping minhngoc.net:", error);
    return null;
  }
}

// --- API Routes ---

app.get("/api/lottery", async (req, res) => {
  const source = req.query.source === "minhngoc" ? "minhngoc" : "xosome";
  const dateStr = typeof req.query.date === 'string' ? req.query.date : undefined;
  
  let data;
  if (source === "minhngoc" || dateStr) {
    // If date is provided, force using minhngoc because xosome date URL is unknown
    data = await scrapeMinhNgoc(dateStr);
  } else {
    data = await scrapeXosoMe();
  }
  
  if (!data) {
    return res.status(500).json({ error: "Failed to fetch lottery results" });
  }

  // Pre-process winning numbers
  const lo_2so: string[] = [];
  Object.keys(data).forEach(key => {
    if (Array.isArray(data[key])) {
      data[key].forEach((num: string) => {
        if (num.length >= 2) lo_2so.push(num.slice(-2));
      });
    }
  });

  res.json({ ...data, lo_2so, de_2so: data.dac_biet[0]?.slice(-2) ? [data.dac_biet[0].slice(-2)] : [] });
});

app.post("/api/calculate", async (req, res) => {
  try {
    const { data: userData, lottery: kqxs, rates } = req.body;
    
    const lo_2so = kqxs.lo_2so || [];
    const de_2so = kqxs.de_2so || [];
    
    const danh_sach = userData.danh_sach || (userData.khach_hang ? [userData] : []);
    const danh_sach_khach: any[] = [];
    
    danh_sach.forEach((khach: any) => {
      let tong_tien_thang = 0;
      const chi_tiet_ket_qua: any[] = [];
      
      const chi_tiet = khach.chi_tiet || khach.chi_detail || [];
      chi_tiet.forEach((item: any) => {
        const loai = (item.loai || "").toLowerCase();
        const ds_so = Array.isArray(item.so) ? item.so : (item.so ? [item.so] : []);
        
        if (loai === "lo") {
          ds_so.forEach((so: string) => {
            const nhay = lo_2so.filter((s: string) => s === so).length;
            const isWin = nhay > 0;
            const tien_thang = isWin ? (item.diem || 0) * (rates.lo || 80000) * nhay : 0;
            if (isWin) tong_tien_thang += tien_thang;
            chi_tiet_ket_qua.push({ loai: "Lô", so, nhay, tien_thang, isWin });
          });
        } else if (loai === "de") {
          ds_so.forEach((so: string) => {
            const isWin = de_2so.includes(so);
            const tien_thang = isWin ? (item.tien_cuoc || 0) * (rates.de || 70) : 0;
            if (isWin) tong_tien_thang += tien_thang;
            chi_tiet_ket_qua.push({ loai: "Đề", so, tien_thang, isWin });
          });
        } else if (loai.startsWith("xien")) {
          const isWin = ds_so.length > 0 && ds_so.every((s: string) => lo_2so.includes(s));
          const len = ds_so.length;
          const rate = rates[`xien${len}`] || rates.xien2 || 10;
          const tien_thang = isWin ? (item.tien_cuoc || 0) * rate : 0;
          if (isWin) tong_tien_thang += tien_thang;
          chi_tiet_ket_qua.push({ loai: `Xiên ${len}`, so: ds_so.join("-"), tien_thang, isWin });
        }
      });
      
      danh_sach_khach.push({
        khach_hang: khach.khach_hang || "Không tên",
        chi_tiet_ket_qua,
        tong_tien_thang,
        loi_nhuan: tong_tien_thang - (khach.tong_tien_xac || 0),
        tong_tien_xac: khach.tong_tien_xac || 0
      });
    });
    
    res.json({
      danh_sach: danh_sach_khach,
      tong_tien_thang: danh_sach_khach.reduce((sum, k) => sum + k.tong_tien_thang, 0),
      loi_nhuan: danh_sach_khach.reduce((sum, k) => sum + k.loi_nhuan, 0),
      tong_tien_xac: danh_sach_khach.reduce((sum, k) => sum + k.tong_tien_xac, 0)
    });
  } catch (error) {
    console.error("Calculate Error:", error);
    res.status(500).json({ error: "Lỗi trong quá trình tính toán" });
  }
});

// --- Vite and Production setup ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
