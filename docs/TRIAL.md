# Bản thử nghiệm đầu tiên trên develop

Ngày thực hiện: 09/11/2026. Triển khai các bước khởi đầu của [kế hoạch](PLAN.md), kèm giao diện để nhóm thử toàn bộ luồng.

## Chạy bản dữ liệu mẫu

Yêu cầu Node.js 24.3 trở lên trong nhánh 24 (đã chạy với 24.11.1), npm 11.

```powershell
npm install
# Tùy chọn: tạo lại ảnh và fixtures từ dữ liệu mô phỏng.
npm run samples:generate
```

Mở hai terminal tại gốc repo:

```powershell
# Terminal 1
npm run dev:api
```

```powershell
# Terminal 2
npm run dev:web
```

Mở `http://127.0.0.1:8081`. API ở `http://127.0.0.1:8787`, nhập địa chỉ này trong app nếu `localhost` không kết nối được. Mặc định `replay` không cần khóa và không gọi AI. Nếu port bận, dùng địa chỉ Expo hiển thị trong terminal.

Thử từng mẫu: chọn mẫu → xác nhận đủ trang → phân tích → xem dòng trên ảnh → giữ một câu hỏi, sửa nội dung → tạo tin nhắn → sao chép. Mọi câu hỏi mặc định chưa được giữ. Bỏ xác nhận đủ trang trên mẫu 03 để thấy nhận định thiếu được đánh dấu cần xem lại.

Chạy di động bằng `npm run dev:mobile`. Điện thoại và máy tính dùng cùng mạng; đổi địa chỉ API thành `http://IP-máy-tính:8787`. Chưa kiểm tra trên thiết bị Android/iOS thật. Nếu Expo Go chưa tương thích SDK đang dùng, cần development build theo hướng dẫn Expo; bản web là đường thử đầu tiên.

## Đã triển khai

- Ba hợp đồng mô phỏng có ảnh PNG, dòng chữ, tọa độ và kết quả OCR/LLM soạn sẵn; không phải hợp đồng thật.
- Schema Zod chung cho OCR, trường thông tin, cảnh báo, response và duyệt câu hỏi.
- Google Vision adapter ghép dòng qua detectedBreak, chuẩn hóa tọa độ.
- OpenAI Responses API hai bước: trích xuất và phân tích 8 quy tắc, gửi ảnh base64 và Structured Outputs theo Zod; model bắt buộc cấu hình. Không tự chuyển sang mẫu khi provider lỗi. Gửi `store: false` trong mỗi yêu cầu.
- Xác minh dòng/câu trích, giữ OCR gốc, phát hiện số bị sửa hoặc không khớp văn bản; tính số tháng cọc bằng code.
- API giới hạn 1–3 ảnh, 5 MB/ảnh, JPEG/PNG tối đa 25 MP; chuẩn hóa xoay/kích thước trước OCR.
- App chọn/chụp/sắp xếp ảnh, xem kết quả/vùng tô, giữ/bỏ/sửa câu hỏi.
- Tin nhắn dùng template, chưa gọi LLM bước ba; giữ nguyên các câu đã được người dùng duyệt.
- Kiểm thử logic, HTTP và báo cáo đánh giá tách theo chế độ.

## Mẫu và nhãn

| Mẫu | Nội dung | Nhãn mong đợi |
| --- | --- | --- |
| hd01 | Cọc 7 triệu, thuê 3,5 triệu, điều khoản bất lợi | DEP-02, RNT-01, REP-01, TRM-01 |
| hd02 | Tương đối rõ trong phạm vi 8 quy tắc | Không có cảnh báo trong phạm vi này |
| hd03 | Giá điện mơ hồ, thiếu điều kiện hoàn cọc và hạn báo trước | UTL-01, DEP-01, TRM-02 |

Nguồn: `data/samples/contracts.json`. Nhãn: `eval/expected.json`. Ảnh và fixtures sinh vào `data/samples/generated` bằng `npm run samples:generate`.

Replay kiểm tra kết nối và validator, **không đo chất lượng AI thật** vì kết quả được soạn sẵn cùng bộ mẫu. Ba mẫu đều dùng để phát triển, chưa có tập kiểm tra độc lập, mẫu viết tay hoặc ca cảnh báo DEP-03.

## Kiểm tra

```powershell
npm run typecheck
npm test
npm run eval
```

`npm run eval` ghi `eval/reports/replay.json`; đối chiếu quy tắc, trường số và bằng chứng. Kết quả live ghi file khác.

## Bật OCR/LLM thật

```powershell
Copy-Item .env.example apps/api/src/.env
```

Điền `PROVIDER_MODE=live`, `OPENAI_API_KEY`, `OPENAI_MODEL` có quyền truy cập. Model phải hỗ trợ đầu vào ảnh và Structured Outputs trên Responses API. OCR vẫn dùng Google: thêm `GOOGLE_CLOUD_VISION_API_KEY` hoặc đường dẫn tuyệt đối `GOOGLE_APPLICATION_CREDENTIALS`; có thể dùng ADC đã cấu hình. Không cần khóa Anthropic.

