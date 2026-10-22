# Quick Extract Ultra — hướng dẫn cho AI tiếp tục phát triển

Tài liệu này mô tả trạng thái dự án trong mã nguồn hiện tại. Khi có khác biệt, hãy kiểm tra mã và `CHANGELOG.md` trước. Repo GitHub dự kiến: `nyankuro/quick-extract-ultra` (công khai). Chủ dự án không biết lập trình: mọi thay đổi do AI thực hiện, commit, push và phát hành; giải thích cho chủ dự án bằng tiếng Việt đơn giản.

Bản gốc `H:\Quick Extract` (1.0.2, làm bằng Codex) được giữ nguyên, không sửa. Thư mục này là bản nâng cấp 2.x.

## 1. Ứng dụng này làm gì, dành cho ai

Trình quản lý file nén cho Windows, giống WinRAR/7-Zip/NanaZip/PeaZip nhưng giao diện hiện đại: giải nén hàng loạt, nén, xem bên trong, kiểm tra, mã băm, menu chuột phải Explorer, và khôi phục mật khẩu ZIP/RAR (cho file của chính người dùng). Chạy hoàn toàn cục bộ bằng 7-Zip đi kèm. Giao diện mặc định tiếng Anh, đổi được sang Nhật, Việt, Trung giản thể (zh-Hans) và Trung phồn thể (zh-Hant). Khi thêm khóa dịch phải cập nhật cả 5 file trong `locales/`; `zh-Hant.json` được sinh từ `zh-Hans.json` bằng OpenCC (`s2twp`) lúc build, không sửa tay.

## 2. Tính năng đã hoàn thành

- Thẻ Giải nén (từ bản 1.0.2): chọn file/quét/quét sâu, hàng đợi mật khẩu, Main Zip/New main, thêm chế độ Thông minh (`smart`).
- Thẻ Nén: 7Z, ZIP, TAR, TAR.GZ/XZ/BZ2, mức nén, mật khẩu AES-256, ẩn tên file (7Z), chia phần.
- Thẻ Xem bên trong: liệt kê bằng `7z l -slt`, điều hướng thư mục, tìm kiếm, giải nén mục chọn, kiểm tra.
- Thẻ Kiểm tra & mã băm: `7z t`, mã băm tính bằng Node (`crypto`, `zlib.crc32`).
- Cài đặt (lưu `settings.json` trong userData): ngôn ngữ, menu Explorer, mở thư mục sau khi giải nén, giữ Mark-of-the-Web (`-snz`), chuyển file nén vào Thùng rác.
- Menu chuột phải (HKCU, chỉ khi người dùng bật), lệnh dòng lệnh `--qe-action=<action> "<path>"`, single-instance gom nhiều file.
- Kéo thả trên mọi thẻ; ~30 định dạng đọc; `.tar.gz` tự giải nén lớp TAR; bộ nhiều phần mở qua phần đầu.

## 3. Cấu trúc dự án

