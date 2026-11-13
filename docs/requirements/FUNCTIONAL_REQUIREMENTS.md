# FUNCTIONAL REQUIREMENTS — Checklist tiến độ Looply (Đồ án 1)

**Mục đích:** Nguồn duy nhất theo dõi tiến độ **toàn bộ chức năng Đồ án 1**. AI đọc file này trước để biết chức năng cần triển khai; chỉ mở file module khi cần chi tiết nghiệp vụ. **Không giới hạn ở MVP.**

## Quy tắc cập nhật

- `[ ]` = **chưa được xác nhận hoàn thành** (có thể chưa làm, đang làm hoặc chưa kiểm thử đủ); `[x]` = **đã triển khai, kiểm thử đạt và review đạt**.
- **Không suy đoán tiến độ từ tài liệu yêu cầu.** Bản checklist khởi tạo đều `[ ]` vì chưa đối chiếu mã nguồn và kết quả test của project xây dựng lại.
- Chỉ chuyển `[ ]` → `[x]` sau khi chức năng đáp ứng yêu cầu trong module, chạy kiểm thử liên quan thành công và không còn lỗi chặn. Nếu phát hiện hồi quy, chuyển lại `[ ]`.
- Sau mỗi giai đoạn hoàn thành, AI cập nhật đúng ô checklist và ghi bằng chứng ngắn trong báo cáo công việc/PR (test đã chạy, kết quả). Không sao chép tiến độ sang từng module.
- Mã chức năng là định danh ổn định; khi thay đổi yêu cầu phải cập nhật module tương ứng **trước**, rồi mới sửa danh mục/checklist ở đây. Không tự thêm/bớt nghiệp vụ.
- Quy trình: [`DEVELOPMENT_WORKFLOW.md`](../workflows/DEVELOPMENT_WORKFLOW.md); chi tiết yêu cầu: [`modules/`](modules/).

## Tổng quan

| Nhóm | Tổng số | Đã xác nhận hoàn thành |
|---|---:|---:|
| AUTH | 16 | 0 |
| USER | 17 | 0 |
| LISTING | 19 | 0 |
| MEDIA | 10 | 0 |
| CHAT | 17 | 0 |
| NOTIFICATION | 10 | 0 |
| REMINDER | 7 | 0 |
| **Tổng** | **96** | **0** |

> Cập nhật cột tổng quan đồng thời với các ô checklist bên dưới; không tự đánh dấu hoàn thành khi chưa có bằng chứng.

## AUTH — 16 chức năng

