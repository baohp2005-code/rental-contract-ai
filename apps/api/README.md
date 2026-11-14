# apps/api

Backend Node + Hono (TypeScript). Phụ trách: vai **Backend**.

| Endpoint | Việc |
| --- | --- |
| `GET /health` | Kiểm tra server còn sống |
| `POST /analyze` | Nhận ảnh các trang (multipart, trường `pages`, tối đa 8 ảnh JPEG/PNG/WebP) → B1 OCR → B2 LLM đọc (B2b đọc lại trang khó đọc) → B3 quy tắc → B4 LLM rủi ro → trả `AnalyzeResponse` |
| `POST /message` | Nhận các cảnh báo sinh viên đã giữ (`MessageRequest`) → B5 LLM soạn tin nhắn → trả `MessageResponse` |

Khuôn dữ liệu nằm ở `packages/shared` (`@rental/shared`), dùng chung với app. Lỗi luôn trả theo `ApiErrorSchema` (`image_unreadable` kèm số trang, `not_a_contract`, `too_many_pages`, `internal`).

## Chạy

1. Tạo `apps/api/.env` từ `.env.example` ở gốc repo (`Copy-Item .env.example apps\api\.env`), điền:
   - **LLM**, chọn một:
     - Không AI: `LLM_PROVIDER=none`, không cần key. Xem mục "Chế độ không AI" bên dưới.
     - Claude: `ANTHROPIC_API_KEY` (model mặc định `claude-opus-5-5`, đổi bằng `CLAUDE_MODEL`)
     - OpenAI: `LLM_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` (model hỗ trợ ảnh và Structured Outputs)
   - **OCR Google Vision**, chọn một:
     - `GOOGLE_CLOUD_VISION_API_KEY`: API key của project đã bật **Cloud Vision API** và thanh toán. Cả nhóm dùng chung một project được.
     - `GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json` và đặt file service account vào `apps/api/` (đã gitignore, **không commit**).
2. Ở thư mục gốc repo:

   ```bash
   npm install
   npm run dev -w @rental/api
   ```

   Server chạy ở cổng 8787, nghe trên mọi địa chỉ để điện thoại cùng Wi-Fi gọi được.
3. Trong `apps/mobile/.env` đặt `EXPO_PUBLIC_API_URL=http://<IP máy tính>:8787` rồi chạy lại Expo. App tự chuyển từ dữ liệu mẫu sang backend thật.

Dòng đầu tiên khi khởi động cho biết đang dùng LLM nào, ví dụ `LLM openai:gpt-4.1-mini`. Mỗi lần phân tích, terminal in thời gian và số token của từng bước (B1, B2, B4, có cả token đọc từ bộ đệm prompt), và các cảnh báo bị bỏ vì câu trích không khớp.

### Chạy trên ảnh trong máy (không cần app)

Dùng khi sửa prompt hoặc chạy eval:

```bash
npm run analyze -w @rental/api -- data/samples/hd01-p1.jpg data/samples/hd01-p2.jpg --out out.json
```

## Deploy

Đưa lên Render bằng `render.yaml` ở gốc repo: xem [`docs/DEPLOY.md`](../../docs/DEPLOY.md). Trên mạng công khai nên đặt `RATE_LIMIT_ANALYZE_PER_HOUR` và `RATE_LIMIT_MESSAGE_PER_HOUR` để người lạ không gọi liên tục làm tốn tiền key (`render.yaml` đặt sẵn 20 và 60). Chạy trên máy thì mặc định không giới hạn.

## Lệnh

| Lệnh (ở gốc repo) | Việc |
| --- | --- |
| `npm run dev -w @rental/api` | Chạy server, tự khởi động lại khi sửa code |
| `npm run start -w @rental/api` | Chạy server (dùng khi deploy) |
| `npm test -w @rental/api` | Test (vitest), không gọi Google hay Anthropic thật |
| `npm run typecheck -w @rental/api` | Kiểm tra kiểu |

## Cấu trúc

