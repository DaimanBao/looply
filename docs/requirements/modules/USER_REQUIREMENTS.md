# USER — Yêu cầu chức năng (Đồ án 1)

**Phạm vi:** Hồ sơ người dùng, avatar, Follow/Unfollow, Block/Unblock và cập nhật thông tin liên hệ. Tài liệu mô tả hành vi nghiệp vụ, không mô tả cấu trúc code hoặc tiến độ.

## Chức năng

| ID | Chức năng | Yêu cầu chính |
| --- | --- | --- |
| USER-001 | Xem hồ sơ cá nhân | Người dùng đã đăng nhập xem thông tin hồ sơ và thông tin tài khoản của chính mình. |
| USER-002 | Xem hồ sơ người khác | Điều hướng từ tên/avatar đến Profile công khai; xem avatar, tên hiển thị, giới thiệu, tỉnh/thành phố, số Followers/Following và bài đăng đang hiển thị công khai. Có thể mở bài đăng để xem/tương tác theo quyền; trên Profile chỉ được Follow/Unfollow, Block/Unblock, không được sửa hoặc quản lý hồ sơ người khác. |
| USER-003 | Chỉnh sửa hồ sơ | Chủ tài khoản được sửa tên hiển thị, giới thiệu, tỉnh/thành phố; email và số điện thoại không sửa trực tiếp trong form này. |
| USER-004 | Cập nhật avatar | Chủ tài khoản tải ảnh mới để thay avatar; xử lý tệp qua Media. |
| USER-005 | Xóa avatar | Chủ tài khoản xóa avatar hiện tại và trở về avatar mặc định. |
| USER-006 | Follow | Theo dõi người khác; không tự Follow, không tạo quan hệ trùng hoặc Follow mới khi một trong hai bên đang Block bên kia. |
| USER-007 | Unfollow | Bỏ theo dõi sau bước xác nhận; không thay đổi dữ liệu nếu chưa Follow. |
| USER-008 | Xem Followers | Xem danh sách người theo dõi và số lượng; chọn tài khoản để đến Profile tương ứng. |
| USER-009 | Xem Following | Xem danh sách người đang được theo dõi và số lượng; chọn tài khoản để đến Profile tương ứng. |
| USER-010 | Block | Chặn người khác; không tự Block hoặc tạo Block trùng. Xóa Follow cả hai chiều, ngăn tương tác hai chiều; khi đăng nhập, ẩn Profile/Listing của nhau, giữ lịch sử Chat. |
| USER-011 | Unblock | Chỉ người đã Block mới được bỏ Block; khôi phục khả năng Follow/Chat theo quy tắc thông thường, không tự tạo quan hệ Follow. |
| USER-012 | Danh sách đã chặn | Người dùng xem và quản lý danh sách tài khoản do chính mình Block; không công khai danh sách này. |
| USER-013 | Thêm/thay đổi email | Biểu mẫu riêng; chỉ cập nhật email mới sau khi Auth xác minh Email OTP gửi đến địa chỉ mới. |
| USER-014 | Thay đổi số điện thoại | Biểu mẫu riêng; chỉ cập nhật số mới sau khi Auth xác minh SMS OTP gửi đến số mới. |
| USER-015 | Đổi username | Cho đổi ngay lần đầu, sau đó mỗi 30 × 24 giờ; unique và chống cập nhật đồng thời. |
| USER-016 | Xóa/hủy xóa tài khoản | Re-auth, chờ 30 ngày, hủy tường minh trước DELETING; dọn dữ liệu idempotent và giữ lịch sử Chat theo chính sách dưới đây. |
| USER-017 | Danh mục tỉnh/thành phố | API PostgreSQL trả catalog đang hoạt động từ bộ dữ liệu chính thống; mã được server kiểm tra. |

## Quy tắc chung

- **Quyền truy cập:** Khách chưa đăng nhập được xem Profile và bài đăng công khai; mọi thao tác Follow/Block hoặc sửa dữ liệu đều yêu cầu đăng nhập. Chỉ chủ tài khoản được chỉnh sửa hồ sơ, avatar và thông tin liên hệ của mình; Backend phải kiểm tra quyền.
- **Profile và Listing:** Chỉ hiển thị bài đăng công khai trên Profile người khác; thay đổi tỉnh/thành phố hồ sơ không tự cập nhật địa điểm của bài đăng.
- **Follow:** Không phát sinh Notification khi Follow/Unfollow; số lượng phản ánh quan hệ thực tế. Block xóa Follow hai chiều; Unblock không khôi phục Follow.
- **Block:** Ngăn tương tác hai chiều, ẩn Profile/Listing của nhau khi đăng nhập; không xóa lịch sử Chat. Không tạo Notification cho Follow/Block/Unblock. Các service tương tác phải dùng cùng giao thức khóa cặp User để chống race.
- **Avatar:** Khi xóa, hiển thị avatar mặc định; việc tải lên, kiểm tra và xử lý ảnh tuân theo Media.
- **Thông tin liên hệ:** Email tùy chọn khi đăng ký và có thể chưa xác minh; quy tắc chuẩn hóa/quyền sở hữu thuộc [Auth](AUTH_REQUIREMENTS.md). Thay thế email/phone đã xác minh phải qua re-authentication theo thao tác và OTP tới địa chỉ mới; không tin trạng thái xác minh do client tự khai báo.
- **Display Name:** bắt buộc, Unicode (bao gồm tiếng Việt), từ 1 đến 60 Unicode code point, không dùng trực tiếp JavaScript `.length` cho ký tự ngoài BMP; không thêm quy tắc loại bỏ khoảng trắng chưa được phê duyệt.
- **Username:** duy nhất, lowercase, 3–30 ký tự `[a-z0-9_]`; chỉ `_` vẫn hợp lệ. `usernameChangedAt = NULL` nghĩa là chưa từng đổi: được đổi ngay sau đăng ký, kể cả tài khoản Google dùng username tự sinh. Sau mỗi lần đổi thành công phải chờ đủ 30 × 24 giờ; service phải dùng conditional update/transaction để chống request đồng thời. Không dùng `updatedAt` làm mốc cooldown.
- **Province:** catalog 34 tỉnh/thành lưu trong PostgreSQL, seed idempotent từ nguồn chính thống; server tra mã hợp lệ và trạng thái hoạt động. Thay đổi Province của User không sửa Listing.

