import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `Bạn là một chuyên gia phân tích dữ liệu xổ số chuyên nghiệp tại Việt Nam. Nhiệm vụ của bạn là nhận các đoạn văn bản (hoặc mô tả từ hình ảnh) về việc ghi số lô, đề, xiên và chuyển đổi chúng sang định dạng JSON chuẩn.

Quy ước ngầm định:
- 'đ' hoặc 'điểm' = lô (1 điểm lô Miền Bắc thường là 23,000đ).
- 'k' hoặc 'n' = tiền nghìn cho đề hoặc xiên.
- Người dùng có thể nhập liệu cho nhiều người chơi (khách hàng) trong cùng một đoạn văn bản. Cần trích xuất riêng biệt từng người.

Hỗ trợ các cú pháp: 'Lô 12,34 x 100đ', 'Đề bộ 01 x 50k', 'Xiên 2: 12-34 x 200k'.

Đầu ra yêu cầu (phải là một đối tượng chứa danh sách các khách hàng):
{
  "danh_sach": [
    {
      "khach_hang": "Tên khách hàng. NẾU VĂN BẢN HOẶC HÌNH ẢNH KHÔNG ĐỀ CẬP HOẶC KHÔNG CÓ TÊN THÌ BẮT BUỘC ĐỂ CHUỖI RỖNG (\"\"). KHÔNG tự bịa tên.",
      "chi_tiet": [
        {"loai": "lo", "so": ["12", "34"], "diem": 100, "tien_xac": 4600000},
        {"loai": "de", "so": ["56"], "tien_cuoc": 50000, "tien_xac": 50000}
      ],
      "tong_tien_xac": 4650000
    }
  ]
}`;

export interface LoteryData {
  khach_hang: string;
  chi_tiet: Array<{
    loai: string;
    so: string[];
    diem?: number;
    tien_cuoc?: number;
    tien_xac: number;
  }>;
  tong_tien_xac: number;
}

export interface LoteryResponse {
  danh_sach: LoteryData[];
}

export async function analyzeLotteryText(text: string, imageBase64?: string, mimeType?: string): Promise<LoteryResponse> {
  const parts: any[] = [];
  
  if (imageBase64 && mimeType) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      }
    });
  }
  
  parts.push({ text });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          danh_sach: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                khach_hang: {
                  type: Type.STRING
                },
                chi_tiet: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      loai: {
                        type: Type.STRING,
                        enum: ["lo", "de", "xien"]
                      },
                      so: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                      },
                      diem: {
                        type: Type.NUMBER
                      },
                      tien_cuoc: {
                        type: Type.NUMBER
                      },
                      tien_xac: {
                        type: Type.NUMBER
                      }
                    },
                    required: ["loai", "so", "tien_xac"]
                  }
                },
                tong_tien_xac: {
                  type: Type.NUMBER
                }
              },
              required: ["khach_hang", "chi_tiet", "tong_tien_xac"]
            }
          }
        },
        required: ["danh_sach"]
      }
    }
  });

  const textResponse = response.text || "{}";
  return JSON.parse(textResponse) as LoteryResponse;
}
