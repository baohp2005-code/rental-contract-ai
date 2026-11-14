# apps/mobile

App "Soi Hợp Đồng Trọ": Expo SDK 58 (React Native 0.88, React 19.3) + TypeScript + Expo Router. Phụ trách: vai **App**.

## Chạy thử trên điện thoại (Expo Go)

1. Cài app **Expo Go** trên điện thoại (Android: Google Play, iPhone: App Store). Điện thoại và máy tính dùng chung một mạng Wi-Fi.
2. Trên máy tính, ở **thư mục gốc repo**:

   ```bash
   npm install
   npm run start -w @rental/mobile
   ```

3. Quét mã QR hiện trong terminal (Android: quét bằng Expo Go; iPhone: quét bằng Camera).

Nếu mạng chặn kết nối giữa hai máy (Wi-Fi trường, ký túc xá), chạy `npx expo start --tunnel` trong `apps/mobile`.

## Dữ liệu mẫu và backend thật

Mặc định app gọi **backend chung của nhóm** trên Render: `https://rental-contract-api.onrender.com` (đặt ở `src/lib/api/index.ts`). Pull code về, `npm install`, `npx expo start` là chạy được, không cần file `.env` hay key nào. Server miễn phí ngủ sau 15 phút không ai gọi; lần phân tích đầu sau đó có thể mất thêm khoảng 1 phút.

Muốn đổi thì tạo `apps/mobile/.env` (xem `.env.example`) rồi chạy lại `npx expo start --clear`:

- `EXPO_PUBLIC_API_URL=mock`: **dữ liệu mẫu**, không cần mạng. Chụp ảnh gì thì kết quả vẫn là của hợp đồng mẫu trong `assets/samples/`, trên màn hình có dải thông báo màu vàng.
- `EXPO_PUBLIC_API_URL=http://<IP máy chạy backend>:8787`: backend chạy trên máy mình. Dùng IP trong mạng Wi-Fi (dòng "Cho điện thoại" khi chạy server), không dùng `localhost` (trên điện thoại, `localhost` là chính điện thoại).

## Cấu trúc

```
src/app/                 Màn hình (mỗi file là một route của Expo Router)
  index.tsx              1. Giới thiệu, câu miễn trừ, đồng ý xử lý ảnh
  capture.tsx            2. Chụp / chọn nhiều trang
  analyzing.tsx          3. Đang phân tích (4 bước)
  overview.tsx           4. Tổng quan: điều khoản chính + danh sách cảnh báo
  flag/[id].tsx          5. Chi tiết cảnh báo: tô dòng trên ảnh, Giữ / Bỏ / Sửa
  message.tsx            6. Tin nhắn gửi chủ nhà
src/components/ui/       Nút, thẻ, nhãn mức độ... dùng chung
src/components/*/        Thành phần riêng của từng màn hình
src/lib/store.ts         Trạng thái app (Zustand) + selector
src/lib/api/             Lớp gọi backend: http.ts (thật), mock.ts (dữ liệu mẫu)
src/lib/*.ts             Hàm thuần: định dạng, hình học tô dòng, xử lý ảnh...
src/mocks/               Kết quả phân tích mẫu + vị trí dòng của hợp đồng mẫu
src/theme/               Màu, khoảng cách, cỡ chữ
src/__tests__/           Test (jest)
```

Kiểu dữ liệu trao đổi với backend nằm ở `packages/shared` (`@rental/shared`).

## Lệnh

Chạy trong `apps/mobile`:

| Lệnh | Việc |
| --- | --- |
| `npm run start` | Mở dev server |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Chạy test |
| `npx expo-doctor` | Kiểm tra cấu hình và phiên bản thư viện |
| `npx expo install <tên-gói>` | Thêm thư viện (luôn dùng lệnh này thay cho `npm install` để lấy đúng bản hợp với SDK) |

## Giới hạn hiện tại

- **Chưa tự cắt viền và làm phẳng trang.** `expo-camera` bản 58 có sẵn `CameraView.scanDocumentAsync()` (dùng ML Kit / VisionKit), nhưng chưa thử xem Expo Go có hỗ trợ không. Nếu không, cần bản build riêng (EAS hoặc Android Studio).
- Chưa phát hiện được ảnh mờ ngay trên máy; việc này do backend trả lỗi `image_unreadable`. App chỉ nhắc nhẹ khi ảnh quá nhỏ hoặc nằm ngang.
- **Quyền riêng tư:** danh sách trang và kết quả phân tích chỉ nằm trong bộ nhớ, tắt app là mất. Riêng **file ảnh** (ảnh chụp, ảnh đã thu nhỏ) nằm trong thư mục cache của app cho tới khi hệ điều hành dọn; app chưa tự xóa. Muốn xóa hẳn thì cần thêm `expo-file-system`.
- **Chưa ai chạy app trên điện thoại thật.** Mọi thứ mới được kiểm tra bằng TypeScript, lint, test và đóng gói thử. Xem danh sách cần thử trên máy trong [`docs/bao-cao-app.md`](../../docs/bao-cao-app.md).