- `electron/main.cjs`: IPC, batch giải nén, single-instance, lệnh Explorer, cài đặt, hàm `tr()` dịch log.
- `electron/extraction.cjs`: chạy 7-Zip (`runSevenZipCommand`), staging, smart, tar lồng, giải nén một phần qua list file.
- `electron/archive-ops.cjs`: liệt kê, kiểm tra, tạo file nén, mã băm.
- `electron/formats.cjs`: danh sách định dạng, tên gốc, nhận diện file nhiều phần.
- `electron/shell-icons.cjs` + `shell-icons.ps1`: biểu tượng/ảnh thu nhỏ thật của Windows cho bảng chọn file (PowerShell chạy suốt phiên, có cache). Không dùng `createThumbnailFromPath` (chỉ đọc cache, lỗi với file nén) hay chỉ `getFileIcon` (tối đa 32 px).
- `electron/shell-integration.cjs`: tạo file `.reg` (UTF-16LE) và `reg import`/`reg delete` dưới HKCU.
- `electron/password-tools.cjs` + `tool-sources.json`: dò công cụ khôi phục trong `tools/<id>/`; tải tự động từ nguồn chính thức qua HTTPS — bkcrack qua GitHub Releases (xác minh SHA-256 bằng `asset.digest`), hashcat và john qua scrape trang chính thức (`resolveScrapeAsset`: hashcat.net, openwall.com) rồi tải, không có checksum máy kiểm được nên chỉ ghi lại SHA-256, không chặn. `setupAllTools` tải hết các công cụ chưa có. Giải nén bằng 7-Zip, tải về `%APPDATA%\quick-extract-ultra\tools`.
- `electron/password-recovery.cjs`: engine khôi phục mật khẩu cho **ZIP và RAR**. `inspect()` nhận diện định dạng (zip/rar; RAR mã hóa header thì `listArchive` lỗi PASSWORD_REQUIRED → vẫn coi là rar). Chọn chiến lược: ZIP+ZipCrypto+file gốc → bkcrack; ZIP AES → hashcat (GPU) 13600; RAR và còn lại → john (CPU). Đọc hash bằng `zip2john`/`rar2john` (cùng thư mục run/ của john). **Ghi hash dạng token trần** (`$zip2$…`, `$rar5$…`) vì tiền tố `name:` của *2john chứa đường dẫn có dấu `:` ổ đĩa làm john hiểu sai. `mode: 'auto'` (mặc định) = wordlist+rules → digits → incremental Markov. Parser hashcat `--status-json`, john `--status`, bkcrack. Pause/resume bằng session restore; hủy taskkill+kill. Gọi mọi công cụ như tiến trình riêng. 7z chưa hỗ trợ (7z2john là Perl, bản john Windows không kèm Perl).
- `src/RecoverView.tsx`: giao diện khôi phục. Khi chưa có công cụ nào thì hiện màn hình cài đặt (Tải tự động tất cả / Tự thêm / nút (?) giải thích + mẹo an toàn); có công cụ rồi thì hiện giao diện đầy đủ (chọn ZIP, tiến độ, tốc độ/ETA, tạm dừng/hủy, hiện mật khẩu, giải nén ngay). Thẻ "Recover" được tô nổi bật (khung hổ phách) qua class `tab-special`.
- `tools/`: README + `wordlists/common-passwords.txt` (wordlist kèm sẵn, MIT). Công cụ bẻ khóa KHÔNG kèm sẵn.
- `electron/settings.cjs`, `password-queue.cjs`, `folder-browser.cjs`, `folder-view.*`, `preload.cjs`.
- `src/App.tsx` (khung, thẻ Giải nén, xử lý lệnh), `CompressView.tsx`, `BrowseView.tsx`, `ToolsView.tsx`, `SettingsDialog.tsx`, `ArchivePicker.tsx`, `i18n.tsx`, `types.d.ts`.
- `locales/{en,ja,vi}.json`: bản dịch dùng chung cho renderer và main. Thêm khóa mới vào cả 3 file.
- `scripts/extraction.test.cjs`, `scripts/ultra.test.cjs`, `scripts/recovery.test.cjs` (`npm test`), `scripts/smoke-test.cjs` (`npm run test:ui`, tạo ảnh trong `docs/screenshots/`).
- `build/icon.ico`, `build/installer.nsh` (gỡ menu Explorer khi gỡ cài đặt).
- `README.md` (EN), `docs/README.ja.md`, `docs/README.vi.md`; `.github/` (workflow phát hành, mẫu issue, FUNDING.yml giữ chỗ).

## 4. Công nghệ và cách chạy/build

Electron 43, React 19, TypeScript 6, Vite 8, `lucide-react`, `7zip-bin-full` (7-Zip 26.02). Chỉ `7zip-bin-full` là dependency lúc chạy; React/lucide được Vite đóng gói nên nằm trong devDependencies.

