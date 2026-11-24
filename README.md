# Tạo Mã QR Miễn Phí

Công cụ tạo mã QR miễn phí, chạy 100% trên trình duyệt. Không đăng nhập, không quảng cáo, không theo dõi, không máy chủ.

> Công cụ miễn phí, không phải sản phẩm chính thức của LPBank.
> Mọi dữ liệu chỉ xử lý trên trình duyệt của bạn, không gửi lên máy chủ.

## Mới ở v1.4.1

- **Mẫu thẻ "Cây Kim Tiền — A6 dọc"**: khổ A6 dọc 105 × 148 mm (ảnh xuất đúng tỉ lệ, PNG 2048px ≈ 495 dpi), cùng cây vàng và tông màu với mẫu Cây Vàng Lộc Phát khổ ngang. Dòng dưới logo là tên tiếng Việt đầy đủ của ngân hàng.

## Mới ở v1.4.0

- **Card visit: chọn loại mã QR** – Chuyển tiền (VietQR, mặc định), Zalo (`https://zalo.me/<id>`), Facebook (ô Facebook mới), Gọi điện (`tel:+84…`). Dưới mã có chú thích theo loại. Lựa chọn bị khóa kèm gợi ý khi ô tương ứng còn trống.
- **4 mẫu card visit mới** (tổng 6): Xanh Dương Doanh Nhân, Hồng Sen Nhẹ Nhàng, Xanh Ngọc Lục Bảo, Xám Bạc Tối Giản. Màu trang trí, không phải màu thương hiệu.
- **Thông báo khi mở trong Zalo / Facebook / Messenger:** các trình duyệt nhúng này không tải hình về được, nên đầu trang "Tạo mã" và "Card visit" hiện thông báo (đóng được) kèm cách mở bằng trình duyệt ngoài.

## Mới ở v1.3.0

- **4 mẫu thẻ QR mới** (tổng 12, cùng mẫu "Chỉ mã QR"): Xanh Lá Thiên Nhiên, Biển Xanh, Tím Hoàng Gia, Trung Thu. Họa tiết vẽ bằng SVG; màu là màu trang trí, không phải màu thương hiệu.
- Trên iPhone/iPad có dòng gợi ý dưới các nút tải: "iPhone: bấm Chia sẻ → Lưu hình ảnh" (Safari tải ảnh vào Tệp chứ không vào Album ảnh).
- SEO: meta description, Open Graph, Twitter Card, `sitemap.xml`, `robots.txt`.

## Mới ở v1.2.1

- Dòng dưới logo trên các mẫu thẻ nền màu ghi tên tiếng Việt đầy đủ của ngân hàng (LPBank: "Ngân hàng TMCP Lộc Phát Việt Nam") thay cho tên ngắn. Chỉ áp dụng cho tên đã đối chiếu trên website chính thức (`src/lib/fullnames.ts`); còn lại giữ tên ngắn.

## Mới ở v1.2.0

- **4 mẫu thẻ QR mới** (tổng 8, cùng mẫu "Chỉ mã QR"): Cây Vàng Lộc Phát, Vàng Sang Trọng, Gradient Hiện Đại, Tết Lộc Phát. Cây vàng, đồng tiền, đèn lồng đều vẽ bằng SVG, không dùng ảnh chụp.
- **Card visit**: danh thiếp tỉ lệ 3.5:2 (PNG 2100×1200 + SVG), 2 mẫu (LPBank, Vàng Sang Trọng), gắn mã QR từ lịch sử hoặc tạo VietQR mới ngay tại chỗ.
- **Quản trị**: thống kê lưu trên máy (số mã đã tạo, theo ngân hàng, theo loại, lượt tải, số card visit). Không đăng nhập, không máy chủ.

## What's new in v1.2.0

Four new card templates (Golden Money Tree, Luxury Gold, Modern Gradient, Festive Tet), a business-card maker (3.5:2, PNG + SVG, QR from history or a new VietQR) and a local-only statistics page. Still 100% client-side.

## Mới ở v1.1.1

- Thông tin nhân viên in trên thẻ thành một dòng nhỏ "NV hỗ trợ: Tên — Chi nhánh — SĐT" (65% cỡ chữ nội dung thẻ).
- Footer trang chỉ còn ghi chú riêng tư, dòng bản quyền và số phiên bản.

## Mới ở v1.1.0

- **Phong cách theo ngân hàng**: chọn ngân hàng nhận thì giao diện và thẻ QR tự đổi sang màu + logo ngân hàng đó (đổi tay được ở mục "Phong cách"). 52 tổ chức có màu/logo lấy từ website chính thức (xem `src/lib/styles.ts`, trường `source`); 24 tổ chức chưa xác minh được dùng kiểu xanh đậm trung tính, không logo.
- **4 mẫu thẻ QR** (PNG/SVG tải về là cả thẻ): Chuẩn, Thẻ ngân hàng, Tối giản, Doanh nghiệp — cùng mẫu "Chỉ mã QR" như bản 1.0.
- **Thông tin cán bộ phụ trách** (chi nhánh, tên, số điện thoại): in thành chữ dưới mã, không nằm trong dữ liệu mã QR; ô trống không hiện; lưu trên máy.
- Số phiên bản chỉ sửa ở `src/version.ts`, rồi chạy `npm run version:sync`.

