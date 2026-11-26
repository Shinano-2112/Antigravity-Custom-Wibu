# Hướng dẫn sử dụng Boot HUD, Khóa mật khẩu & Phím tắt

Tài liệu này hướng dẫn chi tiết cách thao tác trên màn hình khởi động **Boot HUD**, thiết lập / đổi mật khẩu **SHA-256**, toàn bộ tổ hợp phím hỗ trợ và cách mở khóa dự phòng khi lỡ quên mật khẩu.

---

## 1. Bảng tổ hợp phím tắt

### Màn hình khởi động (Boot HUD)

| Màn hình / Pha | Phím / Tổ hợp phím | Chức năng |
| :--- | :--- | :--- |
| **Bước 1 — `YÊU CẦU QUYỀN TRUY CẬP`** | `Enter` hoặc `Space` | Cấp quyền và chuyển sang bước xác minh danh tính. |
| **Bước 1 — `YÊU CẦU QUYỀN TRUY CẬP`** | `Esc` | Bỏ qua Boot HUD *(chỉ dùng được khi **chưa đặt mật khẩu**)*. |
| **Bước 2 — `XÁC MINH DANH TÍNH`** | `Enter` | Đăng nhập vào Antigravity (hoặc lưu mật khẩu mới nếu là lần đầu thiết lập). |
| **Bước 2 — `XÁC MINH DANH TÍNH`** | **`F2`** | Mở nhanh giao diện **Đổi mật khẩu 2 bước (`REKEY UID`)** *(chỉ hoạt động khi đã đặt mật khẩu)*. |
| **Bước 2 — `XÁC MINH DANH TÍNH`** | `Esc` | Nếu chưa đặt mật khẩu: bỏ qua Boot HUD. Nếu đang khóa: tự focus lại ô nhập mật khẩu. |
| **Đổi MK — Pha A (`XÁC THỰC QUYỀN ĐỔI MÃ`)** | `Enter` | Xác nhận mật khẩu hiện tại để chuyển sang Pha B. |
| **Đổi MK — Pha A (`XÁC THỰC QUYỀN ĐỔI MÃ`)** | `Esc` | Hủy đổi mật khẩu và quay lại màn hình `XÁC MINH DANH TÍNH`. |
| **Đổi MK — Pha B (`THIẾT LẬP MÃ MỚI`)** | `Enter` *(tại ô `MÃ MỚI`)* | Kiểm tra hợp lệ rồi tự nhảy con trỏ xuống ô `NHẬP LẠI / CONFIRM`. |
| **Đổi MK — Pha B (`THIẾT LẬP MÃ MỚI`)** | `Enter` *(tại ô `NHẬP LẠI`)* | Lưu mật khẩu mới (SHA-256) và đi thẳng vào Antigravity không cần nhập lại. |
| **Đổi MK — Pha B (`THIẾT LẬP MÃ MỚI`)** | **Giữ `Alt`** | Soi nhanh ký tự đang gõ trên cả 2 ô mật khẩu mới; thả phím `Alt` tự động ẩn lại. |
| **Đổi MK — Pha B (`THIẾT LẬP MÃ MỚI`)** | `Esc` | Hủy thay đổi và quay lại `XÁC MINH DANH TÍNH` (giữ nguyên mật khẩu cũ). |

### Custom Theme Studio & Khung chat

| Khu vực | Phím / Tổ hợp phím | Chức năng |
| :--- | :--- | :--- |
| **Custom Theme Studio** | `Esc` | Đóng nhanh cửa sổ cài đặt theme. |
| **Ô `Tên truy cập / Operator`** | `Enter` | Lưu nhanh tên Operator hiển thị trên Boot HUD. |
| **Ô `Mật khẩu Boot HUD`** | `Enter` | Lưu nhanh mật khẩu mới từ bảng Studio. |
| **Khung chat Antigravity** | `Ctrl + D` *(macOS: `Cmd + D`)* | Hủy tác vụ đang chạy mà không kích hoạt nhầm âm thanh `Task Voice`. |

---

## 2. Quy trình đặt & đổi mật khẩu Boot HUD

### Lần đầu đặt mật khẩu
1. Mở Antigravity → màn hình Boot HUD hiện ra, nhấn `Enter` / `Space` ở bước **Cấp quyền**.
2. Tại màn hình **`XÁC MINH DANH TÍNH`**, nhập mật khẩu muốn đặt vào dòng **`MÃ ĐỊNH DANH / UID`** rồi nhấn **`Enter`** (hoặc bấm `LƯU & XÁC NHẬN · SET PASSCODE`).
3. Mật khẩu được băm bằng **SHA-256** (kèm tiền tố riêng) và lưu vào tệp `theme_config.json`. Từ lần mở sau, nút `SKIP` sẽ tự động khóa cho đến khi bạn nhập đúng mật khẩu.

### Đổi mật khẩu ngay trên màn hình Boot HUD (2 bước)
1. Tại màn hình **`XÁC MINH DANH TÍNH`**, nhấn **`F2`** hoặc bấm dòng **`↻ ĐỔI MÃ ĐỊNH DANH · REKEY UID`** phía dưới nút xác nhận.
2. **Pha A (`XÁC THỰC QUYỀN ĐỔI MÃ`):** Nhập **mật khẩu hiện tại** → nhấn `Enter`.
3. **Pha B (`THIẾT LẬP MÃ MỚI`):**
   - Nhập **mật khẩu mới** vào dòng `MÃ MỚI / NEW UID` → nhấn `Enter`.
   - Nhập lại vào dòng `NHẬP LẠI / CONFIRM` và kiểm tra dòng **`TRẠNG THÁI / SYNC`**:
     - `AWAITING INPUT` — Chưa nhập dữ liệu.
     - `CONFIRM REQUIRED` — Cần nhập lại để xác nhận.
     - `SAME AS CURRENT` — Mật khẩu mới bị trùng mật khẩu cũ (cần chọn mã khác).
     - `MISMATCH` — Hai lần nhập chưa khớp.
     - `MATCHED ✓` — Khớp hợp lệ, sẵn sàng lưu.
   - Có thể **giữ phím `Alt`** để soi nhanh ký tự đang gõ tránh gõ nhầm.
   - Nhấn **`Enter`** (hoặc bấm `LƯU & VÀO · UPDATE KEY`) để cập nhật và vào thẳng Antigravity.

### Quản lý trong Custom Theme Studio
* Bấm mục **Custom theme** ở thanh sidebar bên trái → mở rộng mục **`🔒 Boot Pass ▾`** để:
  * Đổi **Tên truy cập / Operator** (mặc định tự nhận tên tài khoản hệ điều hành hoặc `SENSEI`).
  * Đặt mật khẩu mới, bấm biểu tượng `👁` để ẩn/hiện hoặc bấm **`Xóa pass`** để tắt khóa.
  * Bấm **`Replay Intro`** nếu muốn xem lại hoặc kiểm tra màn hình Boot HUD bất kỳ lúc nào.

---

## 3. Khôi phục nếu lỡ quên mật khẩu

Vì mật khẩu được lưu cục bộ dạng hash SHA-256 trên chính máy của bạn, nếu lỡ quên bạn có thể mở khóa lại trong vài giây:

1. Mở tệp `theme_config.json` trong thư mục cài đặt mod.
2. Xóa dòng `"bootPassHash": "..."` (hoặc đổi thành `"bootPassHash": ""`) rồi lưu tệp.
3. Khởi động lại Antigravity — màn hình khóa sẽ trở về trạng thái chưa đặt mật khẩu để bạn tạo mã mới.
