# Hướng dẫn chạy thử app trên điện thoại

Dành cho cả nhóm. App đang chạy bằng **dữ liệu mẫu**: chụp ảnh gì thì kết quả vẫn là của hợp đồng mẫu, có dải màu vàng nhắc điều này.

Có hai cách. **Cách 1** nhanh nhất nếu máy của bạn App đang bật app. **Cách 2** để tự chạy trên laptop của mình, không phụ thuộc ai.

---

## Cách 1: Quét mã từ máy đang chạy app

Cần máy của người làm App đang bật máy chủ Expo. Hỏi người đó lấy **mã QR** hoặc **đường link** bắt đầu bằng `exp://`.

1. **Cài Expo Go** bản mới nhất trên điện thoại:
   - Android: Google Play, tìm "Expo Go".
   - iPhone: App Store, tìm "Expo Go".
   - Đã cài rồi thì cập nhật lên bản mới nhất. App dùng Expo SDK 58; bản Expo Go cũ sẽ báo "not compatible".
2. **Đăng nhập Expo Go:** iPhone bắt buộc, Android nên làm.
   - Mở Expo Go, vào mục tài khoản (Profile/Account), chọn đăng nhập. Chọn **Google** cho nhanh.
   - Chưa có tài khoản thì app sẽ cho tạo, miễn phí.
3. **Mở app của nhóm:**
   - Android: trong Expo Go bấm **Scan QR code**, quét mã.
   - iPhone: mở app **Camera** quét mã, bấm vào thông báo hiện ra.
   - Không quét được thì trong Expo Go chọn **Enter URL manually** và dán đường link `exp://...`.
4. **Đợi lần tải đầu**, khoảng 30 giây đến 1 phút.
5. **Thử trọn luồng:** tick đồng ý → ở màn chụp bấm **"Dùng hợp đồng mẫu"** → **Phân tích** → mở từng cảnh báo, bấm **Giữ** hoặc **Bỏ qua** → **Soạn tin nhắn**.

> Đường link chỉ dùng được khi máy kia đang bật app. Máy đó tắt app hoặc tắt máy thì điện thoại sẽ báo lỗi kết nối. Nếu báo lỗi liên quan tới tài khoản, dùng Cách 2.

---

## Cách 2: Tự chạy trên laptop của mình

### Chuẩn bị (làm một lần)

- **Node.js 22 LTS:** https://nodejs.org. Kiểm tra bằng `node -v`.
- **Git:** https://git-scm.com. Kiểm tra bằng `git -v`.
- **Tài khoản Expo:** tạo tại https://expo.dev/signup, đăng nhập bằng Google cũng được.
- **Expo Go** trên điện thoại, đăng nhập **cùng tài khoản Expo đó** (xem Cách 1, bước 1–2).

### Lấy code về

Mở **PowerShell** (Windows) hoặc **Terminal** (macOS):

```bash
git clone https://github.com/baohp2005-code/rental-contract-ai.git
cd rental-contract-ai
git checkout app/khung-app
npm install
```

Lệnh `git checkout app/khung-app` chỉ cần khi Pull Request #1 chưa được gộp vào `main`. Gộp rồi thì bỏ dòng này.

### Đăng nhập Expo trên laptop

```bash
cd apps/mobile
npx expo login --browser
```

Trình duyệt sẽ mở, đăng nhập bằng Google rồi xác nhận.

**Trên Windows** lệnh trên có thể báo lỗi `cmd.exe /c start ... exited with non-zero code: 1`. Đây là lỗi của Expo khi tự mở trình duyệt. Làm thế này thay thế (trong PowerShell):

```powershell
$env:BROWSER = "none"
npx expo login --browser
```

Terminal sẽ in một đường link dài sau chữ `visit this link to log in:`. Sao chép **toàn bộ** link, dán vào trình duyệt trên **chính laptop đó**, đăng nhập Google. **Không tắt cửa sổ terminal** trong lúc làm.

Kiểm tra đã đăng nhập chưa:

```bash
npx expo whoami
```

Lệnh in ra tên tài khoản là xong.

### Chạy app

```bash
npx expo start --tunnel
```

Đợi terminal hiện mã QR rồi quét như Cách 1, bước 3.

`--tunnel` chạy qua máy chủ của Expo, nên dùng được cả khi Wi-Fi trường hoặc ký túc xá chặn các máy nói chuyện với nhau. Nếu điện thoại và laptop cùng Wi-Fi ở nhà, có thể bỏ `--tunnel` để tải nhanh hơn.

Một số phím trong terminal: `r` tải lại app, `Ctrl+C` tắt máy chủ. Trên điện thoại, lắc máy để mở menu của Expo.

---

## Lỗi thường gặp

| Điện thoại hoặc terminal báo | Cách xử lý |
| --- | --- |
| `timed out` / không kết nối được | Dùng `npx expo start --tunnel`. Tắt VPN trên laptop (Cloudflare WARP, WireGuard...). Trên Windows, đổi mạng Wi-Fi sang **Private**: Settings → Network & internet → Wi-Fi → tên mạng → Network profile type |
| `You need to be signed in to Expo Go and Expo CLI` | Đăng nhập Expo ở **cả** laptop (`npx expo login`) **và** app Expo Go, cùng một tài khoản |
| `Couldn't create a signed tunnel URL ... not logged in` | Laptop chưa đăng nhập Expo: chạy `npx expo login --browser` |
| `cmd.exe /c start ... exited with non-zero code: 1` (Windows, khi đăng nhập) | Chạy `$env:BROWSER = "none"` trước, rồi tự dán link vào trình duyệt (xem phần Đăng nhập) |
| `Project is incompatible with this version of Expo Go` | Cập nhật Expo Go lên bản mới nhất |
| Màn hình đỏ báo lỗi code | Chụp màn hình gửi người làm App, kèm bạn đã bấm những gì trước đó |

---

## Khi thử, để ý giúp những điểm này

Chưa ai kiểm tra những điểm sau trên máy thật. Thấy gì lạ thì chụp màn hình, ghi rõ loại điện thoại (Android/iPhone, đời máy):

- [ ] Khung tô màu có trùng đúng dòng chữ trên ảnh hợp đồng không
- [ ] Chạm vào ảnh để xem cả trang: chụm hai ngón để phóng, kéo, chạm hai lần có mượt không
- [ ] Sửa câu hỏi hoặc sửa tin nhắn: bàn phím có che ô nhập không
- [ ] Bấm **Chia sẻ** ở màn tin nhắn: có hiện Zalo không; dán sang Zalo có giữ đúng xuống dòng không
- [ ] Camera: xin quyền, chụp, ảnh có bị xoay sai chiều không
- [ ] Nút Back của Android ở các màn
- [ ] Chữ có bị tràn hoặc cắt trên màn nhỏ không