- `npm ci`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npm run test:ui`.
- `npm run dist`: bản cài NSIS (per-user) + portable dạng .zip vào `dist/`. Không dùng target `portable` (exe tự bung): mỗi lần chạy mất ~3 giây nên menu chuột phải rất chậm.
- `electron scripts/picker-preview.cjs [rộng] [cao]`: chụp mọi chế độ xem của bảng chọn file và kiểm tra không có chữ/biểu tượng tràn ô.
- `npm run package`: thư mục `dist/win-unpacked` + shortcut Desktop "Quick Extract Ultra".
- Phát hành: tăng `version` trong `package.json`, cập nhật `CHANGELOG.md`, commit, `git tag vX.Y.Z`, `git push --tags`; GitHub Actions build và đăng Release.

## 5. Quyết định thiết kế quan trọng

- **Dùng Electron cục bộ thay vì dịch vụ web:** archive không cần rời máy và app có thể tương tác với filesystem/Explorer.
- **Renderer không có Node.js trực tiếp:** `contextIsolation: true`, `nodeIntegration: false`; renderer chỉ gọi các hàm được preload công khai. Giữ ranh giới này và không expose `ipcRenderer`/filesystem tổng quát cho giao diện.
- **Không ghi nhớ công việc qua lần mở app:** đây là chủ ý để tránh trạng thái archive cũ, đường dẫn hoặc lựa chọn bị stale.
- **Chỉ tìm sâu khi người dùng bật Deep scan:** quét thường không đi vào thư mục con.
- **Không cho 7-Zip hỏi mật khẩu ẩn trong terminal:** app phát hiện yêu cầu mật khẩu, kết thúc tiến trình đó, hoàn tất archive thường trước, rồi đợi nhập mật khẩu trong UI. Mật khẩu truyền qua stdin, không nằm trong tham số tiến trình hay nhật ký, và chỉ giữ trong bộ nhớ của phiên.
- **Giải nén vào staging cạnh đích rồi đổi tên thư mục một lần:** thao tác rename trên cùng volume giúp công bố kết quả hoàn chỉnh, tránh để output dở dang và giảm rủi ro ghi đè. Chỉ dọn staging do job đó tạo; không xóa thư mục đích có sẵn khi thất bại.
- **Dùng `-aou` khi giải nén:** giữ lại các entry trùng tên bằng cách tự đổi tên thay vì ghi đè lẫn nhau.
- **Tên thư mục đầu ra bị trùng thì tạo hậu tố số:** không ghi đè output cũ; kiểm tra lại đích khi chạy lại sau khi chờ mật khẩu.
- **Chế độ Explorer chỉ áp dụng cho thư mục được mở từ app:** không đổi thiết lập hiển thị toàn cục của Windows.
- **Giao diện tối kiểu galaxy/glass:** màu cyan/tím/trắng bạc, trang trí vừa phải, mật độ phù hợp màn hình lớn; xem `DESIGN_PREFERENCES.md`.
- **7-Zip và list file:** `@listfile` phải đứng sau tên archive và không có `--` (sau `--` nó thành tên file thường). Mọi đường dẫn truyền vào đều tuyệt đối.
- **Mật khẩu ZIP chỉ ASCII:** 7-Zip báo "The parameter is incorrect" với mật khẩu ZIP có ký tự Unicode; app báo lỗi `ZIP_PASSWORD_ASCII` và gợi ý 7Z.
- **Lỗi mật khẩu qua IPC trả về dạng dữ liệu** `{ ok, code, message }` vì Electron làm mất `error.code`.
- **Lệnh từ Explorer chạy tuần tự** trong hàng đợi ở renderer (gộp các file cùng lệnh); Explorer mở một tiến trình cho mỗi file được chọn.
- **Menu Explorer chỉ ở HKCU và chỉ khi người dùng bật;** tự đăng ký lại theo đường dẫn app đang chạy mỗi lần khởi động; kiểm thử dùng khóa riêng `HKCU\Software\QuickExtractUltraTest`, không đụng menu thật.

## 6. Lỗi đã biết, việc dở dang, dự định

- Chưa có chữ ký số nên SmartScreen cảnh báo lần đầu chạy.
- Menu Windows 11 kiểu mới (không qua "Show more options") cần sparse package/IExplorerCommand; chưa làm.
- Mục ủng hộ trong README và `.github/FUNDING.yml` đang để giữ chỗ; chủ dự án sẽ tạo tài khoản rồi nhờ AI điền.
- Khôi phục mật khẩu: hashcat/john tải thủ công (không có nguồn checksum tự động ổn định); engine chạy thật đã kiểm chứng với bkcrack, hashcat/john mới kiểm bằng giả lập (cần GPU/bản john Windows để chạy thật). Pause/resume dựa vào session restore của công cụ.
- Giấy phép: tuyệt đối không nhúng hay biên dịch bkcrack/hashcat/john vào app (john là GPL). Chỉ gọi tiến trình.
- Ý tưởng tiếp: tạo SFX, chuyển đổi định dạng, xem trước ảnh/văn bản trong file nén, sửa file nén (thêm/xóa mục).

## 7. Những điểm tuyệt đối cần giữ an toàn

- Không giải nén thẳng vào thư mục đích cuối cùng. Giữ staging riêng, kiểm tra mã thoát/thành công của 7-Zip (bao gồm integrity/CRC), rồi mới rename staging sang đích.
- Không xóa hoặc ghi đè thư mục đích đã tồn tại khi job lỗi. Mỗi job chỉ được dọn staging mà chính nó tạo.
- Không đưa mật khẩu vào command-line args, log, file tạm hoặc lưu bền vững. Luồng hiện tại gửi mật khẩu qua stdin và xóa khỏi hàng đợi khi dùng/kết thúc.
- Giữ bảo vệ không cho chạy hai batch chồng nhau và giữ cách xử lý yêu cầu mật khẩu để tiến trình không treo vì prompt ẩn.
- Không nới lỏng Electron security settings hoặc expose API Node/IPC thô cho renderer. Khi thêm IPC, thêm API tối thiểu ở preload và cập nhật `src/types.d.ts`.
- Không bỏ `asarUnpack` cho binary 7-Zip và các script PowerShell (`folder-view.ps1`, `shell-icons.ps1`): chúng cần file vật lý có thể chạy trong bản đóng gói.
- Không thay đổi chế độ xem Explorer theo hướng sửa cài đặt toàn cục; helper chỉ nên tác động tới thư mục được mở.
- Nếu đổi giao thức sự kiện IPC hoặc trạng thái archive, cập nhật đồng bộ main, preload, types, UI và kiểm thử liên quan.
- Mỗi thay đổi ứng dụng phải cập nhật `CHANGELOG.md` theo mẫu hiện có: phiên bản/ngày, thay đổi, lỗi/cách sửa, xác minh và tác động đóng gói/shortcut nếu có.