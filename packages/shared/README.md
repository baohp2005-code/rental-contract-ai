# packages/shared

Code dùng chung cho app và backend:

- Zod schema: `KeyTerms`, `Flag`, `AnalyzeResponse`, `MessageResponse`
- Code kiểm tra theo quy tắc (bước B3), đọc từ `data/checklist.yaml`
- Hàm kiểm tra câu trích (`quote`) có khớp với dòng OCR (`line_ids`) không
