# Antigravity Custom Wibu

Trình tùy biến giao diện nền động, màn hình khởi động (Boot HUD + khóa mật khẩu SHA-256) và hiệu ứng kính mờ dựng sẵn cho **Antigravity** mà không can thiệp vào tệp cài đặt gốc (`app.asar`) của ứng dụng. Xây dựng trên nền **Tawa Rust Edition** — thay thế hoàn toàn daemon Node.js, trình đóng gói Python và script VBS bằng hai tệp thực thi native (`agy-theme.exe` và `agy-theme-daemon.exe`) dùng bộ nhớ thấp và nạp tài nguyên theo nhu cầu (**Lazy HTTP**).

![Minh họa giao diện Antigravity Custom Theme](docs/demo.webp)

> Mã nguồn này được fork và mở rộng từ [furinamikuvn/antigravity-custom-theme-mod](https://github.com/furinamikuvn/antigravity-custom-theme-mod) (vốn phát triển dựa trên dự án mã nguồn mở [antigravity-custom-theme-skill](https://github.com/giakiet22102006/antigravity-custom-theme-skill), giấy phép **MIT**).

---

## Điểm mới & Bản sửa lỗi ở bản fork này

- **Khóa mật khẩu Boot HUD (SHA-256) & tùy chỉnh Operator:** Thiết lập tên truy cập (`Operator`) và mật khẩu ngay tại màn hình `XÁC MINH DANH TÍNH` (lưu dạng hash SHA-256 trong `theme_config.json`, khóa nút `SKIP` cho đến khi xác thực thành công).
- **Đổi mật khẩu 2 bước tuần tự trên Boot HUD (`F2` hoặc `↻ ĐỔI MÃ ĐỊNH DANH · REKEY UID`):**
  - *Pha A (`XÁC THỰC QUYỀN ĐỔI MÃ`):* Bắt buộc xác minh đúng mật khẩu hiện tại trước khi mở bước tiếp theo.
  - *Pha B (`THIẾT LẬP MÃ MỚI`):* Nhập mã mới + nhập lại xác nhận kèm trạng thái khớp realtime (`MATCHED ✓` / `MISMATCH` / `SAME AS CURRENT`), hỗ trợ giữ phím **`Alt`** để soi nhanh ký tự và **`Esc`** để hủy quay lại màn đăng nhập.
- **Quản lý Boot Pass trong Custom Theme Studio:** Thêm bảng `🔒 Boot Pass` để đổi tên `Operator`, đặt hoặc xóa mật khẩu trực tiếp trong phần cài đặt.
- **Sửa lỗi Boot Intro không tự chạy lúc vừa mở app:** Vá lỗi kiểm tra trùng cờ `__AGY_BOOT_PLAYED__` giữa `engine/core.js` và module nạp lười `engine/boot.js` giúp intro tự khởi chạy ngay khi mở Antigravity.
- **Khắc phục lỗi nền video bị tối nháy khi hover / mở tooltip trên Windows:** Cố định thẻ `<video>` trên 1 đường render GPU nhất quán (`isolation: isolate` + `filter: brightness(1.001)`), tránh Windows DirectComposition (MPO) chuyển đổi qua lại làm lệch độ sáng nền khi tương tác UI.
- **Sửa lỗi menu thanh tiêu đề bị trong suốt:** Khôi phục nền tối đặc (`var(--card)`) kèm viền và đổ bóng rõ nét cho các menu `Antigravity`, `Workspace`, `View`, `Window` và các popup `.surface-opaque` / `[data-browser-occluder="true"]`, vẫn giữ **0 `:has()`** và **0 live `backdrop-filter: blur()`**.

---

## Phím tắt nhanh (Boot HUD & Studio)

| Khu vực | Phím tắt | Tác dụng |
| :--- | :--- | :--- |
| **Boot HUD (Cấp quyền)** | `Enter` / `Space` | Đi tiếp sang bước xác minh danh tính |
| **Boot HUD (Xác minh)** | `Enter` | Xác nhận mật khẩu / Lưu pass lần đầu |
| **Boot HUD (Xác minh)** | **`F2`** | Mở luồng **Đổi mật khẩu 2 bước (`REKEY UID`)** |
| **Đổi MK (Pha B — Mã mới)** | **Giữ `Alt`** | Soi nhanh ký tự đang gõ (thả ra tự ẩn) |
| **Đổi MK / Studio / Boot** | `Esc` | Quay lại màn đăng nhập / Đóng Studio / Bỏ qua (nếu không khóa) |

> Xem hướng dẫn đầy đủ về toàn bộ tổ hợp phím, luồng đổi mật khẩu 2 bước và cách mở khóa khi quên pass tại **[docs/GUIDE.md](docs/GUIDE.md)**.

---

## Giới thiệu kiến trúc

Hệ thống vận hành theo mô hình hai lớp tách biệt nhằm giữ ổn định khi Antigravity cập nhật phiên bản mới:

1. **Daemon nền & HTTP Media Server Rust (`src/daemon.rs`, `src/media.rs`, `agy-theme-daemon.exe`):**
   - Biên dịch với `windows_subsystem = "windows"` nên chạy ngầm không cửa sổ console, không cần `Node.js`, `Python` hay `wscript.exe`.
   - Tự động dò tệp `DevToolsActivePort` của Antigravity, chỉ gắn vào các trang giao diện hợp lệ (`https://127.0.0.1:*`, `workbench`, `launchpad`) và bỏ qua hoàn toàn dev server cục bộ (`http://127.0.0.1:*`).
   - Bật `Page.setBypassCSP({ enabled: true })`, bỏ `Runtime.enable` để giảm giữ tham chiếu heap V8, dọn `Page.removeScriptToEvaluateOnNewDocument` cũ trước khi nạp lại.
   - Mở HTTP Media Server cục bộ bằng `std::net::TcpListener` trên `127.0.0.1:47821` (hoặc `AGY_MEDIA_PORT`) phục vụ `/assets/*` và `/user_media/*` theo luồng 64 KiB, hỗ trợ `Range 206` cho video, `Cache-Control: public, max-age=86400`, `/user_media_list`, `POST /upload` (băm MD5 theo luồng 64 KiB chống trùng) và `POST /delete_media`.
   - Theo dõi `dist/theme_payload.js` theo cặp `(modified, len)` để hot-reload đúng lúc, lưu thiết lập qua `Runtime.addBinding` (`agySaveThemeConfig`) bằng ghi file atomic vào `theme_config.json` và đồng bộ delta (`skipSave: true`) giữa các cửa sổ.

2. **Bộ máy giao diện runtime (`engine/core.js`) & Trình đóng gói Lazy HTTP (`src/builder.rs`):**
   - `agy-theme.exe build` trộn `themes/themes.json` + `engine/core.js` thành `dist/theme_payload.js` gọn nhẹ (**278.6 KB**): chỉ nhúng nội tuyến các SVG nhỏ và 3 subset phông Mali WOFF2; toàn bộ ảnh nền, video MP4, starfield, icon và voice được giữ làm đường dẫn tương đối để tải theo nhu cầu qua HTTP Media Server.
   - `engine/core.js` duy trì **0 `:has()`** toàn cục và **0 live `backdrop-filter: blur(...)`** toàn cục, dùng `ResizeObserver` thay cho polling trong `tick()`, dùng `blob:` URL kèm LRU revoke, tạm dừng `<video>` khi `document.hidden`, và pre-bake lớp kính mờ trên canvas offscreen (`syncPrebakedGlass`).

---

## Tính năng chính

- **Chế độ nền Ảnh tĩnh và Video động tách biệt:** Quản lý riêng danh sách ảnh tĩnh và video đã tải lên; tự động lưu lịch sử mỗi khi chọn tệp mới, hỗ trợ xem trước và xóa trực tiếp từng mục khỏi ổ cứng.
- **Preset mặc định đi kèm:** Bao gồm `Gemini-chan Live` (`themes/assets/wallpapergeminichan.mp4`), `Furina Live` (`themes/assets/furina-bg.mp4`), `WLOP Cosmic` và `Midnight Obsidian`.
- **Hiệu ứng vẽ nét và loang màu (Sketch Reveal):** Trích xuất đường nét trực tiếp từ khung hình video hoặc ảnh nền hiện tại qua thuật toán biên cạnh đa kênh màu kết hợp làm mượt đường cong.
- **Màn hình khởi động (Boot HUD):** Giao diện khởi động Starfield kèm 4 đoạn voice Arisu-Tawa, có thể bật/tắt hoặc phát lại từ bảng cài đặt.
- **Câu chào tùy chỉnh (Custom Greeting):** Cho phép tự soạn danh sách câu chào ngẫu nhiên hiển thị trên màn hình hội thoại trống bằng bộ phông chữ viết tay Mali đóng gói ngoại tuyến.
- **Âm thanh báo hoàn thành tác vụ (Task Voice):** Hỗ trợ nạp nhiều tệp âm thanh (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`), phát ngẫu nhiên khi tác vụ kết thúc và giải phóng đối tượng âm thanh ngay sau khi phát xong.
- **Tùy biến khung chat và ảnh đại diện:** Thay đổi khung nhập liệu, bong bóng tin nhắn, ảnh đại diện User/Agent (tự nén WebP), độ tối nền và độ mờ kính.

---

## Yêu cầu hệ thống

- **Antigravity** đang hoạt động với cổng gỡ lỗi CDP (`DevToolsActivePort`; lệnh `install` tự động gắn cờ `--remote-debugging-port=0` vào shortcut nếu thiếu).
- **Để chạy trực tiếp trên Windows / macOS / Linux:** Chỉ cần binary trong `target/release/` (`agy-theme.exe` + `agy-theme-daemon.exe`) — **không cần Node.js hay Python khi vận hành**.
- **Chỉ cần Rust toolchain (`cargo` / `rustc`) khi tự biên dịch lại từ mã nguồn.**

---

## Hướng dẫn cài đặt và sử dụng

### Cách nhanh nhất trên Windows: Launcher tương tác

Chạy trực tiếp tệp **`agy-theme.bat`** ở thư mục gốc (hoặc gọi từ PowerShell):

```powershell
.\agy-theme.bat install
```

Nếu chưa có binary trong `target/release/`, `agy-theme.bat` sẽ tự chạy `cargo build --release` ở lần đầu rồi mở menu hoặc thực thi lệnh tương ứng.

### Cài đặt qua script / CLI trực tiếp

1. **Biên dịch bản Release (nếu tự build từ mã nguồn):**

```powershell
cargo build --release
```

2. **Đóng gói `dist/theme_payload.js` (Lazy HTTP):**

```powershell
.\target\release\agy-theme.exe build
```

3. **Cài đặt tự khởi động và bật daemon nền:**

- **Trên Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\install-win.ps1"
```

Lệnh trên gọi `agy-theme.exe install`: gắn cờ `--remote-debugging-port=0` vào shortcut Antigravity nếu thiếu, đăng ký Windows Scheduled Task `AntigravityCustomTheme` (chạy `agy-theme-daemon.exe` khi đăng nhập, có fallback Startup `.lnk` nếu thiếu quyền), đồng thời dọn `silent-start.vbs` cũ.

- **Trên macOS / Linux (Bash):**

```bash
bash scripts/install-unix.sh
```

Hỗ trợ `install` (LaunchAgent trên macOS / `systemd --user` trên Linux), `--foreground`, `stop`, `status` và `uninstall`.

4. **Kiểm tra trạng thái daemon, RAM và live CDP:**

```powershell
.\target\release\agy-theme.exe status
.\target\release\agy-theme.exe verify
.\target\release\agy-theme.exe themes
```

Kết quả đạt yêu cầu của `verify` sẽ báo `PASS` kèm `themeActive: true`, `hasSelectorCount: 0`, `hasLiveBlurRule: false`, `settingsTriggerPresent: true` và `composerPresent: true`. Để mở bảng tùy chỉnh trong Antigravity, bấm mục **Custom theme** ở thanh bên trái.

---

## Gỡ cài đặt

Để dừng daemon nền, gỡ Scheduled Task / LaunchAgent / systemd service và khôi phục giao diện mặc định trên các cửa sổ Antigravity đang mở:

```powershell
.\target\release\agy-theme.exe uninstall
```

---

## Đối chứng hiệu năng thực tế (Node/Python cũ vs Tawa Rust Edition)

Số liệu đo trực tiếp trên cùng máy Windows và cửa sổ Antigravity thật (CDP port `53262`):

| Hạng mục đo | Trước nâng cấp (Node/Python) | Sau nâng cấp (Tawa Rust Edition) | Mức cải thiện |
| :--- | :--- | :--- | :--- |
| **Working Set RAM daemon** | `63.06 MB` (P0: `60.71 MB`) | **`1.62 – 1.64 MB`** | Giảm **~38.5×** |
| **Private Memory daemon** | `86.42 MB` (P0: `80.68 MB`) | **`0.95 – 1.34 MB`** | Giảm **~64.5× – 90.9×** |
| **`dist/theme_payload.js`** | `1,786,039 bytes` (`1,744.2 KB`) | **`285,252 bytes` (`278.6 KB`)** | Giảm **6.26×** |
| **Thời gian build payload** | Python script + Pillow | **`1 ms`** (`agy-theme.exe build`) | Tức thì |
| **`<style>` active (`styleBytes`)** | `53,020 bytes` | **`22,610 bytes`** | Giảm **57.4%** |
| **CSS `:has()` toàn cục** | `7` rules | **`0`** (`hasSelectorCount: 0`) | Loại bỏ **100%** |
| **Live `backdrop-filter: blur()`** | `1` (`blur(10px)` ở modal) | **`0`** (`hasLiveBlurRule: false`) | Loại bỏ **100%** |
| **Nút sidebar `Custom theme`** | `settingsTriggerPresent: false` | **`settingsTriggerPresent: true`** | Khắc phục 100% |
| **Dung lượng `themes/user_media/`** | `16` file (6 MP4 trùng MD5) | **`10` file** (thu hồi `48.58 MB`) | `0` bản trùng |

---

## Cấu trúc thư mục

```text
.
├── src/
│   ├── lib.rs                 # Thư viện agy_theme và UTC timestamp helper
│   ├── main.rs                # CLI agy-theme (build, daemon, start, stop, status, install, uninstall, verify, themes)
│   ├── bin/daemon.rs          # Binary chạy ngầm không cửa sổ agy-theme-daemon
│   ├── builder.rs             # Trình đóng gói Lazy HTTP payload (themes.json + core.js -> dist/theme_payload.js)
│   ├── media.rs               # HTTP Media Server thuần std::net (Range 206, upload MD5 64 KiB, delete_media)
│   ├── daemon.rs              # Vòng lặp quản lý CDP sessions, watch file theo (mtime, size), delta sync
│   ├── cdp.rs                 # HTTP /json, filter target Antigravity, evaluate_once, verify_live
│   ├── ws.rs                  # RFC 6455 WebSocket client thuần Rust (SHA-1 + masked frame 8 KiB)
│   ├── config.rs              # Đọc/ghép atomic theme_config.json và xoay vòng daemon.log
│   ├── installer.rs           # Cài/gỡ Task Scheduler, shortcut CDP flag, LaunchAgent / systemd
│   ├── md5.rs                 # RFC 1321 MD5 thuần Rust đọc luồng 64 KiB
│   ├── paths.rs               # Tự dò root, DevToolsActivePort và sibling binaries
│   └── sys.rs                 # Win32 / Unix PID, memory stats, working-set trim, detached spawn
├── tests/
│   └── integration_tests.rs   # 6 integration test CLI, Lazy HTTP builder, HTTP Range/upload/delete, CDP, config/MD5
├── engine/
│   ├── core.js                # Bộ máy giao diện runtime cốt lõi (0 :has(), 0 live blur, pre-baked glass)
│   ├── boot.js                # Module nạp lười Boot HUD, xác thực SHA-256 và đổi mật khẩu 2 bước (Rekey)
│   ├── reveal.js              # Module nạp lười hiệu ứng vẽ nét → loang màu (Sketch Reveal)
│   └── studio.js              # Module nạp lười bảng cài đặt Custom Theme Studio & Boot Pass
├── scripts/
│   ├── install-win.ps1        # Wrapper PowerShell gọi target/release/agy-theme.exe install
│   └── install-unix.sh        # Wrapper Bash cho macOS / Linux
├── themes/
│   ├── themes.json            # Khai báo 4 preset giao diện mặc định
│   ├── assets/                # Video, poster, phông chữ Mali WOFF2 và âm thanh mặc định
│   └── user_media/            # Tệp người dùng tải lên
├── docs/
│   ├── demo.webp              # Ảnh động minh họa giao diện cho README
│   └── GUIDE.md               # Hướng dẫn chi tiết Boot HUD, khóa SHA-256 & bảng phím tắt
├── references/
│   └── theme-schema.md        # Tài liệu cấu trúc dữ liệu themes.json
├── agy-theme.bat              # Trình khởi chạy & menu CLI nhanh trên Windows
├── Cargo.toml                 # Khai báo crate agy-theme & cấu hình release LTO/opt-level="s"
├── SKILL.md                   # Đặc tả cấu trúc Skill
└── LICENSE                    # Giấy phép MIT
```

---

## Giấy phép

Phát hành theo giấy phép **MIT** — xem chi tiết trong tệp [LICENSE](LICENSE).
