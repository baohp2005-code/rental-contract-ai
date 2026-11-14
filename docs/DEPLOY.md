# Đưa backend lên mạng (Render) và cài cho thành viên mới

Mục tiêu: một người deploy backend lên Render, cả nhóm chỉ cần điền **một địa chỉ** vào app. Không ai khác phải giữ key, không phụ thuộc Wi-Fi hay IP máy tính, điện thoại dùng 4G cũng gọi được.

## A. Người deploy (làm một lần)

### 1. Chuẩn bị

- Code backend đã được push lên GitHub (nhánh `api/backend` hoặc nhánh đã gộp).
- **Key Google Vision** (`GOOGLE_CLOUD_VISION_API_KEY`) của project đã bật Cloud Vision API và thanh toán.
- Tùy chọn: **key OpenAI**. Không có thì backend chạy chế độ không AI (`LLM_PROVIDER=none`).
- Nên khóa key trước khi đưa lên mạng:
  - Google Cloud Console → APIs & Services → Credentials → chọn key → **API restrictions** → chỉ cho phép **Cloud Vision API**.
  - OpenAI: đặt **giới hạn chi tiêu hằng tháng** (Billing → Limits), ví dụ 5 USD.

### 2. Tạo dịch vụ trên Render

1. Đăng ký **render.com** bằng tài khoản GitHub (gói miễn phí, không cần thẻ).
2. Dashboard → **New** → **Blueprint** → chọn repo `rental-contract-ai`.
3. Chọn nhánh có file `render.yaml` (ví dụ `api/backend`). Nếu form không có ô chọn nhánh, thêm dòng `branch: api/backend` vào `render.yaml` (ngang hàng với `plan:`), push, rồi làm lại bước này.
4. Render đọc `render.yaml` và hỏi giá trị của các biến bí mật:
   - `GOOGLE_CLOUD_VISION_API_KEY`: dán key Google.
   - `OPENAI_API_KEY`: dán key OpenAI, hoặc để trống nếu chưa có.
5. Bấm **Apply**. Lần build đầu mất vài phút.
6. Khi xong, trang dịch vụ hiện địa chỉ dạng `https://rental-contract-api.onrender.com`, log có dòng `Địa chỉ công khai: ...`. Mở `<địa chỉ>/health`, thấy `{"ok":true}` là chạy.

### 3. Bật AI khi có key OpenAI

Trang dịch vụ trên Render → **Environment** → sửa `LLM_PROVIDER` thành `openai` (và điền `OPENAI_API_KEY` nếu chưa có) → **Save**. Render tự khởi động lại.

### 4. Báo cho nhóm

App đã đặt sẵn địa chỉ `https://rental-contract-api.onrender.com`, nên nhóm chỉ cần pull code về. Nếu địa chỉ Render của bạn khác, sửa `DEFAULT_API_URL` trong `apps/mobile/src/lib/api/index.ts`. **Không gửi key cho ai.**

## B. Thành viên mới (pull repo về và chạy app)

App mặc định gọi backend chung `https://rental-contract-api.onrender.com` (đặt ở `apps/mobile/src/lib/api/index.ts`), nên **không cần tài khoản Render, key hay file `.env`**:

Code backend và bản app đã nối backend đang ở nhánh **`api/backend`** (khi đã gộp vào nhánh chung thì dùng nhánh đó thay cho `api/backend`).

**Chưa có repo trên máy:**

```powershell
git clone -b api/backend https://github.com/baohp2005-code/rental-contract-ai.git
cd rental-contract-ai
npm install
cd apps\mobile
npx expo start --clear
```

**Đã có repo trên máy** (đang ở nhánh khác):

```powershell
cd rental-contract-ai
git fetch origin
git checkout api/backend
git pull
npm install
cd apps\mobile
npx expo start --clear
```

Phải chạy lại `npm install` sau khi đổi nhánh, vì nhánh này có thêm thư viện. Nếu `npm install` báo `Cannot read properties of null (reading 'edgesOut')`, chạy `npm ci` trước rồi chạy lại `npm install`.

Điện thoại và máy tính phải cùng mạng Wi-Fi (Expo Go tải app từ máy tính). Quét mã QR bằng **Expo Go**. Nếu Expo Go báo *"signed in to Expo Go but not signed in to Expo CLI"*: hoặc đăng xuất Expo Go trên điện thoại, hoặc chạy `npx expo login` bằng **tài khoản Expo của chính mình** (đăng ký bằng Google thì không có mật khẩu: vào **expo.dev** → cài đặt tài khoản → **Access tokens** → tạo token, rồi chạy `$env:EXPO_TOKEN="<token>"` trong cùng terminal trước `npx expo start`; muốn khỏi đặt lại mỗi lần thì chạy `setx EXPO_TOKEN "<token>"` một lần rồi mở lại VS Code). Không dùng chung token của người khác.

Muốn dùng dữ liệu mẫu (không cần mạng) hoặc backend chạy trên máy mình: tạo `apps/mobile/.env` từ `apps/mobile/.env.example`, đặt `EXPO_PUBLIC_API_URL=mock` hoặc `http://<IP>:8787`, rồi chạy lại `npx expo start --clear`.

**Nếu địa chỉ Render đổi** (tạo lại dịch vụ với tên khác): sửa `DEFAULT_API_URL` trong `apps/mobile/src/lib/api/index.ts`, commit và push.

## Lưu ý khi demo

- **Gói miễn phí ngủ sau 15 phút không ai gọi**, lần gọi đầu sau đó mất khoảng 1 phút để thức dậy. App tự gọi `/health` khi mở app, khi quay lại app và khi vào màn chụp (tối đa một lần mỗi 4 phút), nên server thường đã dậy lúc sinh viên chụp xong. Trước giờ demo vài phút vẫn nên mở `<địa chỉ>/health` cho chắc.
- Mỗi IP bị giới hạn **20 lượt phân tích** và **60 lượt soạn tin nhắn mỗi giờ** (đổi bằng `RATE_LIMIT_ANALYZE_PER_HOUR`, `RATE_LIMIT_MESSAGE_PER_HOUR` trên Render). Quá giới hạn thì app báo lỗi máy chủ; chờ hoặc tăng giới hạn.
- Render chỉ deploy lại khi đổi code backend, `data/`, `prompts/` hoặc file lock (xem `buildFilter` trong `render.yaml`). Sửa riêng app thì không làm backend khởi động lại.
- Xem log: trang dịch vụ trên Render → **Logs**. Mỗi lượt gọi in `→ POST /analyze`, `[B1]`, `[B3]`, `[xong]`.

## Chạy backend trên máy mình (khi phát triển backend)

Xem `apps/api/README.md`: tạo `apps/api/.env` từ `.env.example`, chạy `npm run dev -w @rental/api`, rồi đặt `EXPO_PUBLIC_API_URL=http://<IP ở dòng "Cho điện thoại">:8787` trong `apps/mobile/.env`. Mỗi lần đổi mạng thì IP đổi, phải sửa lại.