Backend đọc cấu hình từ `apps/api/src/.env`, định vị theo file `config.ts` nên không phụ thuộc thư mục chạy lệnh. Biến môi trường shell có ưu tiên cao hơn file; giá trị trống được bỏ qua. Các file env cũ không còn được tự động nạp. `apps/api/src/.env` đã được Git bỏ qua. Không dán khóa vào code/chat hoặc commit.

```powershell
npm run smoke:live
# Khi cả hai provider sẵn sàng, thử thật với ảnh mô phỏng:
npm run eval -- --live
```

Smoke kiểm tra quyền truy cập model/token; lượt eval live mới kiểm tra đầy đủ quyền OCR, structured outputs và đường ảnh → cảnh báo. Các lời gọi có thể phát sinh chi phí theo tài khoản. Khởi động lại API sau khi đổi `apps/api/src/.env`; chọn “Ảnh của bạn”. `/demo/:id` bị tắt trong live.

Đã xác thực khóa OpenAI trong `.env` gốc và thử thật `gpt-4.1-mini` trên ảnh mô phỏng hd01 với OCR soạn sẵn. Hai lượt gọi trích xuất/phân tích hoàn tất trong 15.221 ms, dùng 5.014 input tokens và 1.522 output tokens. Năm trường số khớp nhãn; phát hiện đủ bốn cảnh báo mong đợi nhưng thêm hai cảnh báo thừa DEP-03 và UTL-01. Câu trích khớp nguồn chưa bảo đảm suy luận đúng: model vẫn cảnh báo thiếu biên bản dù hợp đồng đã có, và nghi ngờ giá điện dù đã ghi đơn giá. Chưa chỉnh prompt theo lượt thử này.

Lượt OpenAI riêng ở trên chỉ là một ca phát triển, không phải đánh giá độc lập. Báo cáo: `eval/reports/openai-smoke.json`. Chạy lại riêng OpenAI bằng `npm run smoke:openai -- --model gpt-4.1-mini`; lệnh này gửi ảnh và dùng token thật, nhưng không gọi Google OCR.

Sau khi cấu hình Google Vision, đã chạy thành công toàn bộ OCR → OpenAI trên 3 mẫu: đúng 15/15 trường số, cảnh báo TP=4, FP=10, FN=3, khoảng 6,5–19,5 giây/mẫu. Báo cáo: `eval/reports/live.json`. Luồng kỹ thuật hoạt động nhưng chất lượng cảnh báo chưa đạt.

Ngày 10/11/2026 bổ sung [benchmark cảnh báo](../eval/benchmark/README.md): 24 ca dev mô phỏng, chấm một-một theo điều khoản và bằng chứng, lưu đầu ra để chấm lại, có phiếu chấm giải thích/câu hỏi thủ công. Chạy `npm run benchmark` để xác thực dữ liệu, `npm run benchmark -- --mode live` để đo toàn bộ bằng API thật. Nhãn draft và chưa có holdout; không coi chỉ số trên bộ này là độ chính xác thực tế.

Đối chiếu triển khai theo OpenAI Docs: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Images and vision](https://developers.openai.com/api/docs/guides/images-vision).

## API

| Endpoint | Đầu vào/kết quả |
| --- | --- |
| GET /health | Chế độ và hiện diện cấu hình; không chứng minh credentials hợp lệ |
| GET /samples | Danh sách mẫu mô phỏng |
| GET /samples/hd01.png | Ảnh mẫu |
| POST /demo/hd01 | JSON `{ "all_pages_confirmed": true }`, chỉ ở replay |
| POST /analyze | Multipart: file `pages`, chuỗi `all_pages_confirmed` true/false, chỉ ở live |
| POST /message | JSON reviewed_flags, address, tone → tin nhắn template |

Response từ `/demo/hd01` là ví dụ cho App/Backend đối chiếu. Schema nguồn: `packages/shared/src/index.ts`.

## Giới hạn và việc tiếp theo

1. Dùng benchmark để điều tra và giảm cảnh báo thừa/bỏ sót; giữ baseline trước khi sửa prompt, duyệt lại nhãn độc lập.
2. Thu hợp đồng đã che thông tin, tạo nhãn trước khi xem AI; thêm tập kiểm tra độc lập và ca DEP-03.
3. Kiểm tra điện thoại, ảnh xoay, nhiều trang, chữ viết tay; chưa tuyên bố chất lượng cho các ca này.
4. Đo chi phí/thời gian, quyết định request đồng bộ hay job/polling.
5. Không đánh giá cọc/điện cao khi ngưỡng thị trường đang null; không kết luận hiệu lực pháp lý.
6. API phát triển chưa có xác thực/rate limit phân tán/lưu phiên; cần bổ sung trước khi public.

Upload chỉ xử lý trong bộ nhớ backend; chính sách lưu giữ của provider cần kiểm tra riêng trước khi dùng dữ liệu cá nhân thật.

Đã cập nhật Sharp và Hono server sang bản vá. Kiểm tra npm audit còn 5 cảnh báo mức moderate qua glob/minimatch trong công cụ Expo; chưa ép hạ SDK hoặc override khác major. Đây là phần cần theo dõi trước phát hành.