## What's new in v1.1.0

Bank styles (official colors + logo per bank, auto-switching with the selected bank), four downloadable card templates, optional staff info printed below the QR (never encoded in the payload), version shown in the footer from `src/version.ts`.

## Tiếng Việt

### Tính năng

- **VietQR chuyển khoản** (tính năng chính): chọn ngân hàng theo danh sách BIN NAPAS (LPBank chọn sẵn), số tài khoản, tên chủ tài khoản, số tiền (không bắt buộc), nội dung. Có nút chọn nhanh 50K / 100K / 200K / 500K / 1M. Xem được chuỗi dữ liệu gốc trong mã.
- **8 loại mã khác**: website, văn bản, WiFi, gọi điện, SMS, email, danh thiếp vCard, Zalo.
- **Tùy chỉnh**: màu mã, màu nền, mức sửa lỗi M/Q/H, bo tròn ô, logo ở giữa (logo LPBank hoặc logo của bạn). Có cảnh báo khi nền tối, tương phản thấp hoặc mã quá dày.
- **Tải về**: PNG 512 / 1024 / 2048 px, SVG, sao chép ảnh, chia sẻ qua Web Share API.
- **Lịch sử**: lưu trong `localStorage` của máy, bấm để tạo lại hoặc tải lại, có nút xóa.
- **PWA**: cài được lên màn hình chính, chạy được khi ngoại tuyến.

### Chuẩn VietQR

Chuỗi dữ liệu theo EMVCo / NAPAS 247:

| Trường | Giá trị |
| --- | --- |
| `00` | `01` |
| `01` | `11` (không số tiền) hoặc `12` (có số tiền) |
| `38` | `00` = `A000000727`, `01` = (`00` BIN + `01` số tài khoản), `02` = `QRIBFTTA` |
| `53` | `704` (VND) |
| `54` | số tiền (nếu có) |
| `58` | `VN` |
| `62` | `08` = nội dung chuyển khoản, đã bỏ dấu (nếu có) |
| `63` | CRC-16/CCITT-FALSE |

Tên chủ tài khoản chỉ hiển thị dưới mã, không ghi vào mã: app ngân hàng tự tra tên theo số tài khoản.

Danh sách BIN lấy từ `https://api.vietqr.io/v2/banks` và lưu sẵn trong `src/lib/banks.ts` (ứng dụng không gọi API này khi chạy). **Luôn chuyển thử một số tiền nhỏ trước khi in hoặc gửi mã cho người khác.**

### Chạy trên máy

```bash
npm install
npm run dev        # chạy thử
npm run build      # build vào dist/
npm run lint
npm test           # kiểm thử payload, CRC, quét lại mã
npm run test:e2e   # kiểm thử trên Chrome ở 390px (cần build trước; đặt CHROME_PATH nếu cần)
```

Đổi màu thương hiệu tại `@theme` trong `src/index.css`.

## English

A free QR code generator in Vietnamese that runs entirely in the browser: no backend, no login, no tracking, no external QR API. Built with React, Vite, TypeScript and Tailwind CSS; installable as a PWA and usable offline.

> This is a free tool and not an official LPBank product. All data is processed in your browser and never sent to a server.

### Features

- **VietQR bank transfer** (main feature): bank picker with NAPAS BIN codes (LPBank preselected), account number, holder name, optional amount with quick presets, optional note. The raw EMVCo payload is shown for transparency.
- **8 more types**: URL, plain text, WiFi, phone call, SMS, email, vCard, Zalo.
- **Customisation**: QR colour, background colour, error correction M/Q/H, rounded modules, centre logo (built-in LPBank logo or your own), with warnings for dark backgrounds, low contrast and dense codes.
- **Export**: PNG at 512 / 1024 / 2048 px, SVG, copy image, Web Share.
- **History** kept in `localStorage` only, with a clear button.

### VietQR payload

EMVCo format with NAPAS GUID `A000000727` in field 38 (BIN + account, service `QRIBFTTA`), currency `704`, country `VN`, and a CRC-16/CCITT-FALSE checksum in field 63. Notes are stripped of Vietnamese diacritics so every banking app can read them. The holder name is display-only and is not encoded.

The bank list comes from `https://api.vietqr.io/v2/banks` and is bundled in `src/lib/banks.ts`; nothing is fetched at runtime. **Always test a code with a small transfer before printing or sharing it.**

### Development

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e   # needs a build first; set CHROME_PATH if Chrome is not found
```

## License

MIT. The LPBank name and logo belong to their owner and are used only as an optional overlay chosen by the user.
