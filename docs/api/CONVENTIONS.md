# Quy ước API Backend

Nguồn hợp đồng HTTP là [`openapi.json`](openapi.json), OpenAPI 3.1, gồm Core và Auth/User. `GET /api/health` giữ nguyên response `{ "status": "ok", "service": "looply-backend" }`; đây là liveness, không cam kết kiểm tra database cho từng request.

Mọi response đi qua app có header `X-Request-ID`. Chỉ tái sử dụng request ID có dạng UUID; giá trị khác được thay bằng UUID mới. Server không tin `X-Forwarded-For` khi chưa có cấu hình reverse proxy được duyệt.

Lỗi có dạng `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [{ "path": "body.field", "code": "..." }] } }`. `details` chỉ có ở lỗi validation, không chứa giá trị đầu vào. Các nhóm lỗi: 400 validation/JSON không hợp lệ, 401 authentication, 403 authorization/CORS, 404 not found, 409 conflict, 413 body quá lớn, 415 content encoding không hỗ trợ, 429 rate limit, 500 internal, 503 database unavailable. Không trả stack trace, query, tên constraint hoặc nội dung lỗi database cho client ở bất kỳ môi trường nào.

Response thành công dùng DTO tường minh, không tự bọc health hoặc trả trực tiếp model database. Decimal tiền chuyển thành chuỗi hữu hạn. Danh sách Followers/Following/Blocked nhận limit 1–100 (mặc định 30), after UUID và trả `{data,pagination:{nextCursor}}`; sort UUID tăng dần, fetch thêm một dòng để quyết định cursor. Profile/email/phone/credential không được serialize chung một DTO công khai.

Validation kiểm tra body/query/params bằng Zod, lưu dữ liệu trong `res.locals.validated` dưới dạng unknown trước khi controller thu hẹp theo DTO; không ghi vào getter `req.query` của Express 5. UUID trong resource lock được canonical hóa lowercase. Feature có DTO/controller/routes riêng và mount qua `featureRouters`. Routes chỉ nối middleware/handler import, không triển khai auth/validation/nghiệp vụ.

CORS chỉ cho phép origin HTTP(S) được khai báo trong `CORS_ORIGINS`; mặc định không có origin cross-site nào được phép. Credentials mặc định tắt. Preflight hợp lệ trả 204, không tiêu thụ quota API. Rate limit áp dụng `/api`, kể cả health, theo IP trực tiếp của connection; dùng memory store trong một process, reset khi process khởi động lại. Các tham số là cấu hình môi trường, không phải chính sách khóa tài khoản.

Các route dùng trong test để kích hoạt validation/error chỉ tồn tại trong Router test được inject, không phải API production và không được thêm vào OpenAPI.

## Auth/User transport

- Access Token Bearer chỉ chứa định danh User/session, JWT 15 phút. Server tra AuthSession và User state mỗi lần; thu hồi session có hiệu lực cả với Access Token chưa hết hạn.
- Refresh Token là opaque secret chỉ đi qua HttpOnly Cookie `looply_refresh`, SameSite=Strict, Path=/api/auth, Secure ở production. Refresh/logout phải có Origin trong allowlist; CORS credentials phải bật đúng origin. Không dùng wildcard hoặc trả refresh token trong JSON.
- Login/register/refresh trả `{accessToken,expiresIn,status}`. Google challenge trả nonce/challengeId; Angular dùng nonce khi xin credential. OTP chỉ trả challengeId/expiresIn, không trả code; re-auth chỉ trả proof/expiresIn, không trả password hoặc OTP.
- Request bảo vệ dùng Bearer; `/auth/otp/request`, `/auth/google/challenge` và profile công khai chấp nhận Bearer tùy trường hợp. Protected OTP purposes bắt buộc phiên ACTIVE. Token tùy chọn sai/hết hạn phải bị từ chối, không hạ xuống anonymous để vượt Block.
- Auth/User response có Cache-Control no-store. Email/phone chỉ nằm trong DTO `/users/me`; profile công khai không chứa verification timestamps, hash hoặc token.
- Header Origin là do browser gửi; Angular không tự ghi header bị cấm này. Angular giữ JWT trong memory, dùng withCredentials và gộp concurrent refresh thành một request. Chi tiết tích hợp và cấu hình thuộc [Backend README](../../backend/README.md#tích-hợp-angular).
- Upload avatar dùng raw `application/octet-stream`, không multipart/base64 hoặc đường dẫn storage. Server kiểm tra nội dung, decode và tối ưu ảnh trước khi đổi pointer. GET avatar dùng cùng quyền Profile/Block và không công khai URL storage.
- Account PENDING_DELETION chỉ dùng GET `/users/me` và DELETE `/users/me/deletion`; đăng nhập không hủy xóa. DELETING/DELETED không tạo hoặc dùng phiên. Backend đã cung cấp gate để Chat/Listing tương lai cấm tương tác hai chiều; không thêm endpoint Chat/Listing giả.
