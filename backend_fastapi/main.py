from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict
import httpx
from bs4 import BeautifulSoup

app = FastAPI(title="Xoso Backend API", version="1.0.0")

# --- Cấu hình tỷ lệ trả thưởng (có thể tùy chỉnh lại bằng Database sau này) ---
PAYOUT_RATES = {
    "de": 80,       # Đề ăn 80 (1k ăn 80k)
    "lo": 80_000,   # Lô ăn 80 (1 điểm lô ăn 80,000 VND)
    "xien": 10      # Xiên 2 ăn 10 (1k ăn 10k)
}

# --- Pydantic Models (Khớp với JSON Đầu Vào) ---
class ChiTietCuoc(BaseModel):
    loai: str 
    so: List[str]
    diem: float = 0.0
    tien_cuoc: float = 0.0
    tien_xac: float = 0.0

class KhachHangData(BaseModel):
    khach_hang: str
    chi_tiet: List[ChiTietCuoc]
    tong_tien_xac: float

class TinhToanResponse(BaseModel):
    khach_hang: str
    danh_sach_trung: List[Dict]
    tong_tien_thang: float
    loi_nhuan: float
    kqxs: Dict[str, List[str]]

# --- Module Scraper: Lấy Dữ liệu Xổ số Miền Bắc realtime ---
async def fetch_kqxs_minh_ngoc() -> Dict[str, any]:
    """
    Scrape kết quả xổ số miền Bắc từ trang minhngoc.net
    Trả về: {"dac_biet": ["..."], "lo_2so": ["12", "34", ...], "time": "..."}
    """
    url = "https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac.html"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            kqxs = {
                "dac_biet": [], "giai_nhat": [], "giai_nhi": [],
                "giai_ba": [], "giai_tu": [], "giai_nam": [], "giai_sau": [], "giai_bay": [],
                "time": ""
            }
            
            time_tag = soup.find(class_='ngay')
            if time_tag:
                time_text = time_tag.get_text(separator=" ", strip=True)
                if "Ký hiệu" in time_text:
                    time_text = time_text.split("Ký hiệu")[0].strip()
                kqxs["time"] = time_text

            def get_numbers_by_class(cls):
                td = soup.find('td', class_=cls)
                if not td: return []
                nums = []
                for div in td.find_all('div'):
                    val = div.get_text(strip=True)
                    if val:
                        nums.append(val)
                return nums

            kqxs["dac_biet"] = get_numbers_by_class('giaidb')
            kqxs["giai_nhat"] = get_numbers_by_class('giai1')
            kqxs["giai_nhi"] = get_numbers_by_class('giai2')
            kqxs["giai_ba"] = get_numbers_by_class('giai3')
            kqxs["giai_tu"] = get_numbers_by_class('giai4')
            kqxs["giai_nam"] = get_numbers_by_class('giai5')
            kqxs["giai_sau"] = get_numbers_by_class('giai6')
            kqxs["giai_bay"] = get_numbers_by_class('giai7')

            # Lọc lấy 2 số cuối của toàn bảng để dò lô
            lo_2so = []
            for key, numbers in kqxs.items():
                if key != "time":
                    for num in numbers:
                        if len(num) >= 2:
                            lo_2so.append(num[-2:])
                        
            kqxs["lo_2so"] = lo_2so
            kqxs["de_2so"] = [kqxs["dac_biet"][0][-2:]] if kqxs["dac_biet"] else []
            
            return kqxs
            
    except Exception as e:
        return {"error": str(e)}

