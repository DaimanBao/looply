# Reminder — thiết kế và tích hợp

Nguồn nghiệp vụ: [REMINDER_REQUIREMENTS.md](../requirements/modules/REMINDER_REQUIREMENTS.md).
Contract HTTP: [openapi.json](openapi.json).

## Trách nhiệm

Reminder đọc hồ sơ qua `UserService.me`, dùng middleware phiên của Auth và chỉ trả các mã
`PHONE`, `EMAIL`, `PROVINCE`. Phone/email cần có giá trị và thời điểm xác minh; province cần
được thiết lập. Không nhắc avatar, không cập nhật User và không tạo Notification/outbox/job.

## API và vòng đời phiên

- `GET /api/reminders`: tính lại các mục còn thiếu, không tiêu thụ lượt hiển thị.
- `POST /api/reminders/presentation`, body `{}`: tính lại hồ sơ, cấp một lượt hiển thị cho
  `AuthSession.id` hiện tại và trả `{items:[...]}`. Các lần gọi tiếp theo trả `{items:[]}`.
- Cả hai yêu cầu Bearer ACTIVE, `Cache-Control: no-store`; không nhận userId/sessionId từ client.
- Redis `SET NX EX` cấp lượt nguyên tử giữa request/tab/process. Khóa có namespace riêng và
  session UUID do Auth cung cấp, TTL bảy ngày bằng thời hạn tuyệt đối tối đa của phiên hiện có.
  Không lưu thông tin liên hệ, JWT hoặc refresh token. Không thêm bảng/migration/dependency.
- Refresh token giữ cùng AuthSession, vì vậy không cấp lượt mới. Login tạo AuthSession mới;
  logout/revoke làm token cũ không còn dùng được. Restart Backend không xóa khóa Redis.
- Lượt được tính khi server cấp response, không phải xác nhận browser đã vẽ xong card. Nếu
  response bị mất sau khi cấp lượt thì không phát lại trong phiên đó để giữ giới hạn tối đa
  một lần. Redis lỗi trả 503, không làm hỏng login hay chặn tính năng khác. Mất dữ liệu Redis
  có thể làm nhắc lại; không coi đây là dữ liệu hồ sơ cần lưu vĩnh viễn.

## Angular

Một card nhỏ trong shell, không modal. Store gọi presentation một lần khi nhận phiên ACTIVE,
không gọi lại vì chuyển trang hoặc token rotation. Card ở nguyên vị trí cho tới khi đóng,
chọn “Để sau”, hoặc chọn cập nhật; không tự mở lại trong phiên hiện tại, kể cả tải lại trang.
Khách/tài khoản chờ xóa không hiện card. Lỗi có nút thử lại; loading không chặn router.

Các mục dẫn tới `/account/contacts?kind=phone`, `/account/contacts?kind=email`,
`/account/edit#province`. Form liên hệ tiếp tục dùng re-auth và OTP hiện có.
Khi ProfileStore nhận hồ sơ mới, GET tính lại mục thiếu cho card đang mở; không cấp thêm lượt.
Mọi response được ràng buộc identity generation, request revision và trạng thái ACTIVE;
đóng card hoặc đổi tài khoản vô hiệu hóa response đang chờ.

## Kiểm thử

Unit kiểm tra tổ hợp ba điều kiện và không nhắc avatar. Integration dùng PostgreSQL
`looply_test` và Redis test qua fixture có guard, kiểm tra quyền, cấp lượt đồng thời,
refresh/logout/phiên mới, hồ sơ được cập nhật và không tạo Notification.
Angular kiểm tra visibility, điều hướng, đóng card, retry và response cũ khi đổi phiên.