Chi tiết: [`AUTH_REQUIREMENTS.md`](modules/AUTH_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `AUTH-001` | Đăng ký nội bộ |
| [ ] | `AUTH-002` | OTP đăng ký |
| [ ] | `AUTH-003` | Đăng nhập username/password |
| [ ] | `AUTH-004` | Đăng nhập phone/OTP |
| [ ] | `AUTH-005` | Đăng nhập Google |
| [ ] | `AUTH-006` | Tạo phiên |
| [ ] | `AUTH-007` | Làm mới phiên |
| [ ] | `AUTH-008` | Đăng xuất |
| [ ] | `AUTH-009` | Xác minh đổi số điện thoại |
| [ ] | `AUTH-010` | Xác minh thêm/đổi email |
| [ ] | `AUTH-011` | Xác thực request |
| [ ] | `AUTH-012` | Đổi mật khẩu |
| [ ] | `AUTH-013` | Khôi phục mật khẩu |
| [ ] | `AUTH-014` | Liên kết Google |
| [ ] | `AUTH-015` | Xác thực lại thao tác nhạy cảm |
| [ ] | `AUTH-016` | Quản lý phiên đăng nhập |


## USER — 17 chức năng

Chi tiết: [`USER_REQUIREMENTS.md`](modules/USER_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `USER-001` | Xem hồ sơ cá nhân |
| [ ] | `USER-002` | Xem hồ sơ người khác |
| [ ] | `USER-003` | Chỉnh sửa hồ sơ |
| [ ] | `USER-004` | Cập nhật avatar |
| [ ] | `USER-005` | Xóa avatar |
| [ ] | `USER-006` | Follow |
| [ ] | `USER-007` | Unfollow |
| [ ] | `USER-008` | Xem Followers |
| [ ] | `USER-009` | Xem Following |
| [ ] | `USER-010` | Block |
| [ ] | `USER-011` | Unblock |
| [ ] | `USER-012` | Danh sách đã chặn |
| [ ] | `USER-013` | Thêm/thay đổi email |
| [ ] | `USER-014` | Thay đổi số điện thoại |
| [ ] | `USER-015` | Đổi username |
| [ ] | `USER-016` | Vòng đời xóa tài khoản |
| [ ] | `USER-017` | Danh mục tỉnh/thành phố |


## LISTING — 19 chức năng

Chi tiết: [`LISTING_REQUIREMENTS.md`](modules/LISTING_REQUIREMENTS.md)

Backend đã triển khai CRUD/management và ảnh ở phase 2, Search/Suggestions/Filters/Sorting/keyset pagination, hai Home Feed và Follow/Unfollow/Followed Listings ở phase 3, Backend Video ở phase 4 theo [thiết kế](../api/LISTING_MEDIA_DESIGN.md). Checklist toàn chức năng vẫn để `[ ]`: Angular Listing và liên thông Chat/Notification chưa hoàn thành. Bằng chứng Backend nằm ở [kiểm thử](../database/INTEGRATION_TESTS.md).

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `LISTING-001` | Tạo bài đăng |
| [ ] | `LISTING-002` | Chỉnh sửa bài đăng |
| [ ] | `LISTING-003` | Xóa bài đăng |
| [ ] | `LISTING-004` | Quản lý bài đăng cá nhân |
| [ ] | `LISTING-005` | Xem danh sách công khai |
| [ ] | `LISTING-006` | Xem chi tiết bài đăng |
| [ ] | `LISTING-007` | Ẩn bài đăng |
| [ ] | `LISTING-008` | Hiển thị lại |
| [ ] | `LISTING-009` | Cập nhật trạng thái theo giao dịch |
| [ ] | `LISTING-010` | Theo dõi bài đăng |
| [ ] | `LISTING-011` | Bỏ theo dõi |
| [ ] | `LISTING-012` | Xem bài đã theo dõi |
| [ ] | `LISTING-013` | Tìm kiếm |
| [ ] | `LISTING-014` | Gợi ý tìm kiếm |
| [ ] | `LISTING-015` | Lọc bài đăng |
| [ ] | `LISTING-016` | Sắp xếp |
| [ ] | `LISTING-017` | Feed gần bạn |
| [ ] | `LISTING-018` | Feed toàn quốc |
| [ ] | `LISTING-019` | Infinite Scroll |


## MEDIA — 10 chức năng

Chi tiết: [`MEDIA_REQUIREMENTS.md`](modules/MEDIA_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `MEDIA-001` | Tải ảnh lên |
| [ ] | `MEDIA-002` | Tải video lên |
| [ ] | `MEDIA-003` | Xóa Media |
| [ ] | `MEDIA-004` | Thay thế Media |
| [ ] | `MEDIA-005` | Xem trước Media |
| [ ] | `MEDIA-006` | Xem Media |
| [ ] | `MEDIA-007` | Chọn ảnh đại diện |
| [ ] | `MEDIA-008` | Sắp xếp ảnh |
| [ ] | `MEDIA-009` | Kiểm tra Media |
| [ ] | `MEDIA-010` | Xử lý Media lỗi |


## CHAT — 17 chức năng

Chi tiết: [`CHAT_REQUIREMENTS.md`](modules/CHAT_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `CHAT-001` | Tạo hội thoại theo Listing |
| [ ] | `CHAT-002` | Tạo hội thoại tự do |
| [ ] | `CHAT-003` | Danh sách hội thoại |
| [ ] | `CHAT-004` | Xem hội thoại |
| [ ] | `CHAT-005` | Xóa hội thoại |
| [ ] | `CHAT-006` | Gửi tin nhắn |
| [ ] | `CHAT-007` | Nhận tin nhắn |
| [ ] | `CHAT-008` | Trạng thái tin nhắn |
| [ ] | `CHAT-009` | Lịch sử tin nhắn |
| [ ] | `CHAT-010` | Liên hệ theo giá niêm yết |
| [ ] | `CHAT-011` | Đề xuất giá mới |
| [ ] | `CHAT-012` | Chấp nhận giao dịch |
| [ ] | `CHAT-013` | Từ chối đề xuất |
| [ ] | `CHAT-014` | Lịch sử đề xuất |
| [ ] | `CHAT-015` | Phân nhóm Inbox |
| [ ] | `CHAT-016` | Card thông tin Listing |
| [ ] | `CHAT-017` | Thông báo tin nhắn |


## NOTIFICATION — 10 chức năng

Chi tiết: [`NOTIFICATION_REQUIREMENTS.md`](modules/NOTIFICATION_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `NOTI-001` | Thông báo tin nhắn mới |
| [ ] | `NOTI-002` | Thông báo chỉnh sửa Listing |
| [ ] | `NOTI-003` | Thông báo giao dịch |
| [ ] | `NOTI-004` | Danh sách thông báo |
| [ ] | `NOTI-005` | Số lượng chưa đọc |
| [ ] | `NOTI-006` | Thông báo nổi (toast) |
| [ ] | `NOTI-007` | Điều hướng |
| [ ] | `NOTI-008` | Đánh dấu đã đọc |
| [ ] | `NOTI-009` | Đánh dấu tất cả đã đọc |
| [ ] | `NOTI-010` | Xóa thông báo |


## REMINDER — 7 chức năng

Chi tiết: [`REMINDER_REQUIREMENTS.md`](modules/REMINDER_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `REM-001` | Kiểm tra hồ sơ |
| [ ] | `REM-002` | Nhắc số điện thoại |
| [ ] | `REM-003` | Nhắc email |
| [ ] | `REM-004` | Nhắc địa điểm |
| [ ] | `REM-005` | Hiển thị nhắc nhở |
| [ ] | `REM-006` | Bỏ qua |
| [ ] | `REM-007` | Điều hướng bổ sung |

## Ranh giới phạm vi

- Khách xem Listing/Profile công khai; các tương tác cần đăng nhập. Không có thanh toán, Admin đầy đủ hoặc backend Java trong Đồ án 1.
- **Đề xuất giao dịch/card** hiện thuộc Chat (`CHAT-010` đến `CHAT-014`), không tạo checklist module Transaction riêng để tránh trùng.
- **Listing** có 3 trạng thái `ACTIVE`, `HIDDEN`, `DELETED`.
- **Reminder** chỉ nhắc phone/email đã xác minh và tỉnh/thành phố; không nhắc avatar theo tài liệu module hiện hành.
- Tài liệu này theo dõi **chức năng nghiệp vụ**, không thay thế checklist hạ tầng, API, CI hoặc kiểm thử tổng thể.

## Trạng thái Backend Auth + User

Ngày 13/11/2026: Backend đã triển khai API Auth/User, OTP Redis, phiên PostgreSQL, avatar, Follow/Block và worker xóa tài khoản theo contract tại [OpenAPI](../api/openapi.json). Bằng chứng kiểm thử và giới hạn vận hành nằm tại [INTEGRATION_TESTS.md](../database/INTEGRATION_TESTS.md).

Checklist phía trên theo dõi chức năng toàn sản phẩm; chưa đánh dấu hoàn thành Angular hoặc tích hợp dịch vụ production. Backend được kiểm chứng riêng bằng PostgreSQL/Redis thật, crypto/ảnh thật và fake tại ranh giới provider. SMS/email thật, Google client của dự án, S3 thật và quy trình backup/restore vận hành chưa được nghiệm thu.

## Trạng thái Media preparation

Ngày 13/11/2026: đã chuẩn bị migration `0005`, cleanup có reference guard/outbox retry/local orphan recovery, primitive reserve/write/attach-batch/cancel nội bộ và account-deletion preparation. Chưa mở API Listing/Media hoặc triển khai Listing CRUD/Frontend; các mã MEDIA chưa được đánh dấu hoàn thành. Chi tiết triển khai tại [thiết kế Listing/Media](../api/LISTING_MEDIA_DESIGN.md#9-media--database-preparation--13112026), bằng chứng tại [kiểm thử](../database/INTEGRATION_TESTS.md#media--database-preparation--13112026).
