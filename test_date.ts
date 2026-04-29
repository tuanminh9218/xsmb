import axios from "axios";

async function test() {
  const dates = [
    'https://xoso.me/xsmb-25-4-2024.html',
    'https://xoso.me/ket-qua-xo-so-mien-bac-xsmb-ngay-25-4-2024.html',
  ];

  for (let url of dates) {
    try {
      let r = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      console.log(url, r.status);
    } catch (e) {
      console.log(url, e.response?.status);
    }
  }
}
test();
