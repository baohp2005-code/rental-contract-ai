# Phiếu duyệt chất lượng cảnh báo

Nhãn trong `data.ts` là **nhãn đề xuất**, chưa được người thứ hai duyệt. Không coi đồng thuận của model là đáp án chuẩn.

## Duyệt đáp án trước khi xem dự đoán

Hai người đọc toàn bộ hợp đồng độc lập và ghi từng vấn đề trong phạm vi 8 quy tắc: mã, loại, mức độ, đoạn làm bằng chứng, lý do. Hợp đồng có thể có **0 cảnh báo**. Các đoạn chỉ khác cách diễn đạt cùng một vấn đề không được gắn thành hai vấn đề. Hai vấn đề độc lập cùng mã quy tắc có hai ID nhãn riêng; cần hai cảnh báo riêng theo quy ước benchmark này.

Thống nhất bất đồng rồi mới điền `review_status: reviewed`, tên/mã của hai người vào `reviewers`. Rà soát cả cảnh báo bắt buộc lẫn cảnh báo không nên có. Nâng version dataset khi đổi nhãn; không đổi đáp án chỉ để khớp AI.

- DEP-01: thiếu điều kiện **hoặc** hạn hoàn cọc; đủ trang, đọc rõ mới gắn `missing`.
- DEP-02: mất cọc khi đi sớm kể cả đáp ứng báo trước; cần phân biệt câu phủ định điều khoản này.
- DEP-03: đồng thời có quyền trừ cọc vì hư hỏng **và** thiếu biên bản/ảnh hiện trạng; chỉ thiếu danh sách đồ không tự động kích hoạt.
- UTL-01: đơn giá không xác định/chủ nhà tự định. Không chấm giá cao/thấp vì chưa có ngưỡng đã duyệt.
- RNT-01: chủ nhà được tăng giá tùy ý không báo trước; mâu thuẫn với giá cố định cần làm rõ (`unclear`).
- REP-01: người thuê gánh cả hư hỏng lớn/hao mòn không do mình gây ra.
- TRM-01: quyền lấy lại phòng đột ngột bất cân xứng, có nguy cơ mất cọc.
- TRM-02: không có hạn báo trước; cần đọc toàn bộ hợp đồng và phụ lục.

Đây là quy ước sản phẩm để đo nhất quán, **không xác nhận hiệu lực pháp lý**. Nhờ người am hiểu hợp đồng rà lại những trường hợp còn tranh luận.

## Chấm đầu ra

Mỗi run tạo `human-review.json` gồm văn bản, nhãn, cảnh báo và các trường điểm để trống. Hai người chấm độc lập, ghi bất đồng, sau đó thống nhất; không điền điểm mặc định bằng 2. Trường không áp dụng để `null` và ghi lý do. Ca lỗi API không có cảnh báo để chấm nhưng vẫn là ca thất bại của hệ thống.

| Tiêu chí | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `semantic_correctness` | Cảnh báo sai hoặc bỏ qua điều làm rõ | Đúng một phần, cần sửa phạm vi | Đúng điều khoản và đúng phạm vi |
| `explanation_faithfulness` | Bịa số tiền/hậu quả/căn cứ hoặc khẳng định pháp lý không có nguồn | Có chỗ suy diễn/diễn đạt quá chắc | Giải thích bám hợp đồng, nêu đúng phần chưa chắc |
| `actionable_question` | Sai vấn đề, buộc tội hoặc thêm yêu cầu không liên quan | Đúng vấn đề nhưng chung chung | Lịch sự, cụ thể, gửi được sau khi người dùng duyệt |
| `plain_vietnamese` | Khó hiểu, gây hiểu nhầm | Hiểu được nhưng dài/thuật ngữ khó | Ngắn, rõ, phù hợp sinh viên |

`visual_highlight_correct` là `true/false/null`: đối chiếu ảnh của run và vùng tọa độ OCR. Cảnh báo thiếu không có vùng tô thì để null. Nếu app không tô vì bằng chứng cần xem lại, ghi rõ; không tính thành vùng tô đúng.

Ghi vấn đề bị bỏ sót vào `omitted_issue_notes`; đề xuất sửa nhãn vào `label_disagreement_notes`. Không tự tính các ô null là đạt. Báo tỷ lệ bao phủ duyệt, số người, số bất đồng và tử số/mẫu số cho từng tiêu chí. Điểm thủ công hiện **không tự nhập vào cổng kiểm tra tự động**; cần ký duyệt riêng trước demo cho người ngoài.

## Bộ kiểm tra cuối

Hiện chưa có holdout. Tạo hợp đồng độc lập với template hiện tại, tốt nhất từ mẫu thật đã che thông tin và được phép dùng; cần mở rộng schema/đường ảnh trước khi đưa dữ liệu thật vào runner này. Mọi bản chụp lại, biến thể nội dung và phụ lục cùng một hợp đồng thuộc cùng `family` và cùng split. Chốt nhãn hai người trước khi chạy; không dùng holdout để chỉnh prompt. Nếu đã xem lỗi và chỉnh theo, chuyển cả family sang dev và thay holdout mới.
