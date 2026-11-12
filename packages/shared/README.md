# packages/shared

Đã có schema Zod, validator bằng chứng/số liệu, tỉ lệ cọc và template tin nhắn trong `src/index.ts`. App/API import `@rental/shared`. Chạy `npm test` từ gốc repo. Quy tắc ngưỡng thị trường chưa bật vì thiếu dữ liệu; LLM chỉ nhận 8 quy tắc MVP.

Code dùng chung cho app và backend:

- Zod schema: `KeyTerms`, `Flag`, `AnalyzeResponse`, `MessageResponse`
- Code kiểm tra theo quy tắc (bước B3), đọc từ `data/checklist.yaml`
- Hàm kiểm tra câu trích (`quote`) có khớp với dòng OCR (`line_ids`) không
