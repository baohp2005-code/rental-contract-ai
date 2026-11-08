# prompts

| File | Bước | Đầu vào | Đầu ra |
| --- | --- | --- | --- |
| `01-extract.md` | B2 · LLM đọc & trích xuất | Ảnh các trang + dòng OCR có id | Dòng đã sửa + `key_terms` |
| `02-risk.md` | B4 · LLM phân tích rủi ro | Hợp đồng đã sửa + `key_terms` + kết quả B3 | Danh sách `flags` |
| `03-message.md` | B5 · LLM soạn tin | Các flag sinh viên giữ + xưng hô + giọng | Tin nhắn Zalo + câu hỏi + câu bổ sung |

Quy tắc khi sửa prompt: chạy lại cả bộ `eval/` rồi mới commit, ghi chỉ số vào mô tả commit.
