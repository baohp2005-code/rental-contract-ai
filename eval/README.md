# eval

**Benchmark cảnh báo mới:** xem [benchmark/README.md](benchmark/README.md). Có 24 ca mô phỏng phát triển, nhãn độc lập với đầu ra AI, chấm một-một theo điều khoản, báo FP/FN và bằng chứng, lưu đầu ra để chấm lại. Chạy `npm run benchmark` để kiểm tra bộ dữ liệu không gọi API. Chưa có bộ holdout được con người duyệt.

Đã có ba mẫu phát triển mô phỏng và nhãn `expected.json`. `npm run eval` kiểm tra replay, không đo chất lượng AI. `npm run eval -- --live` gọi dịch vụ thật khi cấu hình sẵn sàng. Xem [hướng dẫn](../docs/TRIAL.md).

Bộ kiểm thử. Mỗi hợp đồng mẫu có một file nhãn `hdXX.expected.yaml` liệt kê các cảnh báo **đúng phải có**:

```yaml
contract: hd01
flags:
  - rule_id: DEP-02
    severity: high
    line_ids: [p1-L12]
key_terms:
  rent_vnd: 3500000
  deposit_vnd: 7000000
  electricity_vnd_per_kwh: 4000
```

Chỉ số đo sau mỗi lần sửa prompt: bắt được cảnh báo mức Cao, cảnh báo thừa, tô đúng dòng, đọc đúng số tiền.
