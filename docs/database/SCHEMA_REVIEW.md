# Required review before integration

## Cross-table invariants (cannot be fully expressed by ordinary Prisma relations)
1. User.avatarMediaId must point to ATTACHED PROFILE IMAGE uploaded by the same User. UNIQUE prevents two current avatars pointing at the same MediaAsset; historical unused PROFILE media is allowed. Changing avatar must be atomic with the pointer change. `User.avatarMediaId` creates an FK cycle in the schema, so create User first and avatar later.
2. Listing must have 1–5 active attached images and exactly one cover, max one video; these *minimum/maximum count* constraints require locking Listing and validating in a transaction. Video <=100MB/180s; image <=10MB; verify actual MIME/file contents. `MediaAsset` is exclusively linked to a single Listing or current avatar; no copying the same asset ID to another target. TEMP may have no Listing. Deleting a Listing must revoke media access even if URL is known.
3. Media physical storage is not transactional with PostgreSQL. TEMP expiry and attachment need a claim/lock protocol; delete objects only after committed detachment and retry safely. `DELETING` is an optional internal transition introduced for worker coordination.
4. Listing type cannot change once any Conversation exists; HIDDEN->ACTIVE increments activeCycle; DELETED is terminal. SALE/EXCHANGE ACCEPTED atomically hides Listing, while RENT remains ACTIVE. PENDING from old cycle can be accepted in a later cycle after fresh eligibility checks. Reject stale price edits from altering proposal snapshots.
5. Conversation LISTING pair is (listingId, contactUserId); contactUserId must not be Listing owner. DIRECT low/high pair is canonical. Exactly two participants, both correct, are created transactionally. Participant.lastReadMessageId must reference a Message in the same Conversation, and only move forward. User Block and new send/proposal must serialize consistently.
6. Message TRANSACTION_CARD must reference Proposal for same Conversation; proposer must be a valid non-owner participant; Proposal type must match Listing. Every Proposal gets one card via same transaction; UNIQUE nullable Message.proposalId guarantees *at most* one, not *at least* one.
7. Notification.MESSAGE and ConversationParticipant.lastReadMessageId are independent. Mark-read must use a captured message boundary to avoid swallowing newly arriving messages. Keep an unread notification per conversation via partial unique; on concurrent create handle conflict. `latestMessageId` is informational, not an ordering/locking primitive. Notification deletion must not resurrect on old event retry.
8. ProcessedEvent is transactional with the Notification change; use consumerName/eventId UNIQUE. Outbox claims use SKIP LOCKED, lease/timeout and retry. Commit notification processing before realtime emit; clients deduplicate and resync after reconnect. Realtime delivery is not exactly-once.
9. `createdAt,id` pagination is deterministic for existing rows, but not a commit-order cursor. For reconnect sync use overlap/backfill or a separately designed durable watermark, not forward-only cursor with timestamp alone.
10. Google signup creates unique generated username and never merges by email. Verified email only in User; pending email in OTP. OTP hashing needs HMAC/pepper for low-entropy codes; rotate refresh hash atomically. User/password lockout, OTP resend throttles, rate limiting and presence heartbeat need service/shared state.
11. SearchTitle is normalized from title by one canonical algorithm (Vietnamese accent folding including đ/Đ), kept in sync on edits. pg_trgm is an index choice, not an automatic accent normalizer. Search only active listings publicly. Cursor sort price puts EXCHANGE last using explicit query order.
12. Province IDs are UUID FKs; code is UNIQUE and API-facing. Do not delete referenced provinces; administrative code changes require mapping.
13. Listing contactPhone is optional and **must be explicitly supplied for publication**, never silently populated from private User.phone. Confirm if it is desired in MVP before implementation.
14. `DECIMAL(15,0)` maps to Prisma Decimal; serialize as string for JSON/API and compare using decimal-safe operations, not JS floating point.
15. Unique indexes and CHECK constraints in companion SQL are illustrative; confirm enum SQL literals, case, generated DDL, and historical data before applying. Avoid duplicate Prisma and SQL unique indexes.

## Required tests before any integration
- Prisma format + validate using the locked 7.10.1 CLI and real `prisma.config.ts` in a safe checkout.
- Generate migration *without applying* and review generated SQL plus custom indexes/constraints.
- Create a dedicated `_test` PostgreSQL database, verify URL points to it before running any migration.
- Unit/integration tests for simultaneous conversation create, send retry same/different payload, message read cursor monotonicity, block/send race, concurrent proposal accept, media cover swap, TEMP cleanup/attach, notification read/new-message race, duplicate outbox retry, Worker crash and reconnect backfill.

## Deliberately not included in DA1
Admin, payments, orders, shipping, rental calendar, ratings, group chat, voice/video chat, browser push notifications, automatic account merge, RabbitMQ.

## Đồng bộ bổ sung từ yêu cầu module
- `Message.imageMediaId` / `MediaPurpose.CHAT` phục vụ ảnh trong tin nhắn; phải bảo đảm chỉ một ảnh/tin nhắn và file hợp lệ, không tái sử dụng sai chủ sở hữu.
- `TransactionProposal.listedPriceSnapshot` lưu giá tại thời điểm gửi; kiểm tra giá và đơn vị RENT bằng logic nghiệp vụ/transaction.
- Chưa chạy Prisma CLI hoặc migration trong lần chỉnh sửa tài liệu này; mọi ràng buộc SQL là tham khảo đến khi review và test.
