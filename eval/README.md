# eval

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
