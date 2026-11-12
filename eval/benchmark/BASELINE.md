# Baseline cảnh báo — 10/11/2026

Chạy Google Vision → OpenAI `gpt-4.1-mini` → validator hiện tại, giữ nguyên prompt trước khi sửa chất lượng. Bộ `warnings-v1.0.0`: **24 ca dev mô phỏng, nhãn draft**, cùng họ template; chưa phải đánh giá độc lập trên hợp đồng thật.

- [Báo cáo dễ đọc](../reports/benchmark/2026-11-10T05-39-13-012Z-live/report.md)
- [Báo cáo máy đọc, lỗi từng ca và từng quy tắc](../reports/benchmark/2026-11-10T05-39-13-012Z-live/report.json)
- [Đầu ra pipeline đã lưu](../reports/benchmark/2026-11-10T05-39-13-012Z-live/predictions.json)
- [Phiếu duyệt thủ công còn trống](../reports/benchmark/2026-11-10T05-39-13-012Z-live/human-review.json)

| Chỉ số | Kết quả theo nhãn hiện tại |
| --- | --- |
| Ca hoàn tất / lỗi provider | 24 / 0 |
| Cảnh báo đúng / thừa / bỏ sót | 12 / 137 / 8 |
| Precision | 12/149 = 8,1% |
| Recall | 12/20 = 60,0% |
| F1 | 14,2% |
| Bắt được vấn đề mức cao | 11/18 = 61,1% |
| Ca âm tính bị báo nhầm | 9/11 = 81,8% |
| Ca đúng toàn bộ theo bộ chấm tự động | 2/24 |
| Câu trích khớp OCR | 115/134 = 85,8% |
| Kết luận thiếu không đủ điều kiện/bằng chứng hợp lệ | 6 |
| Thời gian trung vị / p95 | 14,7 / 17,5 giây |
| Input / output tokens | 127.079 / 42.585 |

Lượt chạy kết thúc exit code **1 vì chưa đạt các ngưỡng chất lượng**, không phải lỗi kết nối. Không có ca nào bị loại khỏi báo cáo. Đã chấm lại cùng `predictions.json` bằng `--mode saved --compare`: mọi tổng số giống bản live, không gọi API lại.

## Quan sát để điều tra tiếp

1. Ở `dep-01-negative`, AI trích đúng câu cọc hoàn trong 5 ngày và giải thích rằng điều kiện rõ ràng, nhưng vẫn tạo cảnh báo `risky` với tiêu đề “Không ghi điều kiện hoặc thời hạn trả cọc”. Nhiều mục thuận lợi khác cũng bị đưa vào `flags`. Đây là lỗi đầu ra cụ thể, không chỉ là ngưỡng giá thị trường hay lỗi OCR.
2. `dep-01-positive` không có cảnh báo dù nhãn yêu cầu phát hiện thiếu điều kiện/thời hạn hoàn cọc. Cần kiểm tra nhánh nhận định thiếu, không chỉ lọc cảnh báo thừa.
3. Quy tắc UTL-01 có 0/2 nhãn khớp nghiêm ngặt; cần xem cả phân loại `risky`/`unclear` và câu trích trước khi kết luận model không nhận ra nội dung.
4. Ca có chỉ dẫn giả trong hợp đồng bỏ sót cảnh báo sửa chữa. Một lượt chưa chứng minh nguyên nhân là prompt injection; cần đối chứng và chạy lặp khi điều tra.
5. Câu trích có nguồn không chứng minh giải thích đúng. Mọi điểm về tính hữu ích, câu hỏi và vùng tô ảnh vẫn chưa được người duyệt chấm.

## Thứ tự tiếp theo

1. Hai người duyệt nhãn độc lập theo [rubric](HUMAN_REVIEW.md), xử lý bất đồng và khóa version.
2. Sửa logic phân biệt “đã kiểm tra và không có rủi ro” với “cần sinh cảnh báo”; điều tra cả missing/unclear. Giữ bản baseline này làm đối chứng.
3. Chạy lại cùng version/phạm vi, xem FP giảm có làm FN tăng hay không. Không so trực tiếp các tỷ lệ với bộ 3 mẫu cũ vì khác dữ liệu và tiêu chí ghép.
4. Bổ sung hợp đồng độc lập đã che thông tin, nhiều kiểu câu và ảnh thật; tạo holdout được duyệt trước khi sử dụng. Không tuyên bố chất lượng thực tế từ 24 ca cùng template.
