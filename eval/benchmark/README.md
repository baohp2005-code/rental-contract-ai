# Benchmark chất lượng cảnh báo v1

Benchmark này bổ sung cho `npm run eval` cũ (3 fixture kiểm tra tích hợp). Dữ liệu mới có **24 ca tổng hợp**, 8 cặp có/không có rủi ro và 8 ca khó; phủ cả 8 quy tắc MVP. Tất cả thuộc **dev**, cùng họ template và nhãn **draft**. Không phải 24 hợp đồng độc lập, chưa có holdout, chưa chứng minh chất lượng trên hợp đồng thật/ảnh chụp/viết tay.

Đã chạy baseline API thật ngày 10/11/2026: xem [kết quả và lỗi quan sát được](BASELINE.md). Benchmark chấm đầu ra cuối mà app nhận sau validator, không phải toàn bộ đầu ra trung gian của từng lời gọi LLM.

Đã chạy lại sau khi sửa lỗi xóa nhầm hướng dẫn: [đối chiếu trước/sau](PROMPT_FIX.md). Cảnh báo thừa giảm từ 137 xuống 107 trong lượt này; chất lượng vẫn chưa đạt ngưỡng.

## Chạy

```powershell
# Chỉ kiểm tra dữ liệu, nhãn, chống trộn family giữa các split; không gọi API.
npm run benchmark

# Google Vision + OpenAI thật trên 24 ca, tuần tự, có chi phí API.
npm run benchmark -- --mode live --split dev

# Chạy ít ca khi kiểm tra tích hợp (không đạt cổng full_split).
npm run benchmark -- --mode live --ids dep-02-positive,dep-02-negative

# Chấm lại đầu ra đã lưu, không gọi API.
npm run benchmark -- --mode saved --input eval/reports/benchmark/<run>/predictions.json

# So sánh cùng dataset, danh sách ca và phiên bản scorer.
npm run benchmark -- --mode live --compare eval/reports/benchmark/<run-cu>/report.json
```

Key đọc từ `apps/api/src/.env`, giữ ở backend. `--mode live` gọi pipeline thật dù cấu hình app đang là replay; không đổi cấu hình app. `--split holdout` hiện báo lỗi vì chưa có dữ liệu độc lập được duyệt. `--limit N` chọn N ca đầu; không suy rộng kết quả subset.

Mỗi run nằm ở `eval/reports/benchmark/<UTC-timestamp>-<mode>/`, không ghi đè baseline: `report.json`, `report.md`, `predictions.json`, `dataset.json`, `human-review.json`. Run live lưu thêm ảnh PNG đầu vào; khi chấm lại dùng ảnh từ run gốc ghi trong provenance. Mỗi ca được checkpoint, lỗi provider vẫn lưu mã lỗi và tiếp tục; không lưu key/headers/stack trace. Bản snapshot chứa nội dung hợp đồng mô phỏng và đầu ra đầy đủ. Không dùng đường này lưu dữ liệu cá nhân thật.

Nếu PowerShell chặn `npm.ps1`, dùng `npm.cmd` thay cho `npm`; không cần đổi execution policy của máy.

## Cách chấm

- **Đơn vị:** một vấn đề được gắn nhãn trong hợp đồng. Ghép tối đa một-một theo `rule_id + type + vị trí điều khoản chuẩn`. Cảnh báo lặp tính FP. Không ghép chỉ vì cùng mã quy tắc.
- Với `risky/unclear`, các dòng mà AI trỏ đến phải chứa ít nhất một đoạn chuẩn `evidence_any_of` đúng trang. Dùng nội dung chuẩn thay vì cố định mã dòng, vì OCR có thể xuống dòng khác nhau. Không chấm bằng model thứ hai.
- **TP/FP/FN**, precision = TP/(TP+FP), recall = TP/(TP+FN), F1; báo theo quy tắc, theo nhóm tình huống và toàn bộ. Macro F1 lấy trung bình các quy tắc có dự đoán hoặc nhãn dương; quy tắc không có cả hai để N/A.
- **Bằng chứng:** tự kiểm tra mã dòng và câu trích với OCR, không tin thuộc tính `evidence_status`. `supported_precision` chỉ tính TP có câu trích khớp OCR và chứa đoạn chuẩn. Nhận đúng điều khoản nhưng quote sai vẫn bị trừ điểm bằng chứng. Kiểm tra từ vựng này có thể bỏ sót quote đồng nghĩa/quote quá ngắn; người duyệt xem lại, không tự đổi nhãn.
- **Mức độ:** chấm riêng trên những cảnh báo ghép đúng; high recall lấy severity từ nhãn, không suy từ mã quy tắc hay dự đoán.
- **Cảnh báo thừa trên hợp đồng rõ:** tỷ lệ ca âm tính có ít nhất một FP trên ca âm tính hoàn tất; đồng thời báo clean success trên toàn bộ ca âm tính để lỗi API không làm kết quả đẹp lên.
- **Ca lỗi:** mọi nhãn kỳ vọng của ca lỗi tính FN; ca âm tính lỗi không được tính đạt. Báo failed riêng. Nếu mẫu số bằng 0 thì N/A, không tự coi 100%.
- **Exact case:** hoàn tất, không FP/FN, đúng bằng chứng và mức độ cho tất cả nhãn. **Không** chứng minh lời giải thích đúng/hữu ích.
- Giải thích, câu hỏi và vùng tô ảnh cần chấm theo [phiếu thủ công](HUMAN_REVIEW.md). Không dùng quote khớp để suy ra suy luận đúng.

Mốc tự động đề xuất: chạy đủ split và không có lỗi; precision ≥85%, high recall ≥90%, supported precision ≥85%, câu trích có nguồn 100%, không kết luận thiếu khi chưa đủ dữ liệu, tỷ lệ báo nhầm ca âm ≤10%. Thiếu mẫu đo trả N/A và chưa đạt. Đây là mốc nội bộ, không phải chuẩn ngành. `release_ready` luôn false ở bản v1 vì chưa duyệt con người/holdout; cổng tự động đạt cũng không cấp quyền phát hành.

Exit code: 0 khi validate thành công hoặc đủ cổng tự động; 1 khi chưa đạt chất lượng hoặc tham số/dữ liệu không hợp lệ; 2 khi có ca lỗi provider/pipeline. Exit 1 sau live thường là **kết quả benchmark chưa đạt**, không có nghĩa chương trình bị hỏng.

## Tái lập và diễn giải

Report lưu hash dataset, mã nguồn pipeline, prompt/checklist, phiên bản scorer, model, Git revision/trạng thái dirty, thời gian và token. Cấu hình provider chỉ ghi model, không ghi env. Model có thể không tất định: một lượt là baseline, chưa phải khoảng tin cậy; khi chọn prompt cuối nên chạy lặp và báo từng lượt. Chỉ so sánh trực tiếp khi dataset và phạm vi chấm giống nhau. Thời gian gồm OCR + hai lời gọi AI, không gồm mạng từ điện thoại. Token chỉ tổng hợp ca hoàn tất; ca lỗi có thể đã tiêu tốn token nhưng pipeline chưa trả usage.

Nhãn không tự sinh từ câu trả lời của AI. Khi thay đáp án, tăng version và chạy lại baseline; không sửa đáp án để tăng điểm. Các cặp tối thiểu cố ý dùng chung template để cô lập điều kiện, nên không coi là các mẫu độc lập về thống kê.
