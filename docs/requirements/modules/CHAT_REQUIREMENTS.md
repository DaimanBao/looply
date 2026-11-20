# Looply — Yêu cầu Module Chat/Conversation (Đồ án 1)

**Phạm vi:** 17 chức năng (`CHAT-001`–`CHAT-017`). Tài liệu xác định yêu cầu nghiệp vụ; chưa ấn định API, database hoặc công nghệ realtime.

## 1. Danh mục chức năng

| Mã | Chức năng | Yêu cầu |
|---|---|---|
| CHAT-001 | Tạo hội thoại theo Listing | Một Conversation duy nhất cho mỗi cặp người liên hệ–Listing; kiểm tra tồn tại trước khi tạo. |
| CHAT-002 | Tạo hội thoại tự do | Một Conversation tự do duy nhất cho mỗi cặp người dùng; không gắn Listing. |
| CHAT-003 | Danh sách hội thoại | Hiển thị các Conversation người dùng tham gia. |
| CHAT-004 | Xem hội thoại | Xem nội dung, lịch sử và thông tin liên quan. |
| CHAT-005 | Xóa hội thoại | Xóa mềm riêng cho mỗi người; tự xuất hiện lại khi có tin nhắn mới. |
| CHAT-006 | Gửi tin nhắn | Văn bản, emoji; tối đa một ảnh/tin nhắn, có thể kèm văn bản. |
| CHAT-007 | Nhận tin nhắn | Gửi/nhận theo thời gian thực. |
| CHAT-008 | Trạng thái tin nhắn | Đã gửi, đã nhận, đã xem. |
| CHAT-009 | Lịch sử tin nhắn | Ban đầu khoảng 30 tin gần nhất; cuộn lên tải thêm. |
| CHAT-010 | Liên hệ theo giá niêm yết | Gửi card liên hệ cho SALE/RENT theo giá đăng; EXCHANGE dùng card liên hệ trao đổi. |
| CHAT-011 | Đề xuất giá mới | SALE/RENT: gửi card giá đề xuất > 0, giữ đơn vị thuê đối với RENT. |
| CHAT-012 | Chấp nhận giao dịch | Chủ Listing chấp nhận card hợp lệ; cập nhật trạng thái Listing theo loại giao dịch. |
| CHAT-013 | Từ chối đề xuất | Chủ Listing từ chối card thương lượng giá; không xử lý lại card đã từ chối. |
| CHAT-014 | Lịch sử đề xuất | Lưu card, giá tại thời điểm gửi và kết quả xử lý. |
| CHAT-015 | Phân nhóm Inbox | Hội thoại theo Listing: chọn bài rồi chọn người liên hệ; hội thoại tự do: nhóm riêng. |
| CHAT-016 | Card thông tin Listing | Hiển thị ảnh đại diện, tiêu đề, loại giao dịch, giá (nếu có), trạng thái phù hợp. |
| CHAT-017 | Thông báo tin nhắn | Tin nhắn mới phát sinh thông báo, không có nội dung xem trước. |

## 2. Hội thoại và phân quyền

- Chỉ người đăng nhập mới tạo, gửi và xem Conversation của mình; không được tự tạo hội thoại với chính mình hoặc tự giao dịch với Listing của mình.
- Hội thoại theo Listing và hội thoại tự do là hai loại riêng; hội thoại tự do không có card giao dịch.
- Xóa hội thoại chỉ ẩn khỏi phía người xóa, không xóa lịch sử của người còn lại; tin nhắn mới khiến hội thoại xuất hiện lại.
- Listing `HIDDEN` hoặc `DELETED` không ngăn hai bên tiếp tục nhắn tin trong Conversation cũ.
- Khi một bên chặn bên kia, không được gửi tin nhắn hoặc đề xuất mới; lịch sử vẫn được giữ. Bỏ chặn cho phép tiếp tục theo quy tắc hiện hành (quản lý chặn thuộc Module User).

## 3. Tin nhắn và ảnh

- Hỗ trợ văn bản, emoji, **tối đa 1 ảnh/tin nhắn**, có thể gửi ảnh kèm văn bản; không hỗ trợ video hoặc loại tệp khác.
- Ảnh tối đa **10 MB**, áp dụng kiểm tra định dạng và tối ưu theo Module Media (JPG/JPEG/PNG/WebP).
- Gửi/nhận realtime, hiển thị thời gian gửi và trạng thái **đã gửi → đã nhận → đã xem**.
- Mở hội thoại tải khoảng **30 tin nhắn gần nhất**; cuộn lên để tải thêm, không tải toàn bộ lịch sử một lần.
- Không hỗ trợ sửa, thu hồi, xóa từng tin nhắn, trạng thái đang nhập hoặc trực tuyến trong Đồ án 1.

## 4. Card và giao dịch

| Loại Listing | Card liên hệ | Thỏa thuận giá | Khi chấp nhận |
|---|---|---|---|
| `SALE` | Theo giá niêm yết; chủ bài có nút **Chấp nhận** | Có; nút **Chấp nhận / Không chấp nhận** | Listing → `HIDDEN` |
| `RENT` | Theo giá niêm yết; chủ bài có nút **Chấp nhận** | Có; nút **Chấp nhận / Không chấp nhận** | Listing vẫn `ACTIVE` |
| `EXCHANGE` | Card liên hệ trao đổi; chủ bài có nút **Chấp nhận** | Không | Listing → `HIDDEN` |

