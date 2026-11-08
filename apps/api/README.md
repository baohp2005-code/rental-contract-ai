# apps/api

Backend Node + Hono (TypeScript). Phụ trách: vai **Backend**.

Các endpoint dự kiến:

| Endpoint | Việc |
| --- | --- |
| `POST /analyze` | Nhận ảnh các trang → B1 OCR → B2 LLM đọc → B3 quy tắc → B4 LLM rủi ro → trả JSON |
| `POST /message` | Nhận các cảnh báo sinh viên đã giữ → B5 LLM soạn tin nhắn |

API key chỉ nằm ở đây (file `.env`, xem `.env.example` ở gốc repo). Không bao giờ đưa key vào app.
