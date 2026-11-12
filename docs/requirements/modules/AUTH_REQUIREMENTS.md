# AUTH — Yêu cầu chức năng (Đồ án 1)

**Phạm vi:** Đăng ký, đăng nhập, xác minh danh tính, quản lý phiên và xác thực yêu cầu. Đây là yêu cầu hành vi; không mô tả cấu trúc code hay tiến độ triển khai.

## Chức năng

| ID | Chức năng | Yêu cầu chính |
| --- | --- | --- |
| AUTH-001 | Đăng ký nội bộ | Nhận username, password, số điện thoại, tỉnh/thành phố và OTP SMS hợp lệ; chỉ tạo tài khoản khi xác minh thành công. **Không có trường email khi đăng ký.** |
| AUTH-002 | OTP đăng ký | Gửi SMS OTP tới số điện thoại đăng ký; Backend xác minh trước khi tạo tài khoản và ghi nhận số đã xác minh. |
| AUTH-003 | Đăng nhập username/password | Xác thực username và password hash; không dùng email thay username. |
| AUTH-004 | Đăng nhập phone/OTP | Gửi và xác minh SMS OTP cho số điện thoại thuộc tài khoản hợp lệ; áp dụng giới hạn thử sai. |
| AUTH-005 | Đăng nhập Google | Backend xác minh Google credential; tạo tài khoản Google mới khi phù hợp. Không tự động liên kết/gộp với tài khoản nội bộ, kể cả trùng email. |
| AUTH-006 | Tạo phiên | Sau đăng nhập thành công, cấp Access Token và Refresh Token, lưu phiên phía server. |
| AUTH-007 | Làm mới phiên | Chỉ chấp nhận Refresh Token còn hiệu lực, chưa bị thu hồi; xoay token mỗi lần refresh, không tái sử dụng token cũ. |
| AUTH-008 | Đăng xuất | Thu hồi phiên và Refresh Token hiện tại ở server. Access Token đã cấp có thể còn hiệu lực đến khi hết hạn. |
| AUTH-009 | Xác minh đổi số điện thoại | Gửi/xác minh SMS OTP tới **số mới**; chỉ cập nhật sau khi xác minh thành công. |
| AUTH-010 | Xác minh thêm/đổi email | Gửi/xác minh email OTP tới **email mới**; chỉ lưu sau khi xác minh thành công. Email được quản lý từ Profile, không nằm trong form đăng ký nội bộ. |
| AUTH-011 | Xác thực request | Kiểm tra Access Token tại Backend và cung cấp danh tính đã xác thực; module sở hữu tài nguyên chịu trách nhiệm kiểm tra quyền nghiệp vụ. |

## Quy tắc chung

- **Username:** chuẩn hóa lowercase; chỉ chấp nhận `[a-z0-9_]+`; duy nhất; độc lập với email.
- **Password:** cho phép ký tự đặc biệt; chỉ lưu hash, không lưu hoặc ghi log plaintext.
- **Số điện thoại:** bắt buộc và duy nhất cho đăng ký nội bộ; chuẩn hóa E.164; xác minh trước khi tạo tài khoản.
- **OTP SMS:** 4 chữ số; hết hạn sau 60 giây; gửi lại sau ít nhất 60 giây; tối đa 5 lần nhập sai. Khóa đăng nhập **phone/OTP** trong 1 giờ khi vượt giới hạn; không mặc định khóa đăng nhập username/password hoặc Google.
- **Bảo mật OTP:** Backend kiểm tra hạn, số lần thử, cooldown và mục đích OTP; không lưu/ghi log OTP rõ; không chấp nhận trạng thái xác minh do client tự khai báo.
- **Token:** Access Token 15 phút; Refresh Token 7 ngày, lưu hash theo phiên và rotate khi refresh.
- **Nhà cung cấp OTP:** SMS và email sử dụng adapter/provider riêng; Twilio và SendGrid là lựa chọn đã nêu trong bản yêu cầu trước, cần xác nhận cấu hình, chi phí và khả năng gửi thực tế trước khi coi là tích hợp hoàn tất.
- **Google:** phương thức đăng nhập riêng; tài khoản Google có thể chưa có phone hoặc tỉnh/thành phố và vẫn được sử dụng. Không tự tạo username/password nội bộ cho tài khoản Google.

## Ranh giới module

- **Auth** sở hữu credential, OTP, xác minh email/phone, token, session và xác thực danh tính.
- **User** sở hữu hồ sơ và luồng cập nhật thông tin; khi thêm/đổi email hoặc phone phải sử dụng xác minh của Auth. User không tự sửa trực tiếp thông tin này khi chưa xác minh.
- Nhắc bổ sung thông tin hồ sơ thuộc Reminder phối hợp User–Frontend; Auth chỉ xác minh thông tin liên hệ.

## Ngoài phạm vi chưa chốt

Không tự bổ sung quên/đổi mật khẩu, quản lý nhiều phiên, logout mọi thiết bị, liên kết tài khoản Google–nội bộ, khóa/khôi phục tài khoản khi chưa có yêu cầu cụ thể. Chỉ bổ sung khi có quyết định yêu cầu mới.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