```
src/index.ts              Khởi động server, đọc .env
src/app.ts                Các endpoint (Hono), nhận ảnh, trả lỗi đúng khuôn
src/config.ts             Biến môi trường, đường dẫn data/ và prompts/
src/rate-limit.ts         Giới hạn số lượt gọi mỗi giờ cho từng IP
src/knowledge.ts          Đọc data/*.yaml và prompts/*.md
src/ocr/vision.ts         B1 · Gọi Google Vision qua REST, bằng API key hoặc service account
src/ocr/lines.ts          B1 · Ghép ký tự Vision thành dòng có mã p1-L01 + bbox 0..1
src/llm/index.ts          Chọn Claude hoặc OpenAI theo LLM_PROVIDER
src/llm/types.ts          Interface Llm chung cho mọi nhà cung cấp
src/llm/claude.ts         Gọi Claude: structured outputs + prompt caching
src/llm/openai.ts         Gọi OpenAI Responses API: Structured Outputs, store:false
src/pipeline/schemas.ts   Khuôn JSON ép cho LLM ở B2, B4, B5
src/pipeline/extract.ts   B2 · Sửa lỗi OCR, trích key_terms và other_fees; B2b · đọc lại trang khó đọc
src/pipeline/risk.ts      B4 · Phân tích rủi ro, rồi kiểm tra lại từng cảnh báo
src/pipeline/message.ts   B5 · Soạn tin nhắn
src/pipeline/numbers.ts   Đọc số tiền, so chữ số giữa OCR và bản AI sửa
src/pipeline/offline.ts   Chế độ không AI: B2/B4/B5 bằng quy tắc và từ khóa
src/pipeline/analyze.ts   Ghép B1 → B4 cho POST /analyze
scripts/analyze-files.ts  Chạy cả luồng trên ảnh trong máy
```

B3 (quy tắc) và hàm kiểm tra câu trích nằm ở `packages/shared/src/rules.ts` và `verify.ts`.

## Prompt lấy từ đâu

