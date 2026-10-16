||=====================||
||   CURRENCY TO VND   ||
||=====================||

GIỚI THIỆU
=========
Currency to VND là tiện ích mở rộng dành cho Google Chrome, giúp nhận diện, quy đổi tiền 
trên các trang web bán hàng nước ngoài sang Đồng Việt Nam (VND) và hiển thị ngay bên cạnh giá gốc.


LỊCH SỬ PHIÊN BẢN
=================

PHIÊN BẢN 1.0.0
---------------
- Tự động nhận diện các loại tiền tệ được hỗ trợ trên trang web đang mở.
- Hiển thị giá quy đổi sang VND bên cạnh giá gốc mà không chủ động thay thế giá gốc.
- Cho phép bật hoặc tắt chức năng tự động quy đổi trong popup.
- Có ô nhập số tiền trong popup: thay đổi số tiền sẽ tính lại giá trị tương đương bằng VND.
- Khi nhận diện được một loại tiền tệ khác trên tab đang mở, số tiền nhập trong popup được đặt lại về 1.
- Lưu tỷ giá đã lấy để hạn chế gọi API liên tục; có thể bấm “Cập nhật tỷ giá” để yêu cầu dữ liệu mới.
- Hiển thị thời điểm cập nhật dữ liệu tỷ giá. Thời gian do API cung cấp được ghi theo UTC.

PHIÊN BẢN 1.2.0
---------------
Các cập nhật so với phiên bản 1.0.0:
- Bổ sung chế độ quy đổi thủ công:
  Khi extension không đọc được tab hiện tại hoặc không nhận diện được loại tiền tệ,
  người dùng có thể chọn loại tiền tệ, nhập số tiền và xem kết quả quy đổi sang VND, không cần bật tab khác để tra cứu.
- Bổ sung nhận diện số tiền có từ chỉ bội số phổ biến như nghìn/ngàn, triệu, tỷ/tỉ, vạn 
  và một số cách ghép như chục/trăm nghìn, triệu hoặc tỷ.
  Ví dụ: “4,67 triệu USD” được hiểu là 4.670.000 USD.
- Tối ưu xử lý DOM và MutationObserver để giảm quét lặp.
- Thu gọn dữ liệu tỷ giá được lưu vào cache, chỉ giữ các mã tiền tệ extension hỗ trợ,
  đồng thời tái sử dụng các bộ định dạng số và giảm một số thao tác đọc/ghi giao diện không cần thiết.

______________________________________________________________________________________________________

CÀI ĐẶT
=======
1. Giải nén gói extension vào một thư mục trên máy tính.
2. Mở Google Chrome và truy cập: chrome://extensions
3. Bật “Developer mode” (Chế độ dành cho nhà phát triển).
4. Nhấn “Load unpacked” (Tải tiện ích đã giải nén).
5. Chọn thư mục có chứa file manifest.json.
6. Mở hoặc tải lại trang web bán hàng rồi nhấn biểu tượng Currency to VND để mở popup.

CÁCH SỬ DỤNG
============
- Bật “Tự động quy đổi” để hiển thị giá VND trên trang web.
- Trong popup, có thể sửa số tiền ở đầu dòng “Tỉ giá” để tính số tiền tương đương.
  Ví dụ: nhập 2 để tính giá trị của 2 đơn vị tiền tệ đang được nhận diện.
- Nhấn “Cập nhật tỷ giá” nếu muốn yêu cầu dữ liệu tỷ giá mới.

LƯU Ý
=====
- Tỷ giá chỉ dùng để tham khảo; số tiền thanh toán thực tế có thể sai lệch một chút 
  do tỷ giá của ngân hàng, thẻ hoặc đơn vị cung cấp dịch vụ thanh toán.
- Extension lấy dữ liệu từ ExchangeRate-API Open Access. Dữ liệu tỷ giá dựa trên USD;
  tỷ giá VND cho một đơn vị tiền tệ nguồn được tính từ các mức tỷ giá đó.
- Một số ký hiệu tiền tệ như “$” hoặc “¥” có thể đại diện cho nhiều đồng tiền khác nhau.
  Extension nhận diện theo các quy tắc hiện có và giá tiền xuất hiện phổ biến nhất trên tab;
  vì vậy kết quả có thể chưa chính xác trên mọi website.
- Đây là bản cài đặt thủ công dành cho nhà phát triển, không phải bản phát hành trên Chrome Web Store.