async def fetch_kqxs_mien_bac() -> Dict[str, List[str]]:
    """
    Scrape kết quả xổ số miền Bắc từ trang xoso.me
    Trả về: {"dac_biet": ["..."], "lo_2so": ["12", "34", ...], ...}
    """
    url = "https://xoso.me/xsmb-sxmb-xstd-xshn-kqxsmb-ket-qua-xo-so-mien-bac.html"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            kqxs = {
                "dac_biet": [], "giai_nhat": [], "giai_nhi": [],
                "giai_ba": [], "giai_tu": [], "giai_nam": [], "giai_sau": [], "giai_bay": []
            }
            
            # Xoso.me sử dụng các class name prefix 'v-g' cho các giải
            # VD: v-gdb (Đặc biệt), v-g1 (G.1), v-g2 (G.2), v-g7 (G.7)
            dac_biet_td = soup.find('td', class_='v-gdb')
            if dac_biet_td:
                kqxs["dac_biet"] = [dac_biet_td.text.strip()]
                
            for i in range(1, 8):
                giai_tds = soup.find_all('td', class_=f'v-g{i}')
                key = list(kqxs.keys())[i] # Lấy tên key (giai_nhat, giai_nhi...)
                for td in giai_tds:
                    numbers = td.text.strip().split('-') # Nếu có nhiều số trong 1 ô
                    numbers = [n.strip() for n in numbers if n.strip()]
                    kqxs[key].extend(numbers)
            
            # Lọc lấy 2 số cuối của toàn bảng để dò lô
            lo_2so = []
            for giai, numbers in kqxs.items():
                for num in numbers:
                    if len(num) >= 2:
                        lo_2so.append(num[-2:])
                        
            kqxs["lo_2so"] = lo_2so
            
            # Đề là 2 số cuối của duy nhất giải đặc biệt
            kqxs["de_2so"] = [kqxs["dac_biet"][0][-2:]] if kqxs["dac_biet"] else []
            return kqxs
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi cào dữ liệu xoso.me: {str(e)}")

# --- API Endpoint: Tính toán trúng thưởng ---
@app.post("/tinh-toan", response_model=TinhToanResponse)
async def tinh_toan_lo_de(data: KhachHangData):
    try:
        # Bước 1: Fetch kết quả xổ số
        kqxs = await fetch_kqxs_mien_bac()
        lo_2so = kqxs.get("lo_2so", [])
        de_2so = kqxs.get("de_2so", [])
        
        if not lo_2so:
            raise HTTPException(status_code=500, detail="Chưa có chữ số nào được quay ra. Có thể chưa đến giờ hoặc nguồn bảo trì.")

        # Bước 2: So khớp từng chi tiết cược
        tong_tien_thang = 0
        danh_sach_trung = []
        
        for item in data.chi_tiet:
            loai = item.loai.lower()
            
            if loai == "lo":
                for so in item.so:
                    # Đếm số nháy lô (số lần xuất hiện trong bảng KQXS)
                    nhay = lo_2so.count(str(so))
                    if nhay > 0:
                        tien_thang = item.diem * PAYOUT_RATES["lo"] * nhay
                        tong_tien_thang += tien_thang
                        danh_sach_trung.append({
                            "loai": "Lô", "so": so, "so_nhay": nhay, "tien_thang": tien_thang
                        })
                        
            elif loai == "de":
                for so in item.so:
                    if str(so) in de_2so:
                        # Đề trúng
                        tien_thang = item.tien_cuoc * PAYOUT_RATES["de"]
                        tong_tien_thang += tien_thang
                        danh_sach_trung.append({
                            "loai": "Đề", "so": so, "tien_thang": tien_thang
                        })
                        
            elif loai == "xien" and len(item.so) >= 2:
                # Xiên: Tất cả các số trong xiên phải nằm trong bảng lô
                if all(str(s) in lo_2so for s in item.so):
                    # Giả định đây là Xiên 2, tỷ lệ chung ăn 10
                    # Có thể cấu hình mở rộng cho xiên 3, 4 bằng cách check len(item.so)
                    rate = PAYOUT_RATES["xien"]
                    tien_thang = item.tien_cuoc * rate
                    tong_tien_thang += tien_thang
                    danh_sach_trung.append({
                        "loai": f"Xiên {len(item.so)}", "so": "-".join(item.so), "tien_thang": tien_thang
                    })
                        
        loi_nhuan = tong_tien_thang - data.tong_tien_xac
        
        return TinhToanResponse(
            khach_hang=data.khach_hang,
            danh_sach_trung=danh_sach_trung,
            tong_tien_thang=tong_tien_thang,
            loi_nhuan=loi_nhuan,
            kqxs=kqxs
        )
        
    except httpx.HTTPError as he:
        raise HTTPException(status_code=502, detail=f"Lỗi mạng khi kết nối tới xoso.me: {str(he)}")
    except HTTPException:
        # Re-raise HTTPException để giữ nguyên mã lỗi
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi máy chủ nội bộ: {str(e)}")

# Để chạy script, cần cài đặt các thư viện:
# pip install fastapi uvicorn pydantic httpx beautifulsoup4
# Câu lệnh chạy khởi động backend: 
# uvicorn main:app --reload
