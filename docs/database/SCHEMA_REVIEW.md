# Required review before integration

> Auth/User `0004_auth_user_preparation` đã áp dụng trên looply_test và development theo [README](README.md#triển-khai-authuser-và-catalog). Media preparation `0005` chỉ áp dụng trên looply_test; không suy ra trạng thái development/production. Listing Backend CRUD/ảnh phase 2 dùng nguyên schema và năm migration; snapshot chưa triển khai. Bằng chứng thuộc [INTEGRATION_TESTS.md](INTEGRATION_TESTS.md).

## Cross-table invariants (cannot be fully expressed by ordinary Prisma relations)
1. User.avatarMediaId must point to ATTACHED PROFILE IMAGE uploaded by the same User. UNIQUE prevents two current avatars pointing at the same MediaAsset; historical unused PROFILE media is allowed. Changing avatar must be atomic with the pointer change. `User.avatarMediaId` creates an FK cycle in the schema, so create User first and avatar later.
2. Listing must have 1–5 active attached images and exactly one cover, max one video; these *minimum/maximum count* constraints require locking Listing and validating in a transaction. Video <=100 MiB/180s; image <=10 MiB; verify actual MIME/file contents. `MediaAsset` is exclusively linked to a single Listing or current avatar; no copying the same asset ID to another target. TEMP may have no Listing. Deleting a Listing must revoke media access even if URL is known.
3. Media physical storage is not transactional with PostgreSQL. TEMP expiry and attachment need a claim/lock protocol; delete objects only after committed detachment and retry safely. `DELETING` is an optional internal transition introduced for worker coordination.
4. Listing type cannot change once any Conversation exists; HIDDEN->ACTIVE increments activeCycle; DELETED is terminal. SALE/EXCHANGE ACCEPTED atomically hides Listing, while RENT remains ACTIVE. PENDING from old cycle can be accepted in a later cycle after fresh eligibility checks. Reject stale price edits from altering proposal snapshots.
5. Conversation LISTING pair is (listingId, contactUserId); contactUserId must not be Listing owner. DIRECT low/high pair is canonical. Exactly two participants, both correct, are created transactionally. Participant.lastReadMessageId must reference a Message in the same Conversation, and only move forward. User Block and new send/proposal must serialize consistently.
6. Message TRANSACTION_CARD must reference Proposal for same Conversation; proposer must be a valid non-owner participant; Proposal type must match Listing. Every Proposal gets one card via same transaction; UNIQUE nullable Message.proposalId guarantees *at most* one, not *at least* one.
7. Notification.MESSAGE and ConversationParticipant.lastReadMessageId are independent. Mark-read must use a captured message boundary to avoid swallowing newly arriving messages. Keep an unread notification per conversation via partial unique; on concurrent create handle conflict. `latestMessageId` is informational, not an ordering/locking primitive. Notification deletion must not resurrect on old event retry.
8. ProcessedEvent is transactional with the Notification change; use consumerName/eventId UNIQUE. Outbox claims use SKIP LOCKED, lease/timeout and retry. Commit notification processing before realtime emit; clients deduplicate and resync after reconnect. Realtime delivery is not exactly-once.
9. `createdAt,id` pagination is deterministic for existing rows, but not a commit-order cursor. For reconnect sync use overlap/backfill or a separately designed durable watermark, not forward-only cursor with timestamp alone.
10. Google signup creates a unique generated username and never merges by email. User may store unverified email declarations; only verified ownership is unique. See [the approved Auth/User design](README.md#chuẩn-bị-schema-auth--user) for normalization, atomic invalidation and lifecycle rules. Auth uses Redis for HMAC OTP, one-use proofs and shared quotas; the old OTP table remains unused for new challenges. Refresh uses compare-and-swap under the same User lock as revocation. Current service/concurrency evidence is recorded in [integration tests](INTEGRATION_TESTS.md); future Chat/Listing consumers must still use the public User gates.
11. SearchTitle is normalized from title by one canonical algorithm (Vietnamese accent folding including đ/Đ), kept in sync on edits. pg_trgm is an index choice, not an automatic accent normalizer. Search only active listings publicly. Price filter/sort requires SALE or RENT; RENT additionally requires DAY/MONTH. EXCHANGE is excluded, never sorted last as if it had a comparable price. Algorithm/cursor: [Listing/Media design](../api/LISTING_MEDIA_DESIGN.md#4-search-filter-feed-và-cursor).
12. Province IDs are UUID FKs; code is UNIQUE and API-facing. Do not delete referenced provinces; administrative code changes require mapping.
13. Listing contactPhone is optional and **must be explicitly supplied for publication**, never silently populated from private User.phone. User may accept/edit the UI suggestion explicitly; Listing Province is independent of User Province.
14. `DECIMAL(15,0)` maps to Prisma Decimal; serialize as string for JSON/API and compare using decimal-safe operations, not JS floating point. All three price fields (`Listing.price`, `TransactionProposal.proposedPrice`, `TransactionProposal.listedPriceSnapshot`) reject NaN after `0003_reject_nan_prices`. Snapshot nullability and all previous price/type/unit/status rules are preserved; fixed precision already rejects positive/negative Infinity.
15. Unique indexes and CHECK constraints in companion SQL are illustrative; confirm enum SQL literals, case, generated DDL, and historical data before applying. Avoid duplicate Prisma and SQL unique indexes.

## Chuẩn bị Listing/Media

Migration [0005_listing_media_preparation](../../backend/prisma/migrations/0005_listing_media_preparation/migration.sql) chỉ thay `ck_media_purpose`; không đổi Prisma shape, enum hoặc migration 0001–0004. Trong transaction, khóa bảng, preflight constraint hiện tại/dữ liệu, DROP rồi ADD lại CHECK với nguyên hai nhánh PROFILE/CHAT và nhánh LISTING thay chính xác:

```sql
purpose = 'LISTING'
AND (status IN ('TEMP', 'DELETING') OR "listingId" IS NOT NULL)
```

Giữ nguyên `ck_media_attached`, `ck_media_cover`, size/duration, FK RESTRICT và partial unique cover/video. Đã áp dụng trên looply_test; chưa áp dụng development/production. ACCESS EXCLUSIVE lock chặn truy cập trong lúc validation, cần chọn thời điểm phù hợp trước deploy trên dữ liệu thật. Không backfill/update/delete Media. Test hồi quy đã chấp nhận DELETING null; vẫn reject ATTACHED null, sai purpose/type/cover và kiểm tra checksum toàn bộ lịch sử.

Account preparation đã clear listingId/position/cover và chuyển DELETING trong transaction trước physical delete. Claim chặn mọi Listing link, current avatar và Message reference; reconciliation dùng outbox lease/retry. Primitive attach ảnh kiểm tra owner, ACTIVE, TTL/readiness dưới khóa User→Listing→Media. Phase 2 thực thi final gallery/cover/detach trong cùng transaction với Listing/version; video upload/replacement mới vẫn cần phase video. Không coi migration CHECK giải quyết các invariant đếm ảnh hoặc ownership; chi tiết tại [lifecycle](../api/LISTING_MEDIA_DESIGN.md#3-media-lifecycle).

Listing.version/activeCycle/Follow/Province/searchTitle/pg_trgm đã có, không thêm field/index cho các chức năng này. Đo query plan trước đề xuất index mới. Snapshot card hiện thiếu text/ảnh lịch sử độc lập; [đề xuất model và migration Chat riêng](CHAT_SNAPSHOT_DESIGN.md) không chặn image CRUD, nhưng bắt buộc trước Chat integration. Không sửa hai bản schema.prisma hoặc SQL tham khảo trong nhiệm vụ thiết kế.

## Required tests before any integration
- Use the installed Prisma 7.10.1 CLI with the actual `backend/prisma7.config.ts`; `prisma validate --config prisma7.config.ts` has passed. Review formatting without rewriting applied migrations.
- Generate migration *without applying* and review generated SQL plus custom indexes/constraints.
- Create a dedicated `_test` PostgreSQL database, verify URL points to it before running any migration.
- Unit/integration tests for simultaneous conversation create, send retry same/different payload, message read cursor monotonicity, block/send race, concurrent proposal accept, media cover swap, TEMP cleanup/attach, notification read/new-message race, duplicate outbox retry, Worker crash and reconnect backfill.

## Deliberately not included in DA1
Admin, payments, orders, shipping, rental calendar, ratings, group chat, voice/video chat, browser push notifications, automatic account merge, RabbitMQ.

## Đồng bộ bổ sung từ yêu cầu module
- `Message.imageMediaId` / `MediaPurpose.CHAT` phục vụ ảnh trong tin nhắn; phải bảo đảm chỉ một ảnh/tin nhắn và file hợp lệ, không tái sử dụng sai chủ sở hữu.
- `TransactionProposal.listedPriceSnapshot` lưu giá tại thời điểm gửi; kiểm tra giá và đơn vị RENT bằng logic nghiệp vụ/transaction.
- Trạng thái thực thi: `looply_test` đã có năm migration từ `0001_init` đến `0005_listing_media_preparation`; checksum kiểm tra cả biến thể LF/CRLF, migration 0001–0004 giữ nguyên. `migration_lock.toml` khóa provider PostgreSQL. SQL tham khảo không thay thế migration. Không suy ra trạng thái dev/prod từ kết quả test.
