# Thiết kế cơ sở dữ liệu — Looply Đồ án 1

## Tài liệu
- [`schema.prisma`](schema.prisma): **bản thiết kế logic hợp nhất** PostgreSQL / Prisma 7.10.1 (18 model), bao phủ Auth, User, Listing, Media, Chat/Transaction và Notification/Outbox.
- [`SCHEMA_REVIEW.md`](SCHEMA_REVIEW.md): ràng buộc xuyên bảng, concurrency, migration và các kiểm thử cần có.
- [`postgres_constraints.reference.sql`](postgres_constraints.reference.sql): SQL CHECK/index **tham khảo**, chưa phải migration được duyệt.
- [`INTEGRATION_TESTS.md`](INTEGRATION_TESTS.md): phạm vi, cách chạy an toàn, kết quả và lỗi còn tồn tại của Database Integration Test.
- [`CHAT_SNAPSHOT_DESIGN.md`](CHAT_SNAPSHOT_DESIGN.md): snapshot card độc lập, retention ảnh 12/24 tháng, authorization và migration Chat `0006`/`0007`.
- [Thiết kế Listing/Media](../api/LISTING_MEDIA_DESIGN.md): lifecycle, khóa, search/cursor và kế hoạch triển khai; [chuẩn bị migration](SCHEMA_REVIEW.md#chuẩn-bị-listingmedia) đã triển khai `0005` trên looply_test, chưa áp dụng development/production.

## Trạng thái và nguồn sự thật

**Chat — 20/11/2026:** `0006_chat_module` và `0007_chat_reservation_version` đã áp dụng sau khi xác minh URL và `current_database() = looply_test`. Thêm `ListingCardSnapshot`, `Conversation.lastActivityAt`, delivered cursor và scope của CHAT upload. Migration backfill activity từ lịch sử thực, không dựng snapshot giả từ Listing hiện tại; có integration test rollback trên schema cũ. Không migrate development/production trong nhiệm vụ Chat. Các đoạn kiểm chứng theo phase dưới đây là bằng chứng lịch sử; trạng thái test hiện tại có bảy migration.
`docs/database/schema.prisma` là bản thiết kế logic hợp nhất. Schema thực thi nằm tại [`backend/prisma/schema.prisma`](../../backend/prisma/schema.prisma), cùng lịch sử migration trong [`backend/prisma/migrations/`](../../backend/prisma/migrations/). Trên `looply_test` đã áp dụng bảy migration từ `0001_init` đến `0007_chat_reservation_version`; bằng chứng kiểm thử và giới hạn thuộc [INTEGRATION_TESTS.md](INTEGRATION_TESTS.md). Read-only preflight 20/11/2026 xác nhận development `looply_dev` có `0001`–`0005`; không áp dụng `0006`/`0007` lên development trong nhiệm vụ Chat. Không suy ra nghiệm thu chức năng từ việc schema test đạt.

Nghiệp vụ chính thức thuộc `../requirements/modules/`. SQL tham khảo chưa đồng bộ đầy đủ với migration thực thi, đặc biệt phần CHAT media, message ảnh và kiểm tra NULL; không dùng thay migration.

Bản `schema_auth_user.prisma` cũ chỉ là **bản nháp từng giai đoạn**, đã bỏ khỏi cây tài liệu chính để tránh hai nguồn schema mâu thuẫn. Không tự `db push`, `migrate reset` hoặc chạy SQL tham khảo lên database dev/prod. Khi khởi tạo project mới, rà soát schema, kiểm tra Prisma 7 config, validate, sinh migration và kiểm thử trên database riêng.

## Môi trường database

PostgreSQL 17 local chạy bằng Docker theo [`compose.yaml`](../../compose.yaml); cổng truy cập từ máy phát triển là `localhost:5435`, ánh xạ tới cổng `5432` trong container. Prisma ORM sử dụng phiên bản **7.10.1** và cấu hình [`backend/prisma7.config.ts`](../../backend/prisma7.config.ts).

Compose dùng volume external có sẵn `looply-rebuild_postgres_data` để tiếp tục dữ liệu sau khi đổi tên workspace. Volume này phải tồn tại trước khi chạy Compose; không tự tạo volume thay thế, xóa volume hoặc khởi tạo lại dữ liệu khi không tìm thấy. Có thể kiểm tra chỉ đọc bằng `docker volume inspect looply-rebuild_postgres_data`. Thay đổi này không chạy migration hoặc đổi database.

| Môi trường | Database | Biến kết nối trong Backend | Mục đích |
| --- | --- | --- | --- |
| Development | `looply_dev` | `DATABASE_URL` | Phát triển Backend; không dùng cho database integration tests. |
| Testing local | `looply_test` | `TEST_DATABASE_URL` | Database kiểm thử riêng trên cùng PostgreSQL server Docker local; test xác minh database thực tế và rollback dữ liệu. |

CI dùng PostgreSQL service riêng trên runner; dù cũng đặt tên database là `looply_test`, dữ liệu và kết nối độc lập với local. Chi tiết thuộc [`workflows/CI.md`](../workflows/CI.md). Credentials chỉ nằm trong cấu hình môi trường cục bộ hoặc môi trường thực thi phù hợp, không ghi vào tài liệu.

**Development đã xác minh ngày 12/11/2026:** `DATABASE_URL` và `SELECT current_database()` đều xác nhận `looply_dev`. Đã áp dụng thành công `0001_init`, `0002_fix_media_duration`, `0003_reject_nan_prices` bằng Prisma Migrate Deploy; lịch sử và checksum hợp lệ, đủ 17 bảng ứng dụng, các constraint/index hợp lệ và Prisma validate PASS. Không chạy integration test trên Development. Production là môi trường riêng; kết quả local không xác nhận trạng thái production.

## Chuẩn bị schema Auth + User

Migration [`0004_auth_user_preparation`](../../backend/prisma/migrations/0004_auth_user_preparation/migration.sql) chỉ chuẩn bị database cho năm nhóm thay đổi đã duyệt; không triển khai chức năng ứng dụng:

- `User.email` không còn global unique. `uq_user_verified_email` là partial unique expression index chỉ với `emailVerifiedAt IS NOT NULL`; CHECK chỉ yêu cầu có email khi có timestamp xác minh. Khai báo chưa xác minh không chiếm quyền sở hữu.
- Index so sánh lowercase sau khi trim tập whitespace của JavaScript `trim()` (bao gồm tab/newline và Unicode whitespace), giữ dấu chấm/`+suffix`. Service tương lai phải lưu `email.trim().toLowerCase()` và vô hiệu hóa atomic các khai báo xung đột; index không tự sửa giá trị đã lưu hoặc làm việc dọn khai báo. Không bật Prisma preview feature; expression index/CHECK được quản lý bằng SQL migration. Email không còn là khóa `findUnique` trong Prisma Client; repository tương lai phải tra verified ownership tường minh.
- Username CHECK chính xác `^[a-z0-9_]{3,30}$`, giữ unique. `usernameChangedAt` nullable, không index hoặc backfill giả; cooldown do service thực thi theo [User requirements](../requirements/modules/USER_REQUIREMENTS.md).
- `UserStatus` gồm đúng `ACTIVE`, `PENDING_DELETION`, `DELETING`, `DELETED`; thêm `status` mặc định `ACTIVE` và `deletionRequestedAt` nullable. CHECK: ACTIVE không có mốc; PENDING_DELETION/DELETING phải có mốc; DELETED có thể giữ hoặc xóa mốc khi ẩn danh. CHECK không kiểm soát thứ tự chuyển trạng thái; service phải dùng conditional updates.
- `displayName` là `varchar(60) NOT NULL` với CHECK 1–60 ký tự Unicode (`char_length`); không tự sửa dữ liệu cũ.

Migration khóa bảng User trong transaction, preflight verified email sau chuẩn hóa và Display Name, tạo unique index mới trước khi bỏ index cũ. Nếu có dữ liệu xung đột/không hợp lệ thì dừng, không UPDATE/DELETE User. Việc khóa có thể chặn truy cập bảng trong lúc tạo index; cần chọn thời điểm phù hợp khi áp dụng cho database có dữ liệu lớn. Không sửa ba migration lịch sử.

Giữ nguyên 17 model, toàn bộ quan hệ/FK, AuthSession, GoogleAccount, Follow/Block, Province và OtpChallenge. Không thêm job/token history/re-auth table hoặc index dự phòng. Bằng chứng kiểm thử schema và Auth/User thuộc [INTEGRATION_TESTS.md](INTEGRATION_TESTS.md); server không tự áp dụng migration.

## Triển khai Auth/User và catalog

Nhiệm vụ Auth/User đã cho phép áp dụng riêng `0004` lên development sau preflight. Đã xác minh actual target `looply_dev`, ba migration/checksum cũ, 0 xung đột email chuẩn hóa và 0 User vi phạm trước deploy; chỉ áp dụng `0004_auth_user_preparation`, không UPDATE/DELETE User. Không tạo migration mới, sửa schema hoặc truy cập production. Database integration vẫn chỉ chạy trên `looply_test`.

`npm run seed:provinces` (hoặc `prisma db seed --config prisma7.config.ts`) upsert 34 code/name theo [Quyết định 19/2025/QĐ-TTg, Phụ lục I](https://chinhphu.vn/?classid=0&docid=214409&pageid=27160), hiệu lực danh mục từ 01/07/2025; đối chiếu [bảng mã do Chính phủ công bố](https://baochinhphu.vn/chi-dao-dieu-hanh-cua-chinh-phu-thu-tuong-chinh-phu-ngay-4-7-2025-1-102250704190956567.htm). Source catalog nằm ở `backend/src/modules/user/province-catalog.ts`. Giữ UUID đang được FK tham chiếu, không xóa code khác; script từ chối production và xác minh database thực tế trước ghi. Đã seed catalog trên development; test idempotency chạy trong transaction rollback riêng.

Auth mutations dùng transaction/advisory lock User; email ownership có thêm lock email chuẩn hóa và partial unique index, OTP/re-auth có atomic Lua riêng ở Redis. Không chạy `OtpChallenge` cho OTP mới và không bỏ bảng cũ. Outbox chỉ chứa identifier/timestamp cần thiết cho account/media cleanup, không có plaintext credential/OTP hay profile snapshot. Cancel đánh dấu các job cũ đã xử lý; worker xác minh claim/state trước DELETING để job cũ không tác động yêu cầu mới.

User UUID được giữ trong tombstone, username kỹ thuật ngẫu nhiên hợp lệ thay thế username cũ. Profile và credential được dọn trong transaction cuối; PostgreSQL FK RESTRICT giữ lịch sử Chat. Storage delete phải thành công trước DELETED, Chat Media không được chọn cho cleanup. Hạ tầng backup/restore và nguồn trạng thái xóa độc lập chưa có; chính sách/điều kiện mở lại hệ thống thuộc [User requirements](../requirements/modules/USER_REQUIREMENTS.md#backup-và-khôi-phục), không suy ra từ outbox trong cùng bản backup.

## Các điểm cần xác nhận / triển khai kỹ thuật
- Ràng buộc 1–5 ảnh/Listing và bắt buộc đúng 1 cover cần service + transaction/locking. Migration có partial unique index giới hạn tối đa 1 cover và 1 video chưa xóa; Message có một trường ảnh và UNIQUE ngăn dùng cùng asset cho nhiều tin nhắn. Prisma schema đơn thuần chưa thể hiện hết các quy tắc này.
- Ảnh chat sử dụng `MediaAsset` với `purpose=CHAT` và `Message.imageMediaId`; proposal có `listedPriceSnapshot` để giữ giá lúc gửi. Các quy tắc ownership, loại Media của Message và bảo toàn snapshot cần logic service; database test không thay thế kiểm thử nghiệp vụ.
- `MediaAsset` hiện liên kết với Listing, avatar hoặc Message; cần đảm bảo kiểm tra ownership, trạng thái upload và dọn file mồ côi.
- Sau `0002_fix_media_duration`, CHECK yêu cầu VIDEO có `durationSeconds` nguyên trong khoảng 1–180 giây, IMAGE phải có giá trị NULL. Prisma vẫn dùng `Int?` vì cùng cột phục vụ cả hai loại; CHECK bảo vệ tính bắt buộc theo loại media.
- Sau [`0003_reject_nan_prices`](../../backend/prisma/migrations/0003_reject_nan_prices/migration.sql), cả ba cột giá Decimal đều từ chối NaN. Các điều kiện giá/loại giao dịch/đơn vị thuê/trạng thái và khả năng NULL của snapshot được giữ nguyên. [`migration_lock.toml`](../../backend/prisma/migrations/migration_lock.toml) khóa provider `postgresql` cho Prisma Migrate.
- `Notification`/`OutboxEvent` cần idempotency và worker retry; SQL tham khảo cần đối chiếu schema thực tế trước khi đưa vào migration.
- `Reminder` chỉ là kiểm tra hồ sơ theo phiên, không cần bảng riêng trong phạm vi hiện tại.
- Chưa chốt nhà cung cấp SMS và object storage; thiết kế DB không quyết định nhà cung cấp.
