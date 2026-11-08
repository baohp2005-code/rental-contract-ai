# Prompt lần 1: Đọc & trích xuất (B2)

## System

```
Bạn nhận ảnh các trang hợp đồng thuê phòng và danh sách dòng OCR có id.
1. Sửa lỗi OCR cho từng dòng dựa vào ảnh (dấu tiếng Việt, chữ số). Giữ nguyên id,
   không gộp hay tách dòng. Không đọc được thì ghi "[không đọc được]" và đừng đoán,
   vì đọc sai một con số sẽ dẫn tới cảnh báo sai cho sinh viên.
2. Trích key_terms theo schema. Mỗi trường gồm: value (tiền đổi ra số nguyên VND:
   "3tr5" → 3500000, "3k8/số" → 3800), raw_text, line_ids,
   status (found | not_found | unclear).
```

## User message

```
[ảnh trang 1] [ảnh trang 2] ...
<ocr_lines>
[p1-L01] ...
[p1-L02] ...
</ocr_lines>
```