Backend đọc khối ` ``` ` đầu tiên trong `prompts/01-extract.md`, `02-risk.md`, `03-message.md` lúc khởi động. Vai Prompt sửa file markdown rồi khởi động lại server là xong, không phải sửa code. Trong `02-risk.md`, chỗ `<checklist>…</checklist>` và `<market_norms>…</market_norms>` được thay bằng nội dung thật của `data/checklist.yaml` và `data/market_norms.yaml`.

Khuôn JSON đầu ra (structured outputs) thì nằm trong code, ở `src/pipeline/schemas.ts`. Đổi tên trường thì phải sửa cả prompt và file này.

## Các lớp chặn AI bịa

| Ở đâu | Chặn gì |
| --- | --- |
| B2 | Bỏ dòng sửa có mã không tồn tại; bỏ `line_ids` bịa trong `key_terms`; số âm hoặc thiếu số thì chuyển thành `unclear` |
| B3 | Quy tắc tính được bằng code (DEP-04, UTL-01, TRM-02) do code quyết định. Code bắt được mà LLM quên thì backend tự thêm cảnh báo từ checklist |
| Sau B4 | Mã dòng phải tồn tại, câu trích phải khớp chữ trên dòng. Khớp gần đúng thì hạ độ tin cậy xuống dưới 0.6 (app ghi "AI không chắc"); sai dòng thì sửa mã dòng; không tìm thấy thì bỏ cảnh báo |
| Sau B4 | `market_norms.yaml` chưa có số liệu nào thì `what_is_common` luôn để trống, không để LLM tự bịa con số |
| B5 | Model trả thiếu câu hỏi thì dùng lại câu hỏi sinh viên đã duyệt |

## Chế độ không AI (`LLM_PROVIDER=none`)

Dùng khi chưa có key LLM, hoặc làm phương án dự phòng lúc demo. OCR vẫn là Google Vision thật; B2 và B4 được thay bằng quy tắc:

- **B2:** đọc tiền thuê, cọc, giá điện, nước, phí dịch vụ, thời hạn, số ngày báo trước bằng từ khóa và `findMoney` (`src/pipeline/offline.ts`).
- **B4:** cảnh báo `risky` khi câu chứa từ khóa xấu (DEP-02, RNT-01, REP-01, TRM-01, OTH-02), cảnh báo `missing` khi cả hợp đồng không nhắc tới (DEP-01, OTH-01, OTH-04), cộng các quy tắc B3. Mọi cảnh báo ghi rõ "phát hiện bằng từ khóa".
- **B5:** ghép tin nhắn theo mẫu, đúng xưng hô và giọng đã chọn.

Trên hợp đồng mẫu của app, chế độ này bắt được 10/11 cảnh báo (thiếu UTL-02 vì cần hiểu nghĩa). Với cách viết lạ thì sẽ bỏ sót nhiều hơn AI.

## Kiểm tra con số (B2)

Đọc sai số tiền là lỗi nặng nhất của app, nên backend không tin con số của AI:

- Bản sửa OCR của AI chỉ được nhận khi **các con số giữ nguyên** so với chữ OCR gốc (có tính lỗi O/0, l/1 của OCR). Đổi `3.500.000` thành `5.500.000` thì bản sửa bị bỏ, giữ chữ OCR.
- Số tiền AI trích vào `key_terms` và `other_fees` phải **đọc được từ chính dòng nó trích dẫn**. Không có thì chuyển thành `unclear`.
- `other_fees` là danh sách mở các khoản phí khác (wifi, gửi xe, rác, vệ sinh, thang máy, máy giặt, phí quản lý...), tối đa 12 khoản. Mỗi khoản có `name`, `kind`, `value` (0 = miễn phí), `unit` (`per_month` / `per_person` / `per_vehicle` / `one_time` / `other`). Backend bỏ khoản trùng, khoản không có dòng trích dẫn thật, và khoản đã có ô riêng (điện, nước, tiền thuê, cọc, phí dịch vụ). Ghi "miễn phí" mà dòng trích dẫn không có chữ nói vậy thì chuyển `unclear`.

Cả hai trường hợp đều in cảnh báo `[B2]` ra terminal (chỉ mã dòng, không in chữ hợp đồng).

### Trang khó đọc (B2b)

Chữ viết tay hoặc ảnh mờ làm OCR đọc sai số ở nhiều dòng, nên AI phải sửa số và bị chặn hàng loạt. Trang nào có từ 4 dòng bị chặn và chiếm từ 20% số dòng của trang thì:

1. Gửi riêng ảnh trang đó cho LLM đọc lại từng dòng (prompt [`prompts/04-reread.md`](../../prompts/04-reread.md)), kèm vị trí dòng trên trang. Nhiều trang thì gọi song song.
2. Mỗi dòng có ba lần đọc: OCR, B2, đọc lại. Con số chỉ được nhận khi **bản đọc lại khớp số với B2 hoặc với OCR**. Lệch cả hai thì dòng vẫn "chưa chắc", giữ chữ OCR.
3. Đếm lại dòng chưa chắc. Trang vẫn còn khó đọc thì trả `image_unreadable` để sinh viên chụp lại, không trả "0 cảnh báo".

Hợp đồng in rõ không chạy bước này nên không tốn thêm. Mỗi trang khó đọc tốn thêm một lần gọi LLM (khoảng 5–10 giây). Lần gọi lỗi thì trang đó vẫn bị báo khó đọc như cũ.

Giới hạn: B2 và bước đọc lại dùng cùng một model, nên hai lần đọc có thể sai giống nhau. Kết quả trên hợp đồng viết tay vẫn cần sinh viên xem lại.

## Lấy từ nhánh develop

Ý tưởng kiểm tra chữ số giữa OCR gốc và bản sửa, cách gọi Google Vision qua REST (nhận API key hoặc service account) và cách gọi OpenAI Responses API (`zodTextFormat`, ảnh dạng data URL, `store: false`, không tự thử lại) lấy theo `apps/api/src/ocr.ts` và `llm.ts` của nhánh `develop`. Khuôn dữ liệu vẫn theo `packages/shared` của nhánh `app/khung-app`.

## Còn thiếu

- Chưa thử với key thật (cả Claude, OpenAI và Google). Lần chạy đầu cần xem log để chỉnh `max_tokens` và thời gian chờ.
- Chưa che số CCCD và số điện thoại (kế hoạch N6).
- Ngưỡng DEP-04 (cọc tối đa 2 tháng, quy tắc tham khảo của app) và UTL-01 (2.472đ/kWh, giá bậc 2 có VAT 8%) lấy từ `data/market_norms.yaml`. Trường nào để `null` thì B3 bỏ qua, riêng "giá điện theo chủ nhà quy định" vẫn luôn bị bắt. Hợp đồng từ 12 tháng thì UTL-01 chỉ gợi ý hỏi cách tính, vì chủ nhà có thể đã kê khai định mức.
