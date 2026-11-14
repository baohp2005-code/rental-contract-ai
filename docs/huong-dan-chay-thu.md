# Hướng dẫn chạy thử app trên điện thoại

Dành cho cả nhóm. App đang chạy bằng **dữ liệu mẫu**: chụp ảnh gì thì kết quả vẫn là của hợp đồng mẫu, có dải màu vàng nhắc điều này.

Có ba cách:

- **Cách 1 (nên dùng, iPhone và Android):** mở bản đã phát hành ngay trong Expo Go. Không cần quét mã, không cần laptop của ai đang bật.
- **Cách 2 (chỉ Android):** quét mã QR từ laptop đang chạy app, để thấy ngay thay đổi mới nhất.
- **Cách 3:** tự chạy trên laptop của mình, dành cho người sửa code.

> **Vì sao iPhone không quét mã QR của người khác được?** Từ Expo Go SDK 57, iPhone thật chỉ mở app từ máy chủ dev khi Expo Go đăng nhập **đúng tài khoản** đang chạy máy chủ trên laptop. Đã vào organization cũng không đủ. Bản đã phát hành (Cách 1) và điện thoại Android không bị giới hạn này.

---

## Bước 0: Tham gia nhóm trên Expo (mỗi người làm một lần)

App thuộc project `hop-dong-ai` của organization Expo **`pbao309s-team`**. Mỗi người dùng **tài khoản Expo của chính mình**, không ai cần mượn tài khoản người khác.

1. Tạo tài khoản Expo miễn phí tại https://expo.dev/signup. Đăng nhập bằng Google cũng được.
2. Gửi **username Expo** hoặc **email tài khoản Expo** của bạn cho chủ organization.
3. Chủ organization mời bạn vào. Bạn **chấp nhận lời mời** trong email, hoặc trên expo.dev ở biểu tượng chuông thông báo.

> Dành cho chủ organization: trên expo.dev, ở ô chọn tài khoản góc trên bên trái, chuyển sang **pbao309s-team** → **Members** → mời từng người bằng username hoặc email.

---

## Chuẩn bị Expo Go (mọi cách đều cần)

1. **Cài Expo Go** bản mới nhất trên điện thoại:
   - Android: Google Play, tìm "Expo Go".
   - iPhone: App Store, tìm "Expo Go".
   - Đã cài rồi thì cập nhật lên bản mới nhất. App dùng Expo SDK 58; bản Expo Go cũ sẽ báo "not compatible".
2. **Đăng nhập Expo Go** bằng tài khoản Expo **của bạn**, tài khoản đã vào `pbao309s-team` (Bước 0).
   - Mở Expo Go, bấm biểu tượng tài khoản ở góc trên bên phải, chọn đăng nhập. Chọn **Google** nếu bạn tạo tài khoản bằng Google.
   - Đăng nhập đúng thì ở màn **Home**, mục **Projects** sẽ có **hop dong AI** (`@pbao309s-team/hop-dong-ai`).

---

## Cách 1: Mở bản đã phát hành (iPhone và Android)

1. Trong Expo Go, màn **Home** → mục **Projects** → bấm **hop dong AI**.
2. Chọn branch **preview**, rồi bấm vào bản cập nhật mới nhất (nằm trên cùng).
3. **Đợi lần tải đầu**, khoảng 30 giây đến 1 phút.
4. **Thử trọn luồng:** tick đồng ý → ở màn chụp bấm **"Dùng hợp đồng mẫu"** → **Phân tích** → mở từng cảnh báo, bấm **Giữ** hoặc **Bỏ qua** → **Soạn tin nhắn**.

Không thấy branch hoặc bản cập nhật: mở trên trình duyệt trang https://expo.dev/accounts/pbao309s-team/projects/hop-dong-ai/updates, bấm vào bản mới nhất, rồi dùng nút **Preview** để lấy mã QR. Quét mã đó bằng Camera (iPhone) hoặc Expo Go (Android).

Bản phát hành **không tự cập nhật theo code mới**. Khi người làm App phát hành bản mới, bạn mở lại Projects → **hop dong AI** để chọn bản mới nhất.

### Dành cho người làm App: phát hành bản mới

Trên laptop đã đăng nhập Expo bằng tài khoản có quyền Owner, Admin hoặc Developer trong `pbao309s-team`. Trên Windows, mở PowerShell bằng đường dẫn **viết hoa ổ đĩa**:

```powershell
cd D:\codex-hackathon\apps\mobile
npx eas-cli@latest update --branch preview --message "Mô tả ngắn thay đổi" --environment preview
```

Lệnh chạy vài phút: build JS cho iOS và Android rồi tải lên Expo. Thấy chữ `Published!` là xong, báo nhóm mở lại app.

---

## Cách 2: Quét mã từ laptop đang chạy app (chỉ Android)

