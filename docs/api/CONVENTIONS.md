# Quy ước API Backend Core

Nguồn hợp đồng HTTP là [`openapi.json`](openapi.json), OpenAPI 3.1. Hiện chỉ triển khai `GET /api/health`; giữ nguyên response `{ "status": "ok", "service": "looply-backend" }`. Endpoint này là liveness của HTTP process, không cam kết kiểm tra database cho từng request.

Mọi response đi qua app có header `X-Request-ID`. Chỉ tái sử dụng request ID có dạng UUID; giá trị khác được thay bằng UUID mới. Server không tin `X-Forwarded-For` khi chưa có cấu hình reverse proxy được duyệt.

Lỗi có dạng `{ "error": { "code": "...", "message": "...", "requestId": "...", "details": [{ "path": "body.field", "code": "..." }] } }`. `details` chỉ có ở lỗi validation, không chứa giá trị đầu vào. Các nhóm lỗi: 400 validation/JSON không hợp lệ, 401 authentication, 403 authorization/CORS, 404 not found, 409 conflict, 413 body quá lớn, 415 content encoding không hỗ trợ, 429 rate limit, 500 internal, 503 database unavailable. Không trả stack trace, query, tên constraint hoặc nội dung lỗi database cho client ở bất kỳ môi trường nào.

Response thành công dùng DTO tường minh theo từng endpoint, không tự bọc health trong envelope mới và không trả trực tiếp model database. Decimal tiền được chuyển thành chuỗi thập phân hữu hạn; không dùng JSON replacer toàn cục để vô tình công khai mọi field. Helper cursor pagination nhận limit/after đã kiểm tra và tạo `{ data, pagination: { nextCursor } }`; chưa có endpoint phân trang hoặc thuật toán cursor nghiệp vụ trong Core.

Request validation kiểm tra đồng thời body/query/params bằng Zod và lưu kết quả đã parse/transform trong `res.locals.validated`; không ghi vào getter `req.query` của Express 5. Module tương lai khai báo DTO/schema và controller riêng, rồi mount Router qua dependency `featureRouters` của app factory. Router sở hữu middleware xác thực khi Auth được triển khai; Core chưa chọn token transport hoặc cơ chế authentication.

CORS chỉ cho phép origin HTTP(S) được khai báo trong `CORS_ORIGINS`; mặc định không có origin cross-site nào được phép. Credentials mặc định tắt. Preflight hợp lệ trả 204, không tiêu thụ quota API. Rate limit áp dụng `/api`, kể cả health, theo IP trực tiếp của connection; dùng memory store trong một process, reset khi process khởi động lại. Các tham số là cấu hình môi trường, không phải chính sách khóa tài khoản.

Các route dùng trong test để kích hoạt validation/error chỉ tồn tại trong Router test được inject, không phải API production và không được thêm vào OpenAPI.
