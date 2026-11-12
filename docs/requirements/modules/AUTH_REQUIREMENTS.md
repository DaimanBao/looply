# AUTH — Yêu cầu chức năng (Đồ án 1)

**Phạm vi:** Đăng ký, đăng nhập, xác minh danh tính, quản lý phiên và xác thực yêu cầu. Đây là yêu cầu hành vi; không mô tả cấu trúc code hay tiến độ triển khai.

## Chức năng

| ID | Chức năng | Yêu cầu chính |
| --- | --- | --- |
| AUTH-001 | Đăng ký nội bộ | Nhận username, password, số điện thoại, tỉnh/thành phố và OTP SMS hợp lệ; chỉ tạo tài khoản khi xác minh thành công. Email tùy chọn và không bắt buộc xác minh khi đăng ký. |
| AUTH-002 | OTP đăng ký | Gửi SMS OTP tới số điện thoại đăng ký; Backend xác minh trước khi tạo tài khoản và ghi nhận số đã xác minh. |
| AUTH-003 | Đăng nhập username/password | Xác thực username và password hash; không dùng email thay username. |
| AUTH-004 | Đăng nhập phone/OTP | Gửi và xác minh SMS OTP cho số điện thoại thuộc tài khoản hợp lệ; áp dụng giới hạn thử sai. |
| AUTH-005 | Đăng nhập Google | Backend xác minh Google credential; tạo tài khoản Google mới khi phù hợp. Không tự động liên kết/gộp với tài khoản nội bộ, kể cả trùng email. |
| AUTH-006 | Tạo phiên | Sau đăng nhập thành công, cấp Access Token và Refresh Token, lưu phiên phía server. |
| AUTH-007 | Làm mới phiên | Chỉ chấp nhận Refresh Token còn hiệu lực, chưa bị thu hồi; xoay token mỗi lần refresh, không tái sử dụng token cũ. |
| AUTH-008 | Đăng xuất | Thu hồi phiên và Refresh Token hiện tại ở server. Access Token đã cấp có thể còn hiệu lực đến khi hết hạn. |
| AUTH-009 | Xác minh đổi số điện thoại | Gửi/xác minh SMS OTP tới **số mới**; chỉ cập nhật sau khi xác minh thành công. |
| AUTH-010 | Xác minh thêm/đổi email | Gửi/xác minh email OTP tới **email mới**; chỉ thay thế email đã xác minh sau khi xác minh thành công. Khai báo email chưa xác minh không có quyền sở hữu. |
| AUTH-011 | Xác thực request | Kiểm tra Access Token tại Backend và cung cấp danh tính đã xác thực; module sở hữu tài nguyên chịu trách nhiệm kiểm tra quyền nghiệp vụ. |

## Quy tắc chung

- **Username:** chuẩn hóa lowercase; 3–30 ký tự theo `^[a-z0-9_]{3,30}$`, kể cả chỉ gồm `_`; duy nhất; độc lập với email. Quy tắc đổi username thuộc [User](USER_REQUIREMENTS.md).
- **Email:** tùy chọn, có thể chưa xác minh; chuẩn hóa `trim().toLowerCase()` trước lưu và so sánh, giữ nguyên dấu chấm và `+suffix`. Nhiều User được khai báo cùng email chưa xác minh; chỉ một User được sở hữu email đã xác minh. Khi xác lập quyền sở hữu, service phải vô hiệu hóa các khai báo chưa xác minh xung đột theo cơ chế atomic, phối hợp cả các request thêm khai báo đồng thời. Partial unique index bảo vệ verified ownership nhưng không tự dọn các khai báo này. Không dùng email làm Google identity.
- **Password:** cho phép ký tự đặc biệt; chỉ lưu hash, không lưu hoặc ghi log plaintext.
- **Số điện thoại:** bắt buộc và duy nhất cho đăng ký nội bộ; chuẩn hóa E.164; xác minh trước khi tạo tài khoản.
- **OTP SMS:** 6 chữ số, hạn 5 phút, tối đa 5 lần thử; gửi lại sau ít nhất 60 giây, tối đa 5 lần gửi/giờ; khóa 15 phút khi vượt giới hạn. Redis sẽ lưu OTP tạm thời, attempts, cooldown và hạn mức dùng chung; chưa triển khai. Bảng `OtpChallenge` hiện có được giữ nguyên trong đợt chuẩn bị schema.
- **Re-authentication:** dữ liệu tạm thời sẽ lưu trong Redis; gắn với thao tác cụ thể và phiên hiện tại, hạn tối đa 5 phút. Chưa triển khai API/service hoặc Redis trong đợt chuẩn bị database.
- **Bảo mật OTP:** Backend kiểm tra hạn, số lần thử, cooldown và mục đích OTP; không lưu/ghi log OTP rõ; không chấp nhận trạng thái xác minh do client tự khai báo.
- **Token:** Access Token 15 phút; Refresh Token 7 ngày, lưu hash theo phiên và rotate khi refresh.
- **Nhà cung cấp OTP:** SMS và email sử dụng adapter/provider riêng; Twilio và SendGrid là lựa chọn đã nêu trong bản yêu cầu trước, cần xác nhận cấu hình, chi phí và khả năng gửi thực tế trước khi coi là tích hợp hoàn tất.
- **Google:** nhận diện bằng provider `sub`; tự sinh username duy nhất, không bắt buộc password; tài khoản có thể chưa có phone hoặc tỉnh/thành phố. Khi Google verified email trùng với Looply verified email, liên kết phải qua xác thực bổ sung một lần; không tự hợp nhất tài khoản.

## Ranh giới module

- **Auth** sở hữu credential, OTP, xác minh email/phone, token, session và xác thực danh tính.
- **User** sở hữu hồ sơ và luồng cập nhật thông tin; khi thêm/đổi email hoặc phone phải sử dụng xác minh của Auth. User không tự sửa trực tiếp thông tin này khi chưa xác minh.
- Nhắc bổ sung thông tin hồ sơ thuộc Reminder phối hợp User–Frontend; Auth chỉ xác minh thông tin liên hệ.

## Ngoài phạm vi chưa chốt

Các luồng Auth đã được phê duyệt chỉ là yêu cầu dự kiến, chưa hoàn thành khi schema có đủ field. Đợt chuẩn bị database không triển khai controller/service/endpoint, OTP Redis, re-authentication hoặc worker xóa tài khoản. Vòng đời tài khoản và điều kiện hủy xóa thuộc [User](USER_REQUIREMENTS.md).

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
