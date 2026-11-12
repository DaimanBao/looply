# Thiết kế cơ sở dữ liệu — Looply Đồ án 1

## Tài liệu
- [`schema.prisma`](schema.prisma): **bản thiết kế logic hợp nhất** PostgreSQL / Prisma 7.10.1 (17 model), bao phủ Auth, User, Listing, Media, Chat/Transaction và Notification/Outbox.
- [`SCHEMA_REVIEW.md`](SCHEMA_REVIEW.md): ràng buộc xuyên bảng, concurrency, migration và các kiểm thử cần có.
- [`postgres_constraints.reference.sql`](postgres_constraints.reference.sql): SQL CHECK/index **tham khảo**, chưa phải migration được duyệt.
- [`INTEGRATION_TESTS.md`](INTEGRATION_TESTS.md): phạm vi, cách chạy an toàn, kết quả và lỗi còn tồn tại của Database Integration Test.

## Trạng thái và nguồn sự thật
`docs/database/schema.prisma` là bản thiết kế logic xuất phát từ full draft. Schema thực thi hiện nằm tại [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma), cùng lịch sử migration trong [`backend/prisma/migrations/`](../../backend/prisma/migrations/). Ngày 12/11/2026, đã xác minh `0001_init` áp dụng thành công và áp dụng thêm `0002_fix_media_duration`, `0003_reject_nan_prices` trên **riêng `looply_test`** theo phê duyệt của người dùng. Toàn bộ **337 Database Integration Test PASS**, Prisma validate và các kiểm tra source/test đều đạt; xem bằng chứng và giới hạn tại [INTEGRATION_TESTS.md](INTEGRATION_TESTS.md). Không chạy migration trên development/production. Không suy ra hoàn thành chức năng từ việc database test đạt.

Nghiệp vụ chính thức thuộc `../requirements/modules/`. SQL tham khảo chưa đồng bộ đầy đủ với migration thực thi, đặc biệt phần CHAT media, message ảnh và kiểm tra NULL; không dùng thay migration.

Bản `schema_auth_user.prisma` cũ chỉ là **bản nháp từng giai đoạn**, đã bỏ khỏi cây tài liệu chính để tránh hai nguồn schema mâu thuẫn. Không tự `db push`, `migrate reset` hoặc chạy SQL tham khảo lên database dev/prod. Khi khởi tạo project mới, rà soát schema, kiểm tra Prisma 7 config, validate, sinh migration và kiểm thử trên database riêng.

## Các điểm cần xác nhận / triển khai kỹ thuật
- Ràng buộc 1–5 ảnh/Listing và bắt buộc đúng 1 cover cần service + transaction/locking. Migration có partial unique index giới hạn tối đa 1 cover và 1 video chưa xóa; Message có một trường ảnh và UNIQUE ngăn dùng cùng asset cho nhiều tin nhắn. Prisma schema đơn thuần chưa thể hiện hết các quy tắc này.
- Ảnh chat sử dụng `MediaAsset` với `purpose=CHAT` và `Message.imageMediaId`; proposal có `listedPriceSnapshot` để giữ giá lúc gửi. Các quy tắc ownership, loại Media của Message và bảo toàn snapshot cần logic service; database test không thay thế kiểm thử nghiệp vụ.
- `MediaAsset` hiện liên kết với Listing, avatar hoặc Message; cần đảm bảo kiểm tra ownership, trạng thái upload và dọn file mồ côi.
- Sau `0002_fix_media_duration`, CHECK yêu cầu VIDEO có `durationSeconds` nguyên trong khoảng 1–180 giây, IMAGE phải có giá trị NULL. Prisma vẫn dùng `Int?` vì cùng cột phục vụ cả hai loại; CHECK bảo vệ tính bắt buộc theo loại media.
- Sau [`0003_reject_nan_prices`](../../backend/prisma/migrations/0003_reject_nan_prices/migration.sql), cả ba cột giá Decimal đều từ chối NaN. Các điều kiện giá/loại giao dịch/đơn vị thuê/trạng thái và khả năng NULL của snapshot được giữ nguyên. [`migration_lock.toml`](../../backend/prisma/migrations/migration_lock.toml) khóa provider `postgresql` cho Prisma Migrate.
- `Notification`/`OutboxEvent` cần idempotency và worker retry; SQL tham khảo cần đối chiếu schema thực tế trước khi đưa vào migration.
- `Reminder` chỉ là kiểm tra hồ sơ theo phiên, không cần bảng riêng trong phạm vi hiện tại.
- Chưa chốt nhà cung cấp SMS và object storage; thiết kế DB không quyết định nhà cung cấp.
