# packages/shared

Hợp đồng dữ liệu giữa app và backend, viết bằng Zod. Cả hai bên import từ `@rental/shared`.

| Schema | Dùng cho |
| --- | --- |
| `AnalyzeResponseSchema` | Kết quả `POST /analyze`: trang, dòng OCR (kèm `bbox` chuẩn hóa 0..1), `key_terms`, `flags` |
| `MessageRequestSchema` / `MessageResponseSchema` | `POST /message`: soạn tin nhắn từ các cảnh báo sinh viên đã giữ |
| `FlagSchema`, `KeyTermsSchema`, `OcrLineSchema` | Các phần bên trong |
| `ApiErrorSchema` | Lỗi trả về (ảnh mờ, không phải hợp đồng...) |

Bản đầu do vai **App** viết theo khuôn mẫu JSON trong README gốc để app có thể chạy với dữ liệu giả. Vai **Backend** là người quyết định cuối: cứ sửa qua Pull Request và báo vai App.

Còn thiếu (việc của Backend): code kiểm tra theo quy tắc (bước B3) đọc từ `data/checklist.yaml`, và hàm kiểm tra câu trích (`quote`) có khớp với dòng OCR (`line_ids`) không.

```bash
npm run typecheck -w @rental/shared
```