- Khi liên hệ theo giá niêm yết, người dùng xác nhận ý định trước khi gửi card. Khi thương lượng, nhập giá đề xuất **lớn hơn 0**; giá thuê phải giữ nguyên đơn vị **ngày/tháng** của Listing.
- Mỗi card lưu bản chụp thông tin cần thiết tại thời điểm gửi, bao gồm giá niêm yết và giá đề xuất (nếu có); việc sửa Listing hoặc giá sau đó không làm thay đổi hay vô hiệu đề xuất cũ.
- Trạng thái đề xuất: `PENDING`, `ACCEPTED`, `REJECTED`. Card đã chấp nhận hoặc từ chối không được sửa, hủy hay xử lý lại; sau khi bị từ chối, người liên hệ có thể gửi đề xuất mới.
- **Tối đa một đề xuất `PENDING` trong cùng Conversation**. Một Conversation có thể chứa nhiều giao dịch nối tiếp theo thời gian, không tạo Conversation mới cho giao dịch tiếp theo.
- Chỉ cho tạo và xử lý đề xuất khi Listing `ACTIVE`. Khi `HIDDEN`, các đề xuất `PENDING` được **tạm dừng nhưng giữ nguyên trạng thái**; khi Listing trở lại `ACTIVE`, chúng được xử lý tiếp. Không thêm trạng thái `PAUSED`.
- Khi Listing `DELETED`, không tạo hoặc chấp nhận đề xuất mới; vẫn giữ card và lịch sử giao dịch.
- Với SALE/EXCHANGE, sau một đề xuất được chấp nhận, Listing chuyển `HIDDEN` và các đề xuất đang chờ khác tạm dừng; chủ bài có thể xác nhận hiển thị lại Listing, lịch sử đã chấp nhận không mất. Với RENT, chấp nhận không tự động ẩn Listing.
- Backend phải xác minh chủ thể, trạng thái mới nhất và xử lý chấp nhận một cách nhất quán để tránh chấp nhận đồng thời xung đột.

## 5. Inbox, thông báo và phạm vi

- Inbox theo Listing nhóm **bài đăng → người liên hệ**; hội thoại tự do hiển thị riêng.
- Card thông tin Listing giúp xác định sản phẩm đang trao đổi; card đề xuất giữ dữ liệu lịch sử tại thời điểm gửi, không thay đổi theo Listing hiện tại.
- Tin nhắn mới tạo thông báo với biểu tượng và số chưa đọc, **không hiển thị nội dung xem trước**; mở Conversation cập nhật trạng thái đã xem. Đánh dấu/xóa thông báo do Module Notification quản lý.
- Không triển khai chat nhóm, gọi thoại/video, gửi video/tệp khác, sửa/thu hồi tin nhắn, hiển thị đang nhập/trực tuyến, thanh toán, đặt cọc hoặc giải quyết tranh chấp.

**Ranh giới module:** Chat quản lý Conversation, Message và card/đề xuất giao dịch (không tách thành module riêng trong phạm vi tài liệu hiện tại); Listing quản lý bài đăng và trạng thái; Media xử lý tệp; User quản lý chặn; Notification quản lý thông báo.

## 6. Snapshot lịch sử và retention ảnh — đã phê duyệt

- Card khi gửi lưu Listing ID, title, type, giá niêm yết/giá đề xuất nếu có, rentalUnit và ảnh cover tại thời điểm gửi; không thay đổi theo sửa bài, cover, HIDDEN/DELETED hoặc account deletion. Snapshot text bất biến trong luồng nghiệp vụ thường; ảnh có lifecycle độc lập với Listing.
- Ảnh được giữ tới thời điểm đến trước giữa **12 tháng từ hoạt động cuối Conversation** và **24 tháng từ lúc tạo snapshot**. Hoạt động chỉ gồm nội dung người dùng mới đã commit (tin nhắn TEXT/ảnh/card) hoặc proposal chuyển ACCEPTED/REJECTED đã commit. Idempotent retry không tính mới. Đọc/mở Chat/tải ảnh/mark-read, ẩn hội thoại, worker và sự kiện hệ thống không gia hạn. Đây là định nghĩa hoạt động cho retention, không thay đổi chức năng Chat hiện có.
- Tháng là tháng lịch UTC, clamp ngày cuối tháng, không phải 30 ngày. Ảnh đã hết hạn/thu hồi không được sống lại do hoạt động về sau; giới hạn tuyệt đối không đổi. Thời gian server, không client.
- Hết hạn thì ngừng phục vụ qua API ngay và card hiển thị placeholder, dù cleanup chưa chạy. Xóa vật lý sau commit qua worker retry, không hứa xóa ngay tức thì. Snapshot text không tự bị xóa cùng ảnh.
- Chỉ người đủ quyền xem Conversation mới được đọc ảnh; không công khai storage key/file path. Nếu dùng chung file phải theo dõi tất cả reference và chỉ xóa khi không còn reference hợp lệ. Đề xuất kỹ thuật hiện tại chọn copy riêng từng card để tránh shared-file lifecycle.
- Xóa mềm hội thoại phía một người không xóa lịch sử phía còn lại. Account deletion không tự hủy ảnh cần thiết cho người còn lại hoặc reset retention. Yêu cầu xóa dữ liệu hợp lệ có thể thu hồi trước hạn theo quy trình riêng; không tự quét PII.
- Retention này độc lập **30 ngày chờ xóa tài khoản** và **retention backup**. Không giữ ảnh vô thời hạn chỉ vì từng có Conversation.

Model/authorization/copy/reference tracking và kiểm thử thời gian thuộc [thiết kế snapshot](../../database/CHAT_SNAPSHOT_DESIGN.md); HTTP/realtime contract thuộc [Chat API](../../api/CHAT_DESIGN.md). Trạng thái nghiệm thu theo checklist chức năng, không suy từ tài liệu yêu cầu.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
