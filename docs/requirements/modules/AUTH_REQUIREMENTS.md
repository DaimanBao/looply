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
| AUTH-006 | Tạo phiên | Sau đăng ký hoặc đăng nhập thành công, cấp Access Token và Refresh Token, lưu phiên phía server; hỗ trợ nhiều thiết bị. |
| AUTH-007 | Làm mới phiên | Chỉ chấp nhận Refresh Token còn hiệu lực, chưa bị thu hồi; xoay token mỗi lần refresh, không tái sử dụng token cũ. |
| AUTH-008 | Đăng xuất | Thu hồi phiên và Refresh Token hiện tại; Access Token của phiên đã thu hồi phải bị từ chối khi xác thực request. |
| AUTH-009 | Xác minh đổi số điện thoại | Gửi/xác minh SMS OTP tới **số mới**; chỉ cập nhật sau khi xác minh thành công. |
| AUTH-010 | Xác minh thêm/đổi email | Gửi/xác minh email OTP tới **email mới**; chỉ thay thế email đã xác minh sau khi xác minh thành công. Khai báo email chưa xác minh không có quyền sở hữu. |
| AUTH-011 | Xác thực request | Kiểm tra Access Token tại Backend và cung cấp danh tính đã xác thực; module sở hữu tài nguyên chịu trách nhiệm kiểm tra quyền nghiệp vụ. |
| AUTH-012 | Đổi mật khẩu | Yêu cầu re-auth theo thao tác, kiểm tra mật khẩu mới và thu hồi các phiên khác sau khi đổi. |
| AUTH-013 | Khôi phục mật khẩu | Chỉ gửi OTP tới email/phone đã xác minh thuộc tài khoản; không tiết lộ tài khoản tồn tại hay không; thành công thu hồi toàn bộ phiên. |
| AUTH-014 | Liên kết Google | Liên kết provider sub với tài khoản đang đăng nhập sau xác thực bổ sung; không tự merge theo email. |
| AUTH-015 | Re-authentication | Xác minh password, OTP phone đã sở hữu hoặc Google đã liên kết; phát hành proof một lần theo thao tác/phiên, hạn 5 phút. |
| AUTH-016 | Quản lý phiên | Liệt kê metadata phiên của chính mình và thu hồi từng phiên; không trả hash/token hoặc cho sửa phiên của User khác. |

## Quy tắc chung

- **Username:** chuẩn hóa lowercase; 3–30 ký tự theo `^[a-z0-9_]{3,30}$`, kể cả chỉ gồm `_`; duy nhất; độc lập với email. Quy tắc đổi username thuộc [User](USER_REQUIREMENTS.md).
- **Email:** tùy chọn, có thể chưa xác minh; chuẩn hóa `trim().toLowerCase()` trước lưu và so sánh, giữ nguyên dấu chấm và `+suffix`. Nhiều User được khai báo cùng email chưa xác minh; chỉ một User được sở hữu email đã xác minh. Khi xác lập quyền sở hữu, service phải vô hiệu hóa các khai báo chưa xác minh xung đột theo cơ chế atomic, phối hợp cả các request thêm khai báo đồng thời. Partial unique index bảo vệ verified ownership nhưng không tự dọn các khai báo này. Không dùng email làm Google identity.
- **Password:** 8–128 Unicode code point, cho phép ký tự đặc biệt; hash Argon2id với salt ngẫu nhiên; từ chối mật khẩu phổ biến/bị lộ thông qua kiểm tra breach. Chỉ lưu hash, không ghi log plaintext; provider kiểm tra mật khẩu lỗi thì không chấp nhận đổi/tạo password.
- **Số điện thoại:** bắt buộc và duy nhất cho đăng ký nội bộ; chuẩn hóa E.164; xác minh trước khi tạo tài khoản.
- **OTP SMS:** 6 chữ số, hạn 5 phút, tối đa 5 lần thử; gửi lại sau ít nhất 60 giây, tối đa 5 lần gửi/giờ; khóa 15 phút khi vượt giới hạn. Redis lưu HMAC OTP, attempts, cooldown và hạn mức dùng chung theo destination; gửi lại không reset số lần sai. Challenge gắn purpose, destination và User/session cho thao tác bảo vệ; code được tiêu thụ nguyên tử một lần. Bảng `OtpChallenge` cũ giữ nguyên nhưng không dùng cho OTP mới.
- **Re-authentication:** proof lưu dạng hash trong Redis, gắn thao tác và phiên hiện tại, hạn 5 phút, dùng một lần. Redis lỗi thì từ chối thao tác, không fallback sang memory/PostgreSQL.
- **OTP đăng nhập/khôi phục:** gắn với User sở hữu verified contact tại thời điểm cấp; khi contact chuyển sang tài khoản khác, mã đã cấp không cho đăng nhập hoặc reset mật khẩu của chủ mới. Backend tự chọn User ID và kiểm tra ownership trong transaction, không nhận User ID từ client.
- **Bảo mật OTP:** Backend kiểm tra hạn, số lần thử, cooldown và mục đích OTP; không lưu/ghi log OTP rõ; không chấp nhận trạng thái xác minh do client tự khai báo.
- **Token:** JWT Access Token 15 phút, Angular giữ trong memory; Refresh Token ngẫu nhiên, hash theo AuthSession và rotate nguyên tử, hạn tuyệt đối 7 ngày. Refresh qua HttpOnly Cookie; request dùng Access Token phải kiểm tra phiên server chưa thu hồi/hết hạn. Cookie-only refresh/logout yêu cầu Origin cho phép; không trả refresh token trong JSON.
- **Nhà cung cấp OTP:** SMS/email dùng adapter riêng; fake chỉ development/test, không xuất OTP qua API Auth/User công khai, response thông thường hoặc log; production phải từ chối fake. Theo quyết định riêng ngày 13/11/2026, được phép có CLI Development qua listener loopback độc lập, mặc định tắt, key xác thực riêng, bị từ chối ở Production; chỉ đọc delivery còn hiệu lực gắn đúng challenge, không đổi Redis TTL/cooldown/attempts hoặc tạo đường tắt xác minh. Hướng dẫn và biện pháp bảo vệ thuộc [OTP inspector](../../../backend/src/development/README.md). Gateway thật cần được cấu hình và kiểm chứng gửi thực tế trước vận hành; không mặc định đã tích hợp nhà cung cấp thương mại.
- **Google:** nhận diện bằng provider `sub`; tự sinh username duy nhất, không bắt buộc password; tài khoản có thể chưa có phone hoặc tỉnh/thành phố. Khi Google verified email trùng với Looply verified email, liên kết phải qua xác thực bổ sung một lần; không tự hợp nhất tài khoản.

## Ranh giới module

- **Auth** sở hữu credential, OTP, xác minh email/phone, token, session và xác thực danh tính.
- **User** sở hữu hồ sơ và luồng cập nhật thông tin; khi thêm/đổi email hoặc phone phải sử dụng xác minh của Auth. User không tự sửa trực tiếp thông tin này khi chưa xác minh.
- Nhắc bổ sung thông tin hồ sơ thuộc Reminder phối hợp User–Frontend; Auth chỉ xác minh thông tin liên hệ.

## Ranh giới phạm vi

Không tự bổ sung provider hoặc phương thức đăng nhập ngoài ba phương thức đã duyệt. Vòng đời tài khoản và điều kiện hủy xóa thuộc [User](USER_REQUIREMENTS.md). Account PENDING_DELETION có thể đăng nhập để xem thông tin của mình và hủy xóa; không tự khôi phục hoặc cho tương tác thông thường. DELETING/DELETED không được tạo phiên.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
