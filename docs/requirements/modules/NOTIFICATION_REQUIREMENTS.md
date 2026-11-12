# Looply — Yêu cầu Module Notification (Đồ án 1)

## 1. Phạm vi
Module Notification lưu trữ, hiển thị và quản lý thông báo cá nhân cho người dùng đã đăng nhập. Hỗ trợ sự kiện từ Chat và Listing, cập nhật realtime khi người nhận đang sử dụng website. Không bao gồm thiết kế API, cơ sở dữ liệu hay lựa chọn công nghệ truyền realtime.

## 2. Danh sách chức năng

| Mã | Chức năng | Yêu cầu |
|---|---|---|
| NOTI-001 | Thông báo tin nhắn mới | Tạo thông báo cho người nhận tin nhắn, không gửi cho người gửi; không hiển thị nội dung tin nhắn xem trước; điều hướng đến Conversation; hạn chế thông báo trùng lặp dồn dập trong cùng Conversation. |
| NOTI-002 | Thông báo chỉnh sửa Listing | Khi Listing đã có Conversation được chủ bài xác nhận chỉnh sửa, thông báo cho những người có Conversation liên quan; không gửi cho người chỉ theo dõi Listing hoặc chính người sửa. |
| NOTI-003 | Thông báo giao dịch | Thông báo cho chủ Listing khi có đề xuất mới; thông báo cho người gửi đề xuất khi được chấp nhận hoặc từ chối; chỉ tạo khi sự kiện được ghi nhận thành công; điều hướng đến Conversation/card liên quan. |
| NOTI-004 | Danh sách thông báo | Hiển thị thông báo của tài khoản hiện tại, mới nhất trước; phân biệt đã đọc/chưa đọc; không tự hết hạn theo thời gian. |
| NOTI-005 | Số lượng chưa đọc | Hiển thị số thông báo chưa đọc trên biểu tượng chuông; cập nhật khi có thông báo mới, đánh dấu đã đọc hoặc xóa. |
| NOTI-006 | Thông báo nổi (toast) | Khi người dùng đang sử dụng website, hiển thị toast cho sự kiện mới rồi tự tắt sau vài giây; toast tắt không làm thông báo thành đã đọc hay xóa khỏi danh sách. |
| NOTI-007 | Điều hướng | Nhấn thông báo mở Conversation, card giao dịch hoặc Listing/Conversation liên quan theo quyền truy cập; đánh dấu thông báo tương ứng đã đọc; xử lý phù hợp khi đích không còn khả dụng. |
| NOTI-008 | Đánh dấu đã đọc | Đánh dấu riêng từng thông báo của tài khoản hiện tại; không thay đổi dữ liệu nghiệp vụ gốc. |
| NOTI-009 | Đánh dấu tất cả đã đọc | Đánh dấu toàn bộ thông báo chưa đọc của tài khoản hiện tại. |
| NOTI-010 | Xóa thông báo | Xóa thông báo khỏi danh sách cá nhân; không xóa tin nhắn, Listing, đề xuất hoặc sự kiện gốc. |

## 3. Quy tắc nghiệp vụ

1. **Người nhận và quyền truy cập:** Mỗi thông báo thuộc một người nhận xác định. Chỉ người dùng đã đăng nhập mới xem và quản lý thông báo của mình. Backend phải kiểm tra quyền khi đọc, đánh dấu và xóa; không tạo thông báo cho chính người thực hiện hành động.
2. **Sự kiện được hỗ trợ:** Tin nhắn mới; chỉnh sửa Listing có Conversation liên quan; đề xuất giao dịch mới, được chấp nhận hoặc bị từ chối. Thông báo giao dịch chỉ phản ánh trạng thái đề xuất trong Chat, không phải thanh toán hoặc đặt cọc.
3. **Lưu trữ và trạng thái:** Thông báo mới có trạng thái **chưa đọc**; sau khi xử lý có trạng thái **đã đọc**. Thông báo không tự biến mất theo thời gian; người nhận offline vẫn xem được khi đăng nhập lại.
4. **Realtime và toast:** Khi người nhận đang mở website, hệ thống cập nhật danh sách/số lượng chưa đọc và hiển thị toast. Toast tự đóng không thay đổi trạng thái đã đọc.
5. **Điều hướng:** Thông báo tin nhắn mở Conversation; thông báo giao dịch mở Conversation chứa card; thông báo chỉnh sửa mở Listing hoặc Conversation liên quan tùy quyền. Nếu nội dung không khả dụng, hiển thị thông báo phù hợp, không dẫn đến trang lỗi.
6. **Giảm trùng lặp:** Hạn chế tạo quá nhiều thông báo giống nhau từ cùng Conversation trong thời gian ngắn nhưng vẫn bảo đảm người dùng biết có hoạt động mới.
7. **Tính nhất quán:** Chỉ tạo thông báo cho sự kiện nghiệp vụ đã thành công. Lỗi gửi thông báo realtime không được làm sai lệch kết quả đã hoàn tất của Chat/Listing.
8. **Tích hợp:** Chat và Listing phát sinh sự kiện; Notification phụ trách lưu, hiển thị, điều hướng và quản lý thông báo. Quyền xem nội dung đích luôn theo quyền hiện tại.

## 4. Luồng xử lý tổng quát

1. Chat/Listing phát sinh sự kiện hợp lệ.
2. Backend xác định người nhận theo quy tắc nghiệp vụ.
3. Lưu thông báo chưa đọc cho người nhận.
4. Nếu người nhận đang sử dụng website, cập nhật realtime số lượng chưa đọc và hiển thị toast.
5. Người nhận xem, mở nội dung liên quan, đánh dấu đã đọc hoặc xóa thông báo.

## 5. Ngoài phạm vi Đồ án 1

- Web Push/thông báo hệ điều hành khi đóng website; email/SMS cho sự kiện Chat/Listing.
- Thông báo theo dõi/bỏ theo dõi người dùng hoặc Listing, thay đổi hồ sơ, bài đăng mới.
- Thông báo thanh toán, đặt cọc, tranh chấp; cấu hình tùy chọn thông báo phức tạp theo từng loại sự kiện.

**Tổng cộng: 10 chức năng (NOTI-001 đến NOTI-010).**

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
