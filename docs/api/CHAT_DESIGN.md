# Chat — thiết kế triển khai

Nguồn nghiệp vụ: [Chat requirements](../requirements/modules/CHAT_REQUIREMENTS.md).
REST và Socket.IO dùng chung application services, transaction PostgreSQL và xác thực phiên Auth.
Không triển khai consumer Notification/Reminder. Chat chỉ ghi outbox chứa định danh, không chứa nội dung.

## HTTP contract

Mọi endpoint dưới `/api/conversations` yêu cầu Bearer, User ACTIVE và `Cache-Control: no-store`.
UUID client chỉ định tài nguyên, không cấp quyền. Resource không thuộc participant trả 404.

| Method/path | Request | Response |
| --- | --- | --- |
| POST /conversations | `{type:'LISTING',listingId}` hoặc `{type:'DIRECT',userId}` | 200 Conversation (tạo hoặc dùng lại) |
| GET /conversations | `limit=30` (1–50), `after?`, `group?=DIRECT/LISTING`, `listingId?` | `{data, pagination:{nextCursor}}` |
| GET /conversations/{conversationId} | — | 200 Conversation |
| DELETE /conversations/{conversationId} | — | 204, chỉ ẩn Inbox của caller |
| GET /conversations/{conversationId}/messages | `limit=30` (1–50), `after?` | trang tin mới nhất trước, keyset createdAt/id |
| POST /conversations/{conversationId}/messages | `{requestId,content?,imageMediaId?}` | 200 Message, replay cùng payload trả bản cũ; khác payload 409 |
| PUT /conversations/{conversationId}/read | `{messageId}` | 204, cursor tăng đơn điệu, đồng thời delivered |
| PUT /conversations/{conversationId}/delivered | `{messageId}` | 204, xác nhận nhận từ client, cursor tăng đơn điệu |
| POST /conversations/{conversationId}/proposals | `{requestId,kind,proposedPrice?}` | 200 Message TRANSACTION_CARD |
| PATCH /conversations/{conversationId}/proposals/{proposalId} | `{status:'ACCEPTED'/'REJECTED'}` | 200 Message; cùng kết quả idempotent, khác kết quả 409 |
| POST /conversations/{conversationId}/images | raw octet-stream ảnh ≤10 MiB | 201 `{id,expiresAt}` TEMP CHAT, ràng buộc Conversation |
| DELETE /conversations/{conversationId}/images/{mediaId} | — | 204 hủy TEMP của uploader |
| GET /conversations/{conversationId}/messages/{messageId}/image | — | WebP riêng tư của TEXT image |
| GET /conversations/{conversationId}/messages/{messageId}/snapshot | — | WebP cover snapshot riêng, hết hạn 404 |

Validation 400; thiếu/sai phiên 401; Block/self/proposal sai vai trò 403; resource 404;
pending slot/state/lease/requestId conflict 409; quá dung lượng 413; sai ảnh 415; storage 503.
Text 1–5000 Unicode code points sau trim; ảnh có thể không có text. Giá chuỗi số nguyên dương ≤15 chữ số.
Proposal kind `LISTED_PRICE`, `NEGOTIATED_PRICE`, `EXCHANGE_CONTACT`; server chụp giá/type/unit/title/cover.

## Realtime contract

Socket.IO 4, namespace `/chat`, auth `{token: accessToken}`. Origin khớp cấu hình Auth.
Middleware xác thực handshake; mỗi event và mỗi lần phát cho socket kiểm tra lại token/phiên.
Không phục hồi socket room mà bỏ qua xác thực. Không nhận room/userId/senderId từ client.

Client events: `conversation.join` `{conversationId}`, `message.send` `{conversationId,message:MessageInput}`,
`conversation.read`/`conversation.delivered` `{conversationId,messageId}`.
Ack `{ok:true,data}` hoặc `{ok:false,error:{code,message}}`; input strict, giới hạn payload 64 KiB.
Server `chat.changed` `{conversationId}` chỉ là tín hiệu tải lại REST sau commit, không mang nội dung preview.
Join cấp quyền theo participant; mọi client của participant nhận invalidation sau commit.
Reconnect phải xác thực lại, tải Inbox và history từ REST. Delivery receipt do client xác nhận, không suy từ emit.
Retry gửi giữ nguyên requestId/payload. Socket không là nguồn dữ liệu bền vững.
Triển khai một Backend process cho MVP; chưa có fanout nhiều process hoặc cam kết exactly-once delivery.

## Khóa, lifecycle và snapshot

Thứ tự khóa: User (sorted) → Listing nếu có → Conversation → Media → Snapshot.
Read lịch sử cho phép đối tác inactive/Block, nhưng caller vẫn phải ACTIVE. Tạo nội dung mới cần cả hai ACTIVE, không Block.
Conversation cũ tiếp tục TEXT với Listing HIDDEN/DELETED; proposal chỉ xử lý khi ACTIVE.
Unhide cả hai participant khi có Message mới; không xóa lịch sử. Inbox có filter nhóm và Listing.
Read/delivered cursor dùng createdAt/id, không lùi, không chấp nhận Message khác Conversation.
Proposal PENDING duy nhất theo constraint; SALE/EXCHANGE accept ẩn Listing và tăng version, RENT giữ ACTIVE.

Snapshot theo [thiết kế database](../database/CHAT_SNAPSHOT_DESIGN.md): reservation trước copy,
publish recheck lease/version/cover/block/session/pending trong transaction. File copy riêng, không chia sẻ lifecycle Listing.
Ảnh hết hạn theo tháng UTC được thu hồi trước activity mới để không hồi sinh; delivery kiểm tra lại sau đọc storage.
Worker thu hồi rồi xóa vật lý idempotent; lưu tombstone để retry/crash/ghi muộn không phục hồi quyền đọc.

Triển khai: `backend/src/modules/chat/`, public Media/Listing adapters và `frontend/src/app/features/chat/`.
Tiến độ chức năng thuộc [checklist](../requirements/FUNCTIONAL_REQUIREMENTS.md); kết quả kiểm chứng thuộc
[Database Integration Tests](../database/INTEGRATION_TESTS.md) và [Frontend README](../../frontend/README.md#chat-module).
Chưa nghiệm thu p95, browser ngoài Chrome, live S3 hoặc fanout nhiều Backend process.

## Đối chiếu yêu cầu

| Mã | Nơi triển khai chính | Kiểm chứng |
| --- | --- | --- |
| CHAT-001/002 | ConversationService + unique constraints | Concurrent creation và hai loại Conversation |
| CHAT-003/004/015 | ConversationService, Angular Inbox/Conversation | API membership/cursor, Chrome Inbox nhóm Listing, reload và đổi tài khoản |
| CHAT-005 | Participant.hiddenAt, MessageService.restore | Hide riêng một phía, replay không restore, tin mới restore |
| CHAT-006/007/008/009 | MessageService, ChatMediaService, gateway, Angular state | HTTP/Socket.IO, ảnh, cursor 30, delivered/read, Block/IDOR và stale responses |
| CHAT-010/011/012/013/014/016 | ProposalService, Listing adapter, snapshot/retention | SALE/RENT/EXCHANGE, pending slot, snapshot bất biến, atomic accept/cycle, lỗi copy/rollback/expiry/cleanup |
| CHAT-017 | ChatEvents/outbox identifiers | Chỉ contract phát sinh sự kiện; delivery/UI thuộc Notification, nằm ngoài nhiệm vụ |
