# Thiết kế cơ sở dữ liệu — Looply Đồ án 1

## Tài liệu
- [`schema.prisma`](schema.prisma): **bản thiết kế logic hợp nhất** PostgreSQL / Prisma 7.10.1 (17 model), bao phủ Auth, User, Listing, Media, Chat/Transaction và Notification/Outbox.
- [`SCHEMA_REVIEW.md`](SCHEMA_REVIEW.md): ràng buộc xuyên bảng, concurrency, migration và các kiểm thử cần có.
- [`postgres_constraints.reference.sql`](postgres_constraints.reference.sql): SQL CHECK/index **tham khảo**, chưa phải migration được duyệt.

## Trạng thái và nguồn sự thật
Đây là **bản thiết kế đề xuất được tổng hợp từ bản full draft có trong ZIP gốc**, đồng bộ với yêu cầu module hiện tại. **Chưa có bằng chứng schema 17 model đã được người dùng phê duyệt cuối cùng, chạy `prisma validate`, hoặc áp dụng vào DB**. Không gọi là migration đã chốt/đã triển khai. Các quyết định nghiệp vụ chính thức thuộc `../requirements/modules/`; nếu khác nhau, cần xác nhận trước khi áp dụng.

Bản `schema_auth_user.prisma` cũ chỉ là **bản nháp từng giai đoạn**, đã bỏ khỏi cây tài liệu chính để tránh hai nguồn schema mâu thuẫn. Không tự `db push`, `migrate reset` hoặc chạy SQL tham khảo lên database dev/prod. Khi khởi tạo project mới, rà soát schema, kiểm tra Prisma 7 config, validate, sinh migration và kiểm thử trên database riêng.

## Các điểm cần xác nhận / triển khai kỹ thuật
- Ràng buộc 1–5 ảnh/Listing, tối đa 1 video, 1 cover và tối đa 1 ảnh/tin nhắn phải được bảo vệ bằng service + transaction/locking; Prisma schema đơn thuần chưa đủ.
- Ảnh chat sử dụng `MediaAsset` với `purpose=CHAT` và `Message.imageMediaId`; proposal có `listedPriceSnapshot` để giữ giá lúc gửi. Đây là **bổ sung kỹ thuật từ yêu cầu hiện tại**, chưa được validate bằng Prisma CLI.
- `MediaAsset` hiện liên kết với Listing, avatar hoặc Message; cần đảm bảo kiểm tra ownership, trạng thái upload và dọn file mồ côi.
- `Notification`/`OutboxEvent` cần idempotency và worker retry; SQL tham khảo cần đối chiếu schema thực tế trước khi đưa vào migration.
- `Reminder` chỉ là kiểm tra hồ sơ theo phiên, không cần bảng riêng trong phạm vi hiện tại.
- Chưa chốt nhà cung cấp SMS và object storage; thiết kế DB không quyết định nhà cung cấp.