Cần laptop của người làm App đang bật máy chủ Expo (`npx expo start --tunnel`). Hỏi người đó lấy **mã QR** hoặc **đường link** bắt đầu bằng `exp://`.

- Trong Expo Go bấm **Scan QR code**, quét mã.
- Không quét được thì sao chép đường link `exp://...`, dán vào thanh địa chỉ **Chrome** trên điện thoại, chọn **Mở trong Expo Go**. Bấm thẳng vào link trong Zalo có thể không mở được.
- **Đừng mở đường link `http://...`** (dòng `Web:` trong terminal). Link đó mở bản web trong trình duyệt, chụp ảnh và chọn ảnh có thể không chạy đúng.

> Máy chủ phải đang chạy thì mới mở được. Laptop đó tắt terminal, ngủ hoặc mất mạng thì điện thoại báo lỗi `502 Bad Gateway`.
>
> iPhone quét mã này sẽ báo `these accounts need to match`. iPhone dùng Cách 1.

---

## Cách 3: Tự chạy trên laptop của mình

### Chuẩn bị (làm một lần)

- **Node.js 22 LTS:** https://nodejs.org. Kiểm tra bằng `node -v`.
- **Git:** https://git-scm.com. Kiểm tra bằng `git -v`.
- **Tài khoản Expo đã vào `pbao309s-team`** (Bước 0).
- **Expo Go** trên điện thoại, đăng nhập **cùng tài khoản Expo bạn đăng nhập trên laptop** (xem phần Chuẩn bị Expo Go). Với iPhone, hai bên phải trùng tài khoản.

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

Đợi terminal hiện mã QR rồi quét: Android quét trong Expo Go, iPhone quét bằng app **Camera**.

`--tunnel` chạy qua máy chủ của Expo, nên dùng được cả khi Wi-Fi trường hoặc ký túc xá chặn các máy nói chuyện với nhau. Nếu điện thoại và laptop cùng Wi-Fi ở nhà, có thể bỏ `--tunnel` để tải nhanh hơn.

Một số phím trong terminal: `r` tải lại app, `Ctrl+C` tắt máy chủ. Trên điện thoại, lắc máy để mở menu của Expo.

---

## Lỗi thường gặp

| Điện thoại hoặc terminal báo | Cách xử lý |
| --- | --- |
| `timed out` / không kết nối được | Dùng `npx expo start --tunnel`. Tắt VPN trên laptop (Cloudflare WARP, WireGuard...). Trên Windows, đổi mạng Wi-Fi sang **Private**: Settings → Network & internet → Wi-Fi → tên mạng → Network profile type |
| `You need to be signed in to Expo Go and Expo CLI` hoặc `You're signed in to Expo CLI as "..." but not signed in to Expo Go` | Đăng nhập Expo Go. Đang quét mã của **người khác** bằng iPhone thì dùng **Cách 1**. Tự chạy trên laptop của mình thì đăng nhập Expo Go cùng tài khoản với laptop |
| `You're signed in to Expo CLI as "A" and to Expo Go as "B" — these accounts need to match` (iPhone) | iPhone không mở được máy chủ của tài khoản khác. Dùng **Cách 1**. **Không** bấm "Sign in as ...", vì như vậy là dùng tài khoản của người khác |
| `HTTP response error 502: Bad Gateway` / `No server is connected` | Máy chủ trên laptop kia chưa chạy hoặc đã tắt. Người chạy máy chủ kiểm tra terminal `npx expo start --tunnel` còn mở, laptop không ngủ; đợi hiện mã QR rồi bấm **Try again** |
| `Web Bundling failed` / `Unable to resolve "react-native-web..."` | Bạn đang mở link `http://` (bản web) trong trình duyệt. Mở bằng Expo Go theo Cách 1. Nếu người chạy máy chủ thấy lỗi này: `git pull`, `npm install` rồi khởi động lại máy chủ |
| `Couldn't create a signed tunnel URL ... not logged in` | Laptop chưa đăng nhập Expo: chạy `npx expo login --browser` |
| `cmd.exe /c start ... exited with non-zero code: 1` (Windows, khi đăng nhập) | Chạy `$env:BROWSER = "none"` trước, rồi tự dán link vào trình duyệt (xem phần Đăng nhập) |
| `Project is incompatible with this version of Expo Go` | Cập nhật Expo Go lên bản mới nhất |
| `Unable to resolve module @rental/shared` (màn đỏ trên điện thoại, máy chạy Windows) | Máy chủ được mở từ đường dẫn `d:\` viết thường. Tắt máy chủ (`Ctrl+C`), chạy lại từ đường dẫn **viết hoa ổ đĩa**: `cd D:\codex-hackathon\apps\mobile` rồi `npx expo start --tunnel` |
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
