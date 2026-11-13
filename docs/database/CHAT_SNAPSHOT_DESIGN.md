# Đề xuất database cho snapshot card Listing trong Chat

> Nghiệp vụ giữ ảnh độc lập và retention 12/24 tháng **đã phê duyệt** tại [Chat requirements](../requirements/modules/CHAT_REQUIREMENTS.md#6-snapshot-lịch-sử-và-retention-ảnh--đã-phê-duyệt). Cấu trúc dưới đây là **đề xuất kỹ thuật chưa triển khai**, không phải Prisma schema đã duyệt hoặc migration đã tạo. Không triển khai Chat trong nhiệm vụ thiết kế Listing.

## 1. So sánh và lựa chọn đề xuất

| Phương án | Toàn vẹn và Prisma | Authorization/retention/cleanup | Storage và mở rộng |
|---|---|---|---|
| Field trực tiếp Message | Ít relation nhưng nhiều nullable field và CHECK theo MessageType; trộn dữ liệu TEXT và card | Qua Message→Conversation; staging/expiry vẫn cần metadata riêng, khó tách bất biến text khỏi image lifecycle | Copy ảnh riêng vẫn cần; Message lớn hơn mỗi lần card mở rộng |
| **Model ListingCardSnapshot riêng, 0..1–1 Message khi đã publish** | Một model, FK/unique/check riêng, không đổi ý nghĩa Message.imageMediaId vốn phục vụ TEXT image | Qua Conversation participant, stage/copy/retire tách khỏi Message; một row theo dõi một file ảnh độc lập | Thêm storage copy cho mỗi card, không dedup vật lý; đủ scope Modular Monolith |
| Snapshot + shared MediaObject/reference tracking | Thêm model object/reference + FK + ref locking/counting; nhiều writer | Thu hồi từng ref độc lập, xóa chỉ khi mọi ref hết hiệu lực; authorization không thể suy từ object ID | Tiết kiệm copy nếu nhiều card, nhưng phức tạp ref races và cleanup; chưa có nhu cầu đo được |

Đề xuất phương án thứ hai. Không tái sử dụng `Message.imageMediaId` vì CHECK hiện cấm TRANSACTION_CARD có imageMediaId; không gán purpose CHAT vào MediaAsset gắn Listing (CHECK purpose cấm). Không sửa các CHECK này để lách snapshot. Một snapshot sở hữu **một private object key duy nhất**, không shared file/hardlink với cover hoặc snapshot khác. Unique key bảo vệ điều này; nếu sau này dedup, bắt buộc thiết kế ref table và khóa mọi ref trước xóa, không chỉ đếm best-effort.

## 2. Model dự kiến khi triển khai Chat

Giữ nguyên mọi Prisma file trong nhiệm vụ hiện tại. Một migration Chat tương lai được review riêng sẽ thêm:

| Thành phần | Dữ liệu/ràng buộc đề xuất |
|---|---|
| ListingCardSnapshot.id | UUID server; private key sinh từ UUID, không đưa ra API |
| messageId | UUID nullable trong staging, UNIQUE, FK Message RESTRICT; khi publish bắt buộc có Message cùng Conversation và type TRANSACTION_CARD |
| conversationId/listingId | FK RESTRICT tới Conversation/Listing, bắt buộc; listingId không đổi khi Listing bị scrub; kiểm tra Conversation.listingId khớp bằng service tx |
| title/type/listedPrice/rentalUnit | Title tại lúc gửi (varchar150); ListingType; Decimal(15,0)?; RentalUnit?; CHECK SALE/RENT giá hữu hạn dương, RENT có unit, EXCHANGE price/unit null; text bất biến sau publish. Giá đề xuất/kết quả xử lý vẫn thuộc TransactionProposal, không tạo nguồn giá thứ hai có thể sửa |
| createdAt | Server reservation timestamp, phục vụ orphan staging; chưa phải thời điểm gửi |
| sourceMediaId/sourceListingVersion | FK MediaAsset RESTRICT nullable và Int dương khi PREPARING, phục vụ bảo vệ nguồn trong copy/recheck version; clear khi AVAILABLE hoặc REVOKED. Không giữ source reference vĩnh viễn |
| snapshotCreatedAt | Nullable khi staging; khi publish bằng Message.createdAt do server ghi, không client timestamp, immutable |
| imageStorageKey/imageMimeType/imageSizeBytes | Key private UNIQUE, WebP snapshot thumbnail, BigInt dương; không storage URL trong DTO. Key được giữ nội bộ qua retry cho tới xóa vật lý thành công |
| imageState | Enum riêng PREPARING, AVAILABLE, REVOKED, DELETED; PREPARING không có messageId/snapshotCreatedAt; AVAILABLE có cả hai; REVOKED/DELETED cho phép staging thất bại không có Message |
| imageRevokedAt/imageDeletedAt | Server timestamp nullable; REVOKED có revokedAt; DELETED có cả hai; tuyệt đối không REVOKED→AVAILABLE. Không xóa text khi retire ảnh |
| Conversation.lastActivityAt | Timestamptz mới tường minh cho retention, server-only; không tái sử dụng updatedAt hoặc lastMessageAt vì read/housekeeping và proposal resolution có ngữ nghĩa khác |

Không cần persisted `retentionExpiresAt`: tính từ snapshotCreatedAt và Conversation.lastActivityAt. Index mới chỉ theo unique/FK identity cần thiết và query plan thực tế cho worker; không thêm index hiệu năng dự phòng. Với dữ liệu cũ, backfill lastActivityAt từ max(Message.createdAt, Proposal.resolvedAt, Conversation.createdAt). Không tự tạo ảnh/text snapshot lịch sử từ cover/title hiện tại: không thể phục hồi chính xác quá khứ. Card cũ thiếu snapshot phải có DTO placeholder/legacy unavailable rõ ràng, không giả mạo ảnh lịch sử; nếu đã có dữ liệu thật phải review migration/backfill trước áp dụng.

## 3. Publish và rollback

1. Chat dùng clock server + transaction User (cả hai, sorted)→Listing→Conversation→Media nguồn; recheck active/session/block/type/version/cycle và cover hợp lệ. Tạo row snapshot PREPARING có text/version nguồn đã capture và generated image key, commit. Không tạo Message/proposal PENDING trước khi copy hoàn tất; không trả card cho client.
2. Ngoài DB transaction, Media copy **thumbnail bytes hiện tại** sang object riêng (không pointer/key cover hiện tại). Trong suốt copy có bounded deadline; source có thể bị detach sau tx prepare: copy thiếu file thì fail/retry, không gửi card với ảnh sai. Để bảo đảm source không bị xóa khi copy còn quyền tham chiếu, cleanup nguồn phải kiểm tra PREPARING snapshot reservations còn hạn; reservation ghi sourceMediaId FK nullable trong snapshot và clear khi publish/revoke. Đây là field staging cần thêm trong migration Chat; User/Listing/Media locks chung serialize reservation/claim. Không snapshot raw ảnh đầy đủ/metadata nhạy cảm khi thumbnail đủ render card.
3. Tx lần hai cùng thứ tự khóa, rồi snapshot row; recheck reservation chưa bị revoke, session/Block, Listing version/cover/type/price/cycle chưa đổi, unique requestId và pending slot. Nếu đổi, hủy staging và yêu cầu retry mới (không dùng snapshot stale). Tạo TransactionProposal, Message và link snapshot AVAILABLE trong cùng transaction; snapshotCreatedAt=Message.createdAt, cập nhật lastActivityAt, clear sourceMediaId. Replay requestId cùng payload trả card cũ, không tạo ảnh/snapshot thứ hai; race thua cleanup copy thừa qua row staging REVOKED.
4. Nếu storage hoặc tx thất bại, PREPARING có lease kỹ thuật 15 phút từ createdAt, không phục vụ ảnh. Worker recheck dưới Conversation/Media locks; quá lease đánh dấu REVOKED + enqueue cleanup, commit rồi delete. Copy đang chạy quá deadline không thể publish lại; writer dọn file ghi muộn, orphan reconciliation phát hiện theo key/row. PG rollback không rollback storage.

## 4. Hoạt động, lịch và quyền đọc

Nguồn chính sách thuộc Chat requirements. Thiết kế thực thi: `lastActivityAt` chỉ tăng theo thời gian server khi **tin nhắn người dùng mới đã commit** (TEXT/ảnh/card) hoặc **lần chuyển proposal thành ACCEPTED/REJECTED đã commit**; idempotent retry, đọc/xem/tải ảnh/mark-read, hide/unhide participant, worker, notification/system event không tăng. Khi chưa có nội dung dùng Conversation.createdAt. Không dùng thời gian client; dưới Conversation lock, update monotonic max(current, now). Khóa kỹ thuật không tự làm mới hoạt động.

`retentionExpiresAt = min(addCalendarMonthsUTC(conversationLastActivityAt,12), addCalendarMonthsUTC(snapshotCreatedAt,24))`. Calendar month tính trên UTC, giữ giờ/phút/giây/ms, clamp ngày cuối tháng (29/02→28/02 nếu năm đích không nhuận); không coi tháng là 30 ngày. `now >= expiresAt` là hết hạn. Inject clock cho service/tests, lấy một mốc now nhất quán trong tx.

Để tránh ảnh đã hết hạn sống lại vì tin nhắn đến trước worker: trước mỗi lần ghi activity, trong cùng Conversation lock, **retire các AVAILABLE snapshot có hạn cũ <= now** rồi mới tăng lastActivityAt; ghi REVOKED/outbox atomically. Không cho gia hạn ảnh đã REVOKED hoặc đã hết hạn. Worker và activity dùng cùng khóa; lastActivityAt không thể làm expiry cũ bị bỏ qua. Absolute cap luôn snapshotCreatedAt+24 tháng.

Media API Chat tương lai chỉ cho participant có quyền xem lịch sử hiện tại; account gate hiện hành vẫn áp dụng. Block giữ quyền đọc lịch sử theo User/Chat, cấm nội dung mới; account uploader DELETED không làm mất ảnh người còn lại. Participant.hiddenAt chỉ ẩn Inbox cá nhân, không xóa Conversation/reference hoặc rút ngắn retention của phía còn lại. Không coi hiddenAt là căn cứ tiêu hủy.

Khi bắt đầu delivery kiểm tra membership + imageState AVAILABLE + now<expiresAt, không key public/presigned URL lâu sống/cache bypass. Cache-Control no-store. Card DTO trả `imageAvailable`/authenticated delivery path nếu hợp lệ, ngược lại placeholder; không lộ key. Đọc lại quyền/expiry sau storage read và trước gửi headers để chặn read bị treo qua expiry; không thể thu hồi bytes client đã tải trước đó, không hứa thu hồi bản sao ngoài server.

## 5. Revocation, cleanup và account deletion

- Worker bounded batch khóa Conversation rồi snapshot (không xin thêm User phía sau); nếu cần User gate acquire trước Conversation theo protocol. Dưới khóa tính lại expiry; activity có thể đã gia hạn trước hạn nên không xóa theo timestamp trong job cũ. Nếu hết hạn hoặc có quyết định yêu cầu xóa hợp lệ: REVOKED + revokedAt + durable outbox trong tx. Quyền đọc hết ngay theo điều kiện thời gian dù worker chưa chạy.
- Sau commit Media xóa private object; missing là thành công. Mark imageDeletedAt/state DELETED chỉ sau storage delete; giữ snapshot text, message/proposal/Listing UUID. Crash sau delete trước mark retry an toàn. Ref source PREPARING phải được giải phóng khi revoked; không xóa source Listing nếu vẫn ATTACHED hoặc có reservation hợp lệ khác.
- Quy trình xử lý yêu cầu xóa hợp lệ là gate vận hành riêng đã nêu trong User requirements: chỉ người có quyền xử lý mới được revoke; không tự thêm public endpoint, tự quét PII hoặc lấy account deletion làm bằng chứng phải xóa mọi lịch sử.
- Account deletion chỉ dọn file Listing/profile riêng, không chọn key snapshot. Không tăng activity, không reset retention clock, không auto-revoke ảnh của participant còn lại; hết hạn/yêu cầu hợp lệ vẫn thu hồi theo chính sách. Text snapshot không tự bị xóa cùng ảnh, nhưng quy trình xử lý dữ liệu hợp lệ có thể review riêng phạm vi text.

## 6. Kiểm thử và điều kiện migration tương lai

Fake clock: đúng trước/tại/sau biên 12 tháng và 24 tháng, leap day/end-of-month UTC, activity trước expiry gia hạn nhưng không vượt cap; read/worker/retry/system event không gia hạn; activity sau expiry không resurrect. Membership, Block/history, hiddenAt một phía, deleted uploader, raw key không trong DTO, expired image 404 dù cleanup chưa chạy, delivery treo qua expiry, text vẫn còn.

Integration trên actual looply_test: publish/rollback/copy fail; idempotent requestId/pending slot; source cleanup vs PREPARING reservation; listing edit/delete/cover swap vs snapshot copy; expire/activity race; duplicate cleanup, delete error/crash, orphan copy muộn; CHECK/FK/UNIQUE và legacy backfill. Không chạy các test này ở nhiệm vụ tài liệu. Migration snapshot **không chặn** Listing image CRUD, nhưng bắt buộc trước tích hợp Chat card thật và account cleanup có snapshot.
