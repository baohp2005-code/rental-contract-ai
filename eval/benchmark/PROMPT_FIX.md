# Đối chiếu sau sửa lỗi ghép prompt — 10/11/2026

Đã bỏ regex xóa từ `<checklist>` tới `</checklist>` và tương tự cho `market_norms`. Những thẻ này xuất hiện cả trong câu hướng dẫn nên regex cũ xóa nhầm 1.728/2.056 ký tự của phần system prompt trong Markdown.

Phiên bản `trial-2026-11-10-openai-v3` giữ nguyên hướng dẫn và các khối dữ liệu, chỉ thay đúng chuỗi giữ chỗ bằng checklist thật và `{}` cho dữ liệu thị trường chưa có. Không thêm quy tắc phát cảnh báo mới, không đổi model, schema, validator, nhãn hoặc bộ chấm. Test bắt nội dung request gửi qua SDK đã được kiểm tra thất bại trên code cũ và đạt sau sửa. Tổng 37 test và typecheck đạt.

- [Baseline trước sửa](BASELINE.md)
- [Báo cáo sau sửa](../reports/benchmark/2026-11-10T06-11-04-523Z-live/report.json)
- [Đầu ra sau sửa](../reports/benchmark/2026-11-10T06-11-04-523Z-live/predictions.json)

Cả hai lượt đều dùng Google Vision + `gpt-4.1-mini`, cùng 24 ca dev và cùng phiên bản bộ chấm. Kiểm tra hash xác nhận trong các file pipeline được theo dõi chỉ `apps/api/src/llm.ts` thay đổi. Report xác nhận `comparison.comparable = true`.

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
| Ca hoàn tất / lỗi | 24 / 0 | 24 / 0 |
| Cảnh báo đúng TP | 12 | 14 |
| Cảnh báo thừa FP | 137 | 107 |
| Nhãn bỏ sót FN | 8 | 6 |
| Precision | 8,1% | 11,6% |
| Recall | 60,0% | 70,0% |
| F1 | 14,2% | 19,9% |
| Recall mức cao | 61,1% | 72,2% |
| Ca âm tính bị báo nhầm | 9/11 | 7/11 |
| Ca đúng toàn bộ theo bộ chấm | 2/24 | 5/24 |
| Ca xuất đúng 8 cảnh báo | 17/24 | 9/24 |
| Câu trích khớp nguồn OCR | 115/134 | 99/108 |

Giảm 30 cảnh báo thừa trong lượt này, nhưng **chưa đạt ngưỡng chất lượng**; exit code 1 phản ánh điều đó, không phải lỗi API. Đây là một lượt mỗi cấu hình trên dữ liệu mô phỏng với nhãn draft, chưa chứng minh mức cải thiện ổn định trên dữ liệu độc lập.

## Những lỗi còn lại

- `dep-01-negative`: có hạn hoàn cọc 5 ngày và điều kiện khấu trừ có xác nhận hai bên, nhưng vẫn nhận 8 cảnh báo. Phần DEP-01 diễn giải yêu cầu xác nhận như một điểm nên hỏi thêm rồi gán thành rủi ro thiếu điều kiện.
- `dep-01-positive`: model đã mô tả đúng việc thiếu điều kiện/hạn trả cọc nhưng gán `risky` thay vì nhãn `missing`. Theo cách chấm nghiêm ngặt, đây là 1 FP và 1 FN, không có nghĩa model hoàn toàn không nhận thấy nội dung.
- Trong 6 FN, 5 có dự đoán cùng mã quy tắc nhưng sai loại (`risky` thay `missing/unclear`); trường hợp `trm-02-positive` trả rỗng là bỏ sót thực sự ở cấp mã quy tắc.
- `incomplete-no-missing` vẫn xuất 8 cảnh báo. Chỉ khôi phục phần hướng dẫn chưa tạo được quyết định đáng tin cậy về việc có đủ dữ liệu để cảnh báo hay không.

## Kết luận cho bước triển khai kế tiếp

Lỗi làm mất prompt đã được sửa và có test bảo vệ. Chất lượng còn phụ thuộc việc phân biệt “đã kiểm tra, không có vấn đề” với “cần cảnh báo”, áp dụng đúng điều kiện của từng quy tắc và phân loại `risky/missing/unclear`. Nên bổ sung quyết định rõ cho từng quy tắc, ví dụ đối chứng không có rủi ro, rồi chỉ đưa các kết luận thực sự kích hoạt vào `flags`. Chưa triển khai những thay đổi này trong lượt đối chứng hiện tại.
