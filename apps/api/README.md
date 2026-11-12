# apps/api

Đã có bản Hono thử nghiệm: `npm run dev:api` từ gốc repo. Mặc định replay; chuyển live sau khi có credentials hợp lệ. Hướng dẫn và API thực tế: [docs/TRIAL.md](../../docs/TRIAL.md).

LLM dùng OpenAI Responses API: cấu hình `OPENAI_API_KEY` và `OPENAI_MODEL` trong `apps/api/src/.env` tính từ gốc repo. OCR dùng Google Vision riêng.

Backend Node + Hono (TypeScript). Phụ trách: vai **Backend**.

Các endpoint dự kiến:

| Endpoint | Việc |
| --- | --- |
| `POST /analyze` | Nhận ảnh các trang → B1 OCR → B2 LLM đọc → B3 quy tắc → B4 LLM rủi ro → trả JSON |
| `POST /message` | Nhận các cảnh báo sinh viên đã giữ → B5 LLM soạn tin nhắn |

API key nằm trong `apps/api/src/.env` (đã gitignore, xem `.env.example` ở gốc repo) và chỉ backend đọc. Không đưa key vào app.
