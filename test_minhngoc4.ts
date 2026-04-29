import axios from "axios";
import * as cheerio from "cheerio";

async function scrapeMinhNgocHTML() {
  const url = "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac.html";
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);
    
    const firstTable = $("table.bk_mienbac").first(); // Is there a table with this class? Or let's just get the first .giaidb
    
    console.log("Time:", $(".ngay").first().text().trim());
    console.log("DB HTML:", $(".giaidb").first().html());
    console.log("G1 HTML:", $(".giai1").first().html());
    console.log("G2 HTML:", $(".giai2").first().html());
    // Get text properly parsed for G2
    console.log("G2 text div values:", $(".giai2").first().find('div').map((i, el) => $(el).text().trim()).get());

  } catch (error) {
    console.error("Error scraping minhngoc.net:", error);
  }
}
scrapeMinhNgocHTML();
