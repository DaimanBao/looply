# Notification — thiết kế triển khai MVP

Nguồn nghiệp vụ: [Notification requirements](../requirements/modules/NOTIFICATION_REQUIREMENTS.md).
Notification sở hữu API, consumer outbox, persistence và UI; Chat/Listing chỉ ghi sự kiện
cùng transaction nghiệp vụ. Không có broker, Socket.IO server thứ hai hoặc Reminder consumer.

## HTTP contract

Mọi endpoint dưới `/api/notifications` yêu cầu Bearer, phiên hiện hành và User ACTIVE,
`Cache-Control: no-store`. Chỉ thao tác dữ liệu thuộc caller; tài nguyên khác trả 404.

| Method/path | Request | Response |
| --- | --- | --- |
| GET /notifications | `limit=30` (1–50), `after?` | `{data:Notification[],pagination:{nextCursor},asOf}` |
| GET /notifications/unread-count | — | `{count}` |
| PUT /notifications/read-all | `{through: ISO timestamp}` giữ nguyên `asOf` của danh sách | 204 |
| PUT /notifications/{notificationId}/read | `{expectedEventId:UUID|null}` từ item | 204; 409 nếu có sự kiện mới |
| DELETE /notifications/{notificationId} | — | 204, idempotent soft delete |
| GET /notifications/{notificationId}/target | — | `{conversationId,messageId:null|UUID}` hoặc 404 đích không khả dụng |

Notification DTO chỉ có `id,type,conversationId,listingId,proposalId,latestMessageId,lastEventId,
isRead,createdAt,updatedAt`; không có nội dung tin nhắn, tên người gửi hoặc storage key.
Loại hiện có: MESSAGE, LISTING_UPDATED, TRANSACTION.
Validation 400; phiên 401; tài nguyên/đích không thuộc caller hoặc không còn khả dụng 404;
ranh giới sự kiện đã đổi 409. Không nhận recipient từ client.

Keyset `(createdAt DESC,id DESC)` gắn tài khoản, không phụ thuộc hàng biên còn tồn tại.
Thông báo gộp giữ createdAt ổn định để không bỏ sót trang; cập nhật updatedAt/latestMessageId.
Đọc/xóa không sửa read cursor Chat. `asOf` là biên sự kiện của recipient, không phải clock client:
consumer giữ recipient lock và ghi updatedAt = max(clock PostgreSQL, max(updatedAt)+1 ms).
GET lấy max(updatedAt), hoặc epoch nếu chưa có hàng. Read/delete giữ nguyên updatedAt;
read-all chỉ xử lý updatedAt <= through và không tăng biên. Vì vậy burst cùng mili giây vẫn
phân biệt được và read-all không bỏ sót hàng đã chụp hoặc nuốt sự kiện sau đó.

## Outbox, đồng thời và lifecycle

Consumer chỉ claim `chat.message.created`, `chat.proposal.resolved`, `listing.updated` bằng
SKIP LOCKED, lease và attempts. Transaction ghi Notification + ProcessedEvent + hoàn tất outbox
cùng lúc, fencing attempts ngăn worker cũ commit. Lỗi retry backoff, không ghi exception/payload.
Khóa User có thứ tự rồi khóa recipient Notification; producer không phụ thuộc consumer.
Kiểm tra lại User ACTIVE, Block hai chiều, membership và dữ liệu tham chiếu từ database.
Listing edit chụp conversationIds dưới Listing lock trong outbox cùng transaction, chỉ gửi contact
có Conversation khi edit, không gửi owner/follower; mỗi version có eventKey.
Event Listing cũ chưa có conversationIds dùng createdAt làm biên tương thích.
Proposal card tạo TRANSACTION cho owner; resolved gửi proposer. TEXT/ảnh tạo MESSAGE cho đối tác.

Một MESSAGE chưa đọc/chưa xóa mỗi recipient/Conversation theo partial unique đã có.
Sự kiện cũ không làm lùi latestMessageId; ProcessedEvent giữ chống replay ngay cả sau soft delete.
Sau đọc/xóa, tin mới tạo thông báo mới. Không tự hết hạn và không đồng nhất với Chat unread.
Realtime sau commit chỉ là invalidation, lỗi emit không đảo transaction đã thành công.

## Presence và realtime

Tái sử dụng namespace `/chat`, cùng Socket.IO server và xác thực từng event/emit.
Client `conversation.view {conversationId,viewing:boolean}` phải qua membership; heartbeat mỗi
10 giây khi trang Conversation và tab visible. Server giữ theo socket, hết hạn sau 35 giây,
xóa khi leave/disconnect và kiểm tra lại phiên khi dùng presence. Nhiều tab: một tab hợp lệ
đang xem là đủ. Không suy presence từ online/join.
Chat chụp cờ suppress vào outbox khi gửi TEXT; worker trễ không dùng presence ở thời điểm xử lý.
Suppress chỉ MESSAGE, không chặn thông báo giao dịch. Không chứa preview.
Server `notification.changed {notificationId:null|UUID}` chỉ gửi socket có phiên đúng recipient.
Mutation đọc/xóa gửi null (không toast); consumer gửi id cho sự kiện mới (toast).
Client tải lại REST, dedup, bỏ response tài khoản cũ; reconnect/focus resync không phát toast cũ.
MVP một Backend process: presence/fanout chưa hỗ trợ nhiều process.

## Database

Dùng Notification/OutboxEvent/ProcessedEvent và constraints hiện có; không cần migration mới.
Không xóa dữ liệu nghiệp vụ khi xóa Notification. Đích luôn kiểm tra lại participant và caller ACTIVE.

## Đối chiếu và giới hạn

NOTI-001/002/003 thuộc source service + consumer; NOTI-004/005/008/009/010 thuộc
NotificationService và API; NOTI-006/007 thuộc Angular center/list và Chat target navigation.
Card cũ được tải qua keyset history hiện có, có hủy theo route/identity và highlight sau render.
Lệnh và bằng chứng nằm tại [Backend](../../backend/README.md#notification-module),
[Frontend](../../frontend/README.md#notification-module) và [integration tests](../database/INTEGRATION_TESTS.md#notification-module--20112026).
Repository không có SRS/NFR riêng tại thời điểm triển khai; đối chiếu yêu cầu module,
schema và API hiện có, không tự đặt cam kết p95. Chưa nghiệm thu browser ngoài Chrome,
fanout/presence nhiều Backend process hoặc delivery realtime exactly-once.
