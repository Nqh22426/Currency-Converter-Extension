CURRENCY TO VND — PHIÊN BẢN 1.0.0
==================================

GIỚI THIỆU
----------
Currency to VND là tiện ích mở rộng dành cho Google Chrome, giúp nhận diện giá tiền
trên trang web và hiển thị giá quy đổi tham khảo sang Đồng Việt Nam (VND) ngay bên
cạnh giá gốc.

TÍNH NĂNG CHÍNH
---------------
- Tự động nhận diện các loại tiền tệ được hỗ trợ trên trang web đang mở.
- Hiển thị giá quy đổi sang VND bên cạnh giá gốc mà không chủ động thay thế giá gốc.
- Cho phép bật hoặc tắt chức năng tự động quy đổi trong popup.
- Có ô nhập số tiền trong popup: thay đổi số tiền sẽ tính lại giá trị tương đương bằng VND.
- Khi nhận diện được một loại tiền tệ khác trên tab đang mở, số tiền nhập trong popup được đặt lại về 1.
- Lưu tỷ giá đã lấy để hạn chế gọi API liên tục; có thể bấm “Cập nhật tỷ giá” để yêu cầu dữ liệu mới.
- Hiển thị thời điểm cập nhật dữ liệu tỷ giá. Thời gian do API cung cấp được ghi theo UTC.

CÀI ĐẶT
-------
1. Giải nén gói extension vào một thư mục trên máy tính.
2. Mở Google Chrome và truy cập: chrome://extensions
3. Bật “Developer mode” (Chế độ dành cho nhà phát triển).
4. Nhấn “Load unpacked” (Tải tiện ích đã giải nén).
5. Chọn thư mục có chứa file manifest.json.
6. Mở hoặc tải lại trang web bán hàng rồi nhấn biểu tượng Currency to VND để mở popup.

CÁCH SỬ DỤNG
------------
- Bật “Tự động quy đổi” để hiển thị giá VND trên trang web.
- Trong popup, có thể sửa số tiền ở đầu dòng “Tỉ giá” để tính số tiền tương đương.
  Ví dụ: nhập 2 để tính giá trị của 2 đơn vị tiền tệ đang được nhận diện.
- Nếu bạn chuyển sang một tab có loại tiền tệ khác được nhận diện, số tiền trong ô
  nhập sẽ tự trở về 1.
- Nhấn “Cập nhật tỷ giá” nếu muốn yêu cầu dữ liệu tỷ giá mới.

LƯU Ý
-----
- Tỷ giá chỉ dùng để tham khảo; số tiền thanh toán thực tế có thể khác do tỷ giá
  của ngân hàng, thẻ hoặc đơn vị cung cấp dịch vụ thanh toán.
- Extension lấy dữ liệu từ ExchangeRate-API Open Access. Dữ liệu tỷ giá dựa trên USD;
  tỷ giá VND cho một đơn vị tiền tệ nguồn được tính từ các mức tỷ giá đó.
- Một số ký hiệu tiền tệ như “$” hoặc “¥” có thể đại diện cho nhiều đồng tiền khác
  nhau. Extension nhận diện theo các quy tắc hiện có và giá tiền xuất hiện phổ biến
  nhất trên tab; vì vậy kết quả có thể chưa chính xác trên mọi website.
- Đây là bản cài đặt thủ công dành cho nhà phát triển, không phải bản phát hành
  trên Chrome Web Store.


CURRENCY TO VND — VERSION 1.0.0
================================

OVERVIEW
--------
Currency to VND is a Google Chrome extension that detects supported prices on a
webpage and displays an estimated Vietnamese dong (VND) conversion next to the
original price.

KEY FEATURES
-----------
- Automatically detects supported currencies on the active webpage.
- Displays an estimated VND amount alongside the original price without deliberately
  replacing the original price.
- Lets users enable or disable automatic conversion from the popup.
- Includes an editable amount field in the popup; changing the amount recalculates
  its approximate value in VND.
- Resets the popup amount to 1 when a different supported currency is detected on
  the active tab.
- Stores fetched exchange-rate data to reduce repeated API requests. The “Cập nhật
  tỷ giá” button can request fresh data.
- Shows the exchange-rate data timestamp. The API timestamp is supplied in UTC.

INSTALLATION
------------
1. Extract the extension package to a folder on your computer.
2. Open Google Chrome and navigate to: chrome://extensions
3. Enable “Developer mode”.
4. Click “Load unpacked”.
5. Select the folder containing manifest.json.
6. Open or reload a shopping website, then click the Currency to VND extension icon
   to open its popup.

USAGE
-----
- Enable “Tự động quy đổi” to display VND conversions on webpages.
- Edit the number at the beginning of the “Tỉ giá” line in the popup to calculate
  the equivalent amount. For example, enter 2 to calculate the value of 2 units of
  the currency detected on the active tab.
- If a different currency is detected on the active tab, the amount field resets to 1.
- Click “Cập nhật tỷ giá” to request updated exchange-rate data.

NOTES
-----
- Exchange rates are estimates. The final amount charged may differ because of the
  rate used by a bank, card issuer, or payment provider.
- The extension retrieves data from ExchangeRate-API Open Access. The rates are
  USD-based; the VND value for one unit of the source currency is derived from them.
- Symbols such as “$” or “¥” can represent more than one currency. Detection uses
  the extension's existing rules and the most frequently detected supported currency
  on the active tab, so results may not be correct on every website.
- This is an unpacked developer build, not a Chrome Web Store release.