<div align="center">

<img src="icon.png" width="96" alt="Biểu tượng Quick Extract Ultra" />

# Quick Extract Ultra

**Phần mềm nén và giải nén miễn phí, dễ dùng cho Windows. Giải nén, nén, xem bên trong và kiểm tra ZIP, 7Z, RAR cùng hơn 30 định dạng khác.**

[English](../README.md) · [日本語](README.ja.md) · **Tiếng Việt** · 简体中文 · 繁體中文

[![Bản mới nhất](https://img.shields.io/github/v/release/nyankuro/quick-extract-ultra?label=t%E1%BA%A3i%20v%E1%BB%81&color=19c8ff)](https://github.com/nyankuro/quick-extract-ultra/releases/latest)
[![License: PolyForm Shield 1.0.0](https://img.shields.io/badge/license-PolyForm%20Shield%201.0.0-a948e8)](../LICENSE)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4)

<img src="screenshots/extract-vi.png" alt="Cửa sổ chính của Quick Extract Ultra" width="900" />

</div>

---

## Vì sao nên dùng Quick Extract Ultra?

Làm được những việc như WinRAR hay 7-Zip, nhưng với giao diện hiện đại cho bạn thấy rõ mọi thứ đang diễn ra:

- 🗂️ **Giải nén hàng chục file chỉ với một cú bấm**, mỗi file vào một thư mục riêng, có thanh tiến độ.
- 🔐 **Mật khẩu không làm kẹt hàng chờ.** File có mật khẩu sẽ đợi bạn, các file khác vẫn tiếp tục giải nén.
- 🧠 **Giải nén thông minh** tránh tình trạng "thư mục nằm trong thư mục trùng tên".
- 🛡️ **An toàn ngay từ thiết kế.** Không bao giờ ghi đè, không để lại kết quả dở dang, và file tải từ mạng vẫn giữ cảnh báo an toàn của Windows.
- 🌏 **Năm ngôn ngữ** — English, 日本語, Tiếng Việt, 简体中文, 繁體中文 — đổi bất cứ lúc nào.
- 💻 **Chạy hoàn toàn trên máy.** File của bạn không bao giờ bị gửi đi đâu.

## Tính năng

| | Làm được gì |
|---|---|
| **Giải nén** | Chọn file, quét thư mục hoặc quét sâu cả thư mục con. Giải nén hàng loạt, có tiến độ từng file, thư mục gom chung "Main Zip" và chế độ thông minh. |
| **Nén** | Tạo file **7Z, ZIP, TAR, TAR.GZ, TAR.XZ, TAR.BZ2**. Sáu mức nén, mật khẩu AES-256, ẩn tên file (7Z) và chia nhỏ (100 MB, 700 MB, 1 GB, 4 GB). |
| **Xem bên trong** | Xem nội dung mà không cần giải nén: duyệt thư mục, tìm kiếm, dung lượng, ngày sửa, đánh dấu file có mã hóa. Chỉ giải nén những gì bạn chọn. |
| **Kiểm tra** | Đối chiếu từng file bên trong với mã kiểm tra đã lưu mà không cần giải nén. |
| **Mã băm** | CRC32, MD5, SHA-1, SHA-256 và SHA-512, có nút sao chép và ô "dán vào để so sánh". |
| **Menu chuột phải** | Chuột phải → *Giải nén tại đây (thông minh)*, *Giải nén vào thư mục*, *Mở*, *Kiểm tra*, *Thêm vào file nén…*, *Thêm vào ZIP*, *Thêm vào 7Z*, *Tính mã băm*. Bật trong Cài đặt. |
| **Kéo thả** | Thả file vào bất kỳ thẻ nào: file nén để giải nén, file để nén, file nén để xem, file để tính mã băm. |
| **File nén nhiều phần** | `.part1.rar`, `.7z.001`… được mở từ phần đầu tiên; các phần sau tự ẩn khỏi danh sách quét. |

**Mở được:** ZIP, ZIPX, 7Z, RAR (cả RAR5), TAR, GZ, TGZ, BZ2, XZ, TXZ, ZST, LZ, LZMA, Z, CAB, ISO, WIM, ARJ, LZH/LHA, CPIO, RPM, DEB, DMG, VHD, VHDX, XAR và file chia nhỏ `.001`.

<details>
<summary><b>Thêm ảnh chụp màn hình</b></summary>

| Nén | Xem bên trong |
|---|---|
| <img src="screenshots/compress.png" width="440" /> | <img src="screenshots/browse.png" width="440" /> |
| **Kiểm tra & mã băm** | **Hàng chờ mật khẩu** |
| <img src="screenshots/tools.png" width="440" /> | <img src="screenshots/extract-password.png" width="440" /> |

</details>

## Khôi phục mật khẩu ZIP đã quên

Thẻ **Khôi phục mật khẩu ZIP** giúp bạn mở lại một file ZIP **thuộc quyền của bạn hoặc bạn được phép mở** (app có dòng nhắc điều này). App không tự chứa mã bẻ khóa nào — nó chạy ba công cụ mã nguồn mở nổi tiếng như các chương trình riêng, nên giấy phép của chúng (kể cả GPL của John) không lây sang app:

- **bkcrack** — nếu ZIP dùng định dạng cũ ZipCrypto và bạn còn một file gốc (chưa mã hóa) nằm trong đó, công cụ này khôi phục mật khẩu rất nhanh.
- **hashcat** (GPU) và **John the Ripper** (CPU) — nếu không, app đọc mã băm của ZIP bằng `zip2john` của John rồi dò mật khẩu: thử danh sách mật khẩu trước (có kèm sẵn một danh sách nhỏ các mật khẩu phổ biến), sau đó dò toàn bộ theo bộ ký tự và độ dài bạn chọn. Với ZIP mã hóa AES thì dùng GPU qua hashcat; nếu không thì dùng John trên CPU.

Các công cụ này **không kèm sẵn** và không bao giờ được host lại. Trong app, bạn thêm từng công cụ bằng **tải tự động** (hộp xác nhận ghi rõ tên, giấy phép, dung lượng và nguồn chính thức, và file tải được kiểm tra với mã SHA-256 mà nguồn công bố) hoặc **thủ công** từ trang chính thức. File tải lưu trong `%APPDATA%\quick-extract-ultra\tools\`. John là công cụ nền (`zip2john` của nó đọc mã băm); hashcat là phần tăng tốc GPU tùy chọn; bkcrack là đường nhanh độc lập.

Thẻ này hiện tiến độ, tốc độ và thời gian ước tính, kèm Tạm dừng, Tiếp tục và Hủy. Khi tìm ra mật khẩu, nó được hiển thị rõ ràng kèm nút sao chép và nút **Giải nén ngay**.

## Tải về và cài đặt

1. Vào trang [**bản phát hành mới nhất**](https://github.com/nyankuro/quick-extract-ultra/releases/latest).
2. Tải một trong hai file:
   - **`QuickExtractUltra-Setup-x.y.z.exe`**: bản cài đặt (nên dùng). Tạo lối tắt ở menu Start và màn hình Desktop. Không cần quyền quản trị.
   - **`QuickExtractUltra-Portable-x.y.z-win-x64.zip`**: bản portable. Giải nén ra bất kỳ đâu (kể cả USB) rồi chạy `Quick Extract Ultra.exe`.
3. Chạy file vừa tải. Nếu Windows SmartScreen báo *"Windows protected your PC"*, bấm **More info → Run anyway**. Thông báo này xuất hiện vì ứng dụng còn mới và chưa có chữ ký số; toàn bộ mã nguồn được công khai ngay tại đây để ai cũng kiểm tra được.

Muốn gỡ cài đặt, vào **Settings → Apps** của Windows. Menu chuột phải sẽ tự được gỡ theo.

## Cách sử dụng

### Giải nén
1. Mở thẻ **Giải nén**.
2. Kéo thả file nén vào cửa sổ, hoặc bấm **Chọn file**, **Quét thư mục** hay **Quét sâu** (quét cả thư mục con).
3. Các công tắc tùy chọn:
   - **Lưu vào**: mặc định mỗi file nén được giải nén ngay cạnh nó. Bấm vào để chọn thư mục khác (nút × để quay lại như cũ).
   - **Thông minh**: nếu file nén chỉ chứa một thư mục hoặc một file, nó được lấy ra trực tiếp, không bọc thêm thư mục.
   - **Thư mục chung**: mọi kết quả được gom vào một thư mục `Main Zip`. **Thư mục chung mới** tạo `Main Zip (1)` mới cho lần này.
4. Bấm **Giải nén tất cả**. Mỗi file nén vào một thư mục mới mang tên của nó; nếu tên đã có thì thêm `(1)`, `(2)`… Không bao giờ ghi đè.
5. Nếu file nén cần mật khẩu, ô mật khẩu sẽ hiện ngay trên dòng đó. Nhập rồi bấm **Tiếp tục**, hoặc **Bỏ qua**. Trong lúc đó các file khác vẫn tiếp tục giải nén.

### Tạo file nén
1. Mở thẻ **Nén**, kéo thả file/thư mục vào, hoặc bấm **Thêm file** / **Thêm thư mục**.
2. Chọn tên, thư mục lưu, định dạng và mức nén.
3. Tùy chọn: mật khẩu (7Z hoặc ZIP), *ẩn luôn tên file* (7Z), hoặc *chia thành nhiều phần*.
4. Bấm **Tạo file nén**. Xong thì bấm **Mở thư mục chứa** để xem.

> 💡 Mật khẩu ZIP chỉ dùng được chữ cái không dấu, số và ký hiệu (giới hạn của 7-Zip). Nếu muốn mật khẩu có dấu tiếng Việt, hãy chọn 7Z.

### Xem bên trong file nén
Mở thẻ **Xem bên trong**, bấm **Mở file nén** (hoặc kéo thả vào). Bấm đúp vào thư mục để đi vào, dùng ô tìm kiếm, đánh dấu các mục rồi bấm **Giải nén mục đã chọn**, hoặc **Kiểm tra** để xác nhận file còn nguyên vẹn.

### Bật menu chuột phải
Bấm ⚙️ **Cài đặt** → bật **Menu chuột phải trong Explorer**. Menu sẽ có *Giải nén... (chọn nơi lưu)*, *Giải nén tại đây (thông minh)*, *Giải nén vào thư mục* và nhiều mục khác. Trên Windows 11, các mục nằm trong **Show more options** (hoặc nhấn Shift+F10). Menu chỉ thêm cho tài khoản Windows của bạn và sẽ được gỡ khi bạn tắt cài đặt này.

### Cài đặt
| Cài đặt | Mặc định | Ý nghĩa |
|---|---|---|
| Ngôn ngữ | English | English / 日本語 / Tiếng Việt |
| Menu chuột phải trong Explorer | Tắt | Thêm menu chuột phải như trên |
| Mở thư mục sau khi giải nén | Tắt | Tự mở Explorer khi xong việc |
| Giữ cảnh báo an toàn của file tải về | **Bật** | File giải nén vẫn mang dấu "tải từ Internet", để SmartScreen và chế độ bảo vệ của Office tiếp tục bảo vệ bạn |
| Chuyển file nén vào Thùng rác sau khi giải nén | Tắt | Chỉ khi thành công; bộ file nhiều phần được chuyển cùng nhau và có thể khôi phục |

## Câu hỏi thường gặp

**Có tạo được file RAR không?**
Không. Định dạng RAR chỉ WinRAR mới được phép tạo. Quick Extract Ultra mở được RAR (cả RAR5) và tạo được 7Z, ZIP và các định dạng TAR mà mọi phần mềm hiện nay đều mở được.

**Có an toàn không? Có gửi gì lên mạng không?**
Mọi thứ chạy trên máy bạn bằng bộ máy 7-Zip nổi tiếng. Ứng dụng không thu thập dữ liệu và không kết nối mạng. Việc giải nén diễn ra trong một thư mục tạm trước; chỉ khi kết quả hoàn chỉnh và đã được kiểm tra mã, nó mới được chuyển vào chỗ của bạn.

**Sao lần đầu chạy Windows lại cảnh báo?**
Ứng dụng mới chưa mua chứng chỉ chữ ký số sẽ bị SmartScreen cảnh báo. Hãy bấm **More info → Run anyway**. Trong tương lai chúng tôi muốn ký số cho các bản phát hành (xem [Ủng hộ dự án](#ủng-hộ-dự-án)).

**Cài đặt được lưu ở đâu?**
Trong `%APPDATA%\quick-extract-ultra\settings.json`. Danh sách file nén và mật khẩu không bao giờ được lưu lại.

## Tự build từ mã nguồn

Cần [Node.js](https://nodejs.org/) 22 trở lên và Windows 10/11.

```bash
git clone https://github.com/nyankuro/quick-extract-ultra.git
cd quick-extract-ultra
npm ci
npm run dev        # chạy ở chế độ phát triển
npm test           # kiểm thử nén/giải nén (dùng 7-Zip thật)
npm run test:ui    # kiểm thử giao diện Electron
npm run dist       # tạo bản cài đặt và bản portable trong dist/
```

## Đóng góp

Rất hoan nghênh báo lỗi, ý tưởng và bản dịch! Hãy mở một [Issue](https://github.com/nyankuro/quick-extract-ultra/issues). Muốn thêm ngôn ngữ mới, sao chép `locales/en.json`, dịch phần giá trị, rồi thêm vào `src/i18n.tsx` và `electron/settings.cjs`.

## Ủng hộ dự án

Quick Extract Ultra luôn miễn phí. Nếu nó giúp ích cho bạn, bạn có thể ủng hộ để dự án tiếp tục phát triển:

- ⭐ **Bấm Star cho kho mã này**. Việc này giúp nhiều người khác tìm thấy nó.
- 🐛 Báo lỗi và đề xuất tính năng ở mục [Issues](https://github.com/nyankuro/quick-extract-ultra/issues).
- ☕ **[Ủng hộ mình trên Ko-fi](https://ko-fi.com/nyannyankuro)** — trong app cũng có nút "Ủng hộ mình" ngay dưới tên ứng dụng.
  - GitHub Sponsors: *sắp có*
  - PayPal: *sắp có*

## Giấy phép

© 2026 nyankuro. Quick Extract Ultra **miễn phí** và mã nguồn được công khai, theo [Giấy phép PolyForm Shield 1.0.0](../LICENSE) (bản gốc tiếng Anh là bản có giá trị pháp lý).

Nói đơn giản:
- ✅ Bạn được dùng miễn phí, ở nhà hay ở chỗ làm, chia sẻ cho người khác, và sửa lại để tự dùng.
- ❌ Bạn **không** được bán phần mềm này, hoặc đưa nó (hay một bản đổi tên/đổi thương hiệu) ra làm sản phẩm cạnh tranh với Quick Extract Ultra, kể cả khi phát miễn phí.

Các thành phần bên thứ ba đi kèm vẫn giữ giấy phép riêng của chúng (xem bên dưới).
Sử dụng [7-Zip](https://www.7-zip.org/) của Igor Pavlov (GNU LGPL, kèm giới hạn unRAR). Xem [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
