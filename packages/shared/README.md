# packages/shared

Hợp đồng dữ liệu giữa app và backend, viết bằng Zod. Cả hai bên import từ `@rental/shared`.

| Schema | Dùng cho |
| --- | --- |
| `AnalyzeResponseSchema` | Kết quả `POST /analyze`: trang, dòng OCR (kèm `bbox` chuẩn hóa 0..1), `key_terms`, `flags` |
| `MessageRequestSchema` / `MessageResponseSchema` | `POST /message`: soạn tin nhắn từ các cảnh báo sinh viên đã giữ |
| `FlagSchema`, `KeyTermsSchema`, `OcrLineSchema` | Các phần bên trong |
| `ApiErrorSchema` | Lỗi trả về (ảnh mờ, không phải hợp đồng...) |

Bản đầu do vai **App** viết theo khuôn mẫu JSON trong README gốc để app có thể chạy với dữ liệu giả. Vai **Backend** là người quyết định cuối: cứ sửa qua Pull Request và báo vai App.

Phần dùng riêng cho backend (app không import), viết dạng hàm thuần, không đọc file:

| File | Việc |
| --- | --- |
| `src/knowledge.ts` | Schema của `data/checklist.yaml` và `data/market_norms.yaml` |
| `src/rules.ts` | Bước B3: `runRuleChecks()` chạy các quy tắc `auto: true` (DEP-04, UTL-01, TRM-02). Thêm quy tắc auto mới thì thêm hàm vào `AUTO_CHECKS` |
| `src/verify.ts` | `verifyFlags()`: kiểm tra mã dòng tồn tại và câu trích (`quote`) khớp với dòng OCR (`line_ids`) |

Import bằng đường dẫn con, ví dụ `import { runRuleChecks } from '@rental/shared/src/rules'`. Test nằm ở `apps/api/src/__tests__/`.

```bash
npm run typecheck -w @rental/shared
```
