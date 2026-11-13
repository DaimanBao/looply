# Công cụ xem OTP Development

Được người dùng phê duyệt riêng để kiểm thử Angular với fake SMS/email. Đây là listener nội bộ độc lập, **không thuộc OpenAPI hoặc API Auth/User** và không có nút xem mã trong giao diện Looply.

## Bật và sử dụng

Trong `backend/.env` cục bộ (đã Git ignore), cấu hình `NODE_ENV=development`, `SMS_PROVIDER=fake`, `EMAIL_PROVIDER=fake`, `DEV_OTP_INSPECTOR_ENABLED=true`, `DEV_OTP_INSPECTOR_PORT=3101` và `DEV_OTP_INSPECTOR_KEY` ngẫu nhiên dạng base64url ít nhất 48 ký tự. Khóa phải độc lập với JWT secret/OTP pepper, không dùng giá trị mẫu hoặc commit vào Git. Có thể sinh bằng `crypto.randomBytes(48).toString('base64url')` và ghi trực tiếp vào file riêng đã ignore; không đưa vào log, URL hay command arguments.

Chạy Backend như bình thường với `npm run dev`. Nó mở API ở cổng cấu hình và listener chỉ tại `127.0.0.1:3101`; lỗi khởi tạo inspector làm startup thất bại và dừng runtime. Trong terminal riêng tại `backend/`, sau khi bấm gửi mã trên form, lấy **challengeId** từ response metadata trong Network của browser rồi chạy:

```powershell
node --env-file=.env scripts/inspect-otp.cjs <challengeId> <destination>
```

Destination phải khớp chính xác giá trị đã chuẩn hóa: phone E.164 hoặc email lowercase/trim. CLI in một mã đang hiệu lực vào terminal riêng của người phát triển; không chuyển output vào log, file, giao diện người dùng hoặc hệ thống thu thập telemetry. Không dùng terminal đang ghi transcript chứa dữ liệu nhạy cảm. Tắt flag và khởi động lại Backend khi không cần dùng.

## Biện pháp bảo vệ

- Mặc định tắt. Chỉ Development; Test/Production từ chối bật. Factory còn kiểm tra `process.env.NODE_ENV=production`, không chỉ tin tham số gọi.
- Bind IPv4 loopback cố định, Bearer key riêng được so sánh bằng `timingSafeEqual`; không dựa vào localhost/CORS để xác thực. Từ chối Origin và Fetch Metadata của browser, không cấp CORS. Không đưa key vào Angular.
- Chỉ nhận `POST /inspect`, JSON tối đa 1 KiB, tối đa 60 request/phút cho listener, deadline socket/request 5 giây; response `Cache-Control: no-store`. Không access log hoặc log mã.
- Đối chiếu challenge UUID, destination, HMAC và fake delivery trong bộ nhớ. Redis phải xác nhận challenge còn tồn tại, còn là challenge hiện tại và chưa bị khóa. Đã tiêu thụ, hết TTL, thay bằng challenge mới hoặc Redis lỗi thì không trả mã.
- Chỉ đọc trạng thái Redis, không gia hạn TTL, bỏ qua OTP verification, reset attempts/cooldown hoặc tiêu thụ mã. Bộ nhớ fake tự xóa mã sau tối đa 5 phút, timer cũ không xóa nhầm delivery mới.
- CLI không nằm trong `dist`; listener có kiểm tra riêng và không được mount ở public app. Không expose cổng này qua Docker/reverse proxy/tunnel. Google/SMS/email gateway/S3 thật nằm ngoài phạm vi.

## Kiểm chứng

Unit test xác minh default-off, khóa riêng, từ chối Production (kể cả caller truyền nhầm Development), browser/Origin và request thiếu key. Integration test dùng PostgreSQL `looply_test`, Redis `/15` và namespace fixture riêng: mã còn hiệu lực đọc được; inspection không reset cooldown; consume hoặc expire challenge làm inspection trả 404. Không chạy migration hoặc cleanup dữ liệu Development cho công cụ này.