## Vòng đời xóa tài khoản đã duyệt

- Chính xác bốn trạng thái: `ACTIVE -> PENDING_DELETION -> DELETING -> DELETED`; trạng thái mặc định là `ACTIVE`.
- `ACTIVE` không có `deletionRequestedAt`; `PENDING_DELETION` và `DELETING` bắt buộc có mốc yêu cầu. `DELETED` cho phép giữ hoặc xóa mốc này khi ẩn danh hóa, tránh CHECK cản trở dọn dữ liệu.
- Yêu cầu xóa phải qua re-authentication; chờ 30 ngày. Đăng nhập không tự khôi phục; hủy xóa cần xác nhận tường minh, đưa về `ACTIVE` và xóa mốc yêu cầu. Khi đã `DELETING` thì không thể hủy/khôi phục.
- Trong thời gian chờ, ẩn Profile/Listing bằng điều kiện trạng thái User, không ghi đè trạng thái hiển thị gốc của Listing; cấm tương tác thông thường và gửi tin nhắn mới, giữ lịch sử cho người tham gia còn lại.
- Xóa/ẩn danh phải idempotent, tiếp tục được sau lỗi một phần, hoàn tất các bước bắt buộc trước `DELETED`. Giữ nguyên User ID, tuyệt đối không tái sử dụng hoặc chuyển lịch sử sang tài khoản mới. Chỉ giải phóng username/email/phone cũ sau khi hoàn tất.
- Service dùng conditional updates và cùng giao thức khóa User với Auth để kiểm soát chuyển trạng thái, thời gian chờ và tính không đảo ngược; CHECK chỉ bảo vệ tổ hợp state/timestamp. Outbox giữ trạng thái/lease/retry bền vững; chỉ ghi DELETED khi các bước database/storage bắt buộc đã thành công.

### Chính sách Chat khi xóa tài khoản

- Giữ nguyên hội thoại, nội dung tin nhắn và Chat Media thông thường cho người tham gia còn lại. Khi User DELETED, chỉ hiển thị “Tài khoản đã xóa”; không công khai username kỹ thuật, avatar hoặc profile cũ.
- Không tự quét, che hoặc xóa tin nhắn vì chứa email, phone, địa chỉ hay thông tin cá nhân. Nội dung/tệp nhạy cảm thuộc quy trình báo cáo/yêu cầu riêng có kiểm tra hợp lệ; không triển khai tự động quét trong Đồ án 1.
- Worker không xóa Chat Media. Dọn avatar/Listing Media phải phân biệt purpose và quan hệ Message. Không tạo hội thoại hoặc gửi tin mới tới tài khoản đã xóa.
- Trong 30 ngày chờ xóa giữ dữ liệu/trạng thái Listing/Media gốc; sau hạn xóa mềm vĩnh viễn Listing, dọn nội dung/profile/credential và media không cần giữ. Giữ UUID và tham chiếu lịch sử tối thiểu; hoàn tất dọn dữ liệu bắt buộc rồi mới DELETED.

### Backup và khôi phục

- Backup do Looply quản lý có tuổi tối đa 30 ngày kể từ khi tạo, không tự gia hạn; phải mã hóa và giới hạn quyền truy cập. Account Deletion không phụ thuộc việc sửa/xóa từng backup.
- Restore trong môi trường cách ly, không phục vụ người dùng hoặc chạy tiến trình tương tác. Đối chiếu nguồn trạng thái xóa đáng tin cậy **độc lập với backup** và bao gồm các thay đổi sau thời điểm backup.
- Khôi phục đúng PENDING_DELETION, tiếp tục DELETING idempotent và áp dụng lại ẩn danh/dọn dữ liệu cho DELETED. Kiểm tra không phục hồi credential/profile/dữ liệu đã xóa trước khi mở hệ thống.
- Thiếu nguồn trạng thái xóa, nguồn không đầy đủ hoặc bất kỳ bước kiểm tra thất bại: không mở hệ thống. Repository chưa có hạ tầng backup/restore, mã hóa backup, kho ghi nhận xóa độc lập hoặc tự dọn retention; đây là yêu cầu vận hành chưa triển khai, không phải chức năng đã hoạt động.

## Ranh giới module

- **User:** Hồ sơ, tham chiếu avatar, quan hệ Follow/Block, luồng thay đổi email/phone.
- **Auth:** Phát hành và xác minh OTP, bảo vệ việc cập nhật thông tin liên hệ, xác thực người dùng.
- **Media:** Kiểm tra, xử lý và lưu trữ ảnh avatar.
- **Listing:** Quyết định bài đăng nào công khai và các quyền tương tác với bài đăng.
- **Chat:** Thực thi hạn chế nhắn tin khi tồn tại Block; giữ lịch sử hội thoại.
- **Notification:** Không tạo thông báo chỉ vì Follow/Unfollow.

## Ngoài phạm vi chưa chốt

Không tự bổ sung chức năng ngoài danh mục khi chưa có yêu cầu mới.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
