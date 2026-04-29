import axios from "axios";
import * as cheerio from "cheerio";

async function scrapeMinhNgocHTML() {
  const url = "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac.html";
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const $ = cheerio.load(data);
    
    console.log("Title:", $("title").text());
    console.log("Body abstract:", $("body").text().substring(0, 500).replace(/\s+/g, ' '));
    // Find any TD that contains numbers of a certain length
    console.log("Class attributes of td:", $("td").map((i, el) => $(el).attr("class")).get().filter(Boolean).slice(0, 20));

  } catch (error) {
    console.error("Error scraping minhngoc.net:", error);
  }
}
scrapeMinhNgocHTML();
