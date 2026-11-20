# FUNCTIONAL REQUIREMENTS — Checklist tiến độ Looply (Đồ án 1)

**Mục đích:** Nguồn duy nhất theo dõi tiến độ **toàn bộ chức năng Đồ án 1**. AI đọc file này trước để biết chức năng cần triển khai; chỉ mở file module khi cần chi tiết nghiệp vụ. **Không giới hạn ở MVP.**

## Quy tắc cập nhật

- `[ ]` = **chưa được xác nhận hoàn thành** (có thể chưa làm, đang làm hoặc chưa kiểm thử đủ); `[x]` = **đã triển khai, kiểm thử đạt và review đạt**.
- **Không suy đoán tiến độ từ tài liệu yêu cầu.** Đối chiếu mã nguồn, contract, kiểm thử và review; ghi phần đã có và phần còn thiếu ở cột trạng thái. Có API hoặc demo bằng fake provider không đồng nghĩa toàn chức năng đã hoàn thành.
- Chỉ chuyển `[ ]` → `[x]` sau khi chức năng đáp ứng yêu cầu trong module, chạy kiểm thử liên quan thành công và không còn lỗi chặn. Nếu phát hiện hồi quy, chuyển lại `[ ]`.
- Sau mỗi giai đoạn hoàn thành, AI cập nhật đúng ô checklist và ghi bằng chứng ngắn trong báo cáo công việc/PR (test đã chạy, kết quả). Không sao chép tiến độ sang từng module.
- Mã chức năng là định danh ổn định; khi thay đổi yêu cầu phải cập nhật module tương ứng **trước**, rồi mới sửa danh mục/checklist ở đây. Không tự thêm/bớt nghiệp vụ.
- Quy trình: [`DEVELOPMENT_WORKFLOW.md`](../workflows/DEVELOPMENT_WORKFLOW.md); chi tiết yêu cầu: [`modules/`](modules/).

## Tổng quan

| Nhóm | Tổng số | Đã xác nhận hoàn thành |
|---|---:|---:|
| AUTH | 16 | 7 |
| USER | 17 | 13 |
| LISTING | 19 | 15 |
| MEDIA | 10 | 1 |
| CHAT | 17 | 16 |
| NOTIFICATION | 10 | 0 |
| REMINDER | 7 | 0 |
| **Tổng** | **96** | **52** |

> Cập nhật cột tổng quan đồng thời với các ô checklist bên dưới; không tự đánh dấu hoàn thành khi chưa có bằng chứng.

**Đối chiếu ngày 13/11/2026:** mã nguồn tại `8477d6c` (sau PR #25). Backend/Frontend tại commit này không khác `36596d0`, đã có CI đạt. `[ ]` không có nghĩa chưa viết code: các luồng OTP nội bộ đã demo được bằng fake SMS/email nhưng chưa nghiệm thu gửi thực tế; những chức năng thiếu UI hoặc liên thông module vẫn chưa đánh dấu hoàn thành. Các ô `[x]` phản ánh phạm vi chức năng đã kiểm chứng, không xác nhận toàn hệ thống sẵn sàng production.

Bổ sung Phase 5C: ba mã LISTING-010/011/012 đã kiểm chứng/review trong nhiệm vụ này. Mô tả Listing/Media cập nhật theo Phase 5B đã merge; không tự đánh dấu hoàn thành các mã ngoài phạm vi kiểm chứng Phase 5C.

## AUTH — 16 chức năng

Chi tiết: [`AUTH_REQUIREMENTS.md`](modules/AUTH_REQUIREMENTS.md)

| Xong | Mã | Chức năng | Trạng thái thực tế / phần còn thiếu |
|---|---|---|---|
| [ ] | `AUTH-001` | Đăng ký nội bộ | Đã có API/UI và E2E đăng ký; SMS đang fake, chưa nghiệm thu gửi thật. |
| [ ] | `AUTH-002` | OTP đăng ký | OTP Redis/TTL/attempts/cooldown đã kiểm chứng; chưa có SMS thật. |
| [x] | `AUTH-003` | Đăng nhập username/password | Đã có API/UI, xác minh hash và kiểm thử đăng nhập. |
| [ ] | `AUTH-004` | Đăng nhập phone/OTP | Đã có API/UI và kiểm thử phone OTP với fake SMS; chưa gửi thật. |
| [ ] | `AUTH-005` | Đăng nhập Google | Có Backend và test verifier; chưa có Google UI/client thật đã nghiệm thu. |
| [x] | `AUTH-006` | Tạo phiên | Đã cấp phiên server, Access Token/HttpOnly refresh cookie; kiểm thử nhiều phiên. |
| [x] | `AUTH-007` | Làm mới phiên | Đã có rotation nguyên tử, single-flight và kiểm thử race/revocation. |
| [x] | `AUTH-008` | Đăng xuất | Đã có UI/API thu hồi phiên, cookie và kiểm thử đăng xuất. |
| [ ] | `AUTH-009` | Xác minh đổi số điện thoại | Đã có API/UI, re-auth và OTP số mới; SMS thật chưa nghiệm thu. |
| [ ] | `AUTH-010` | Xác minh thêm/đổi email | Đã có API/UI, ownership nguyên tử và OTP email mới; email thật chưa nghiệm thu. |
| [x] | `AUTH-011` | Xác thực request | Đã kiểm tra JWT/phiên server, guard/interceptor và kiểm thử thu hồi quyền. |
| [x] | `AUTH-012` | Đổi mật khẩu | Đã có UI/API, breach check, proof một lần và thu hồi phiên khác; kiểm thử đạt. |
| [ ] | `AUTH-013` | Khôi phục mật khẩu | Đã có UI/API, chống dò tài khoản và thu hồi mọi phiên; OTP vẫn dùng fake provider. |
| [ ] | `AUTH-014` | Liên kết Google | Có Backend/proof và test chống auto-merge; chưa có UI/tích hợp Google thật. |
| [ ] | `AUTH-015` | Xác thực lại thao tác nhạy cảm | Password/phone OTP dùng được trên UI; Google chỉ Backend/test, OTP thật chưa nghiệm thu. |
| [x] | `AUTH-016` | Quản lý phiên đăng nhập | Đã có danh sách phiên, thu hồi phiên của mình và kiểm thử chống truy cập phiên người khác. |


## USER — 17 chức năng

Chi tiết: [`USER_REQUIREMENTS.md`](modules/USER_REQUIREMENTS.md)

| Xong | Mã | Chức năng | Trạng thái thực tế / phần còn thiếu |
|---|---|---|---|
| [x] | `USER-001` | Xem hồ sơ cá nhân | Đã có owner API/UI, phân tách dữ liệu riêng và kiểm thử cache theo danh tính. |
| [ ] | `USER-002` | Xem hồ sơ người khác | Đã có hồ sơ công khai và quan hệ trên UI; còn thiếu danh sách Listing trên Profile. |
| [x] | `USER-003` | Chỉnh sửa hồ sơ | Đã có form/API sửa tên, bio, tỉnh; kiểm thử quyền và validation. |
| [x] | `USER-004` | Cập nhật avatar | Đã có UI/API, decode ảnh thật, storage local và kiểm thử thay avatar an toàn. |
| [x] | `USER-005` | Xóa avatar | Đã có UI/API xóa avatar, fallback mặc định và cleanup sau commit. |
| [x] | `USER-006` | Follow | Đã có UI/API; kiểm thử idempotency, cấm tự follow và race với Block. |
| [x] | `USER-007` | Unfollow | Đã có xác nhận UI, API idempotent và kiểm thử quan hệ. |
| [x] | `USER-008` | Xem Followers | Đã có số lượng trên Profile, danh sách phân trang và liên kết hồ sơ. |
| [x] | `USER-009` | Xem Following | Đã có số lượng trên Profile, danh sách phân trang và liên kết hồ sơ. |
| [x] | `USER-010` | Block | UI/API và ẩn Profile/Listing đã có; Chat đã kiểm chứng Block/Unblock qua User API thật, chặn gửi hai chiều nhưng giữ lịch sử. |
| [x] | `USER-011` | Unblock | Đã có xác nhận UI/API bỏ Block của mình; kiểm thử không tự khôi phục Follow. |
| [x] | `USER-012` | Danh sách đã chặn | Đã có danh sách riêng, phân trang và thao tác bỏ chặn có xác nhận. |
| [ ] | `USER-013` | Thêm/thay đổi email | Form/API và re-auth/OTP đã có; email provider thật chưa nghiệm thu. |
| [ ] | `USER-014` | Thay đổi số điện thoại | Form/API và re-auth/OTP đã có; SMS provider thật chưa nghiệm thu. |
| [x] | `USER-015` | Đổi username | Đã có UI/API, mốc lần đổi đầu/30 ngày và kiểm thử chống cập nhật đồng thời. |
| [ ] | `USER-016` | Vòng đời xóa tài khoản | UI yêu cầu/hủy và worker cleanup đã kiểm thử; backup/restore/retention độc lập chưa triển khai. |
| [x] | `USER-017` | Danh mục tỉnh/thành phố | Đã có catalog PostgreSQL 34 tỉnh, API, seed idempotent và UI chọn tỉnh. |


## LISTING — 19 chức năng

Chi tiết: [`LISTING_REQUIREMENTS.md`](modules/LISTING_REQUIREMENTS.md)

Backend đã triển khai CRUD/management, Search/Suggestions/Filters/Sorting/keyset pagination, hai Home Feed, Follow/Unfollow/Followed Listings và upload/delivery ảnh/video. Angular public discovery Phase 5A đã qua [Final Review PR #24](https://github.com/DaimanBao/looply-rebuild/pull/24), gồm sửa hồi quy tải lại detail/video khi token rotation; không còn chờ review riêng. Angular quản lý Listing/Media Phase 5B đã merge qua PR #26. Follow/Unfollow/danh sách theo dõi và tích hợp Discovery/Detail/Auth/My Listings được kiểm chứng ở Phase 5C theo [Frontend README](../../frontend/README.md#follow-listing-và-tích-hợp--phase-5c). Chat đã tích hợp Listing Detail, accept và reopen/activeCycle; Notification delivery chưa triển khai. Bằng chứng Backend tại [Integration tests](../database/INTEGRATION_TESTS.md).

| Xong | Mã | Chức năng | Trạng thái thực tế / phần còn thiếu |
|---|---|---|---|
| [ ] | `LISTING-001` | Tạo bài đăng | API/UI SALE/RENT/EXCHANGE và atomic media đã có ở Phase 5B; xem bằng chứng/giới hạn Frontend README. |
| [ ] | `LISTING-002` | Chỉnh sửa bài đăng | Đã có editor/version/confirmation và kiểm thử Phase 5B; chưa có Notification consumer. |
| [ ] | `LISTING-003` | Xóa bài đăng | Đã có UI xác nhận/xóa mềm, expectedVersion và Chrome E2E Phase 5B; chưa đối chiếu lại toàn checklist mã này ở Phase 5C. |
| [ ] | `LISTING-004` | Quản lý bài đăng cá nhân | Đã có My Listings/filter/cursor ở Phase 5B; Phase 5C thêm điều hướng đến danh sách theo dõi. |
| [x] | `LISTING-005` | Xem danh sách công khai | Đã có API/UI công khai, lọc visibility/Block/lifecycle và kiểm thử guest. |
| [x] | `LISTING-006` | Xem chi tiết bài đăng | API/UI/gallery/owner/Follow và hành động Chat đã có; targeted Detail/Profile và Chrome guest/login/mở Chat PASS. |
| [x] | `LISTING-007` | Ẩn bài đăng | UI/version/ownership/E2E ẩn Phase 5B; accept SALE/EXCHANGE ẩn nguyên tử, RENT giữ ACTIVE đã kiểm chứng. |
| [x] | `LISTING-008` | Hiển thị lại | UI xác nhận reopen/version/cycle Phase 5B; Chat integration kiểm chứng tiếp tục pending và acceptedCycle mới sau reopen. |
| [x] | `LISTING-009` | Cập nhật trạng thái theo giao dịch | Accept SALE/RENT/EXCHANGE, concurrent accepts, rollback và bảo toàn lịch sử đã kiểm chứng qua PostgreSQL/Chrome. |
| [x] | `LISTING-010` | Theo dõi bài đăng | API/UI Discovery/Detail, chặn self/guest/nhấn lặp, stale response và Chrome E2E Phase 5C đạt. |
| [x] | `LISTING-011` | Bỏ theo dõi | API/UI Unfollow idempotent, trạng thái chung và Chrome E2E Phase 5C đạt; không phát notification. |
| [x] | `LISTING-012` | Xem bài đã theo dõi | Trang riêng ACTIVE, cursor/dedup/retry/reset theo danh tính và kiểm thử Phase 5C đạt. |
| [x] | `LISTING-013` | Tìm kiếm | Đã có API/UI tìm tiêu đề tiếng Việt có/không dấu, kiểm thử query/cancellation. |
| [x] | `LISTING-014` | Gợi ý tìm kiếm | Đã có API/UI suggestions, debounce 300 ms và kiểm thử response cũ. |
| [x] | `LISTING-015` | Lọc bài đăng | Đã có API/UI lọc loại, tỉnh, giá/đơn vị và thời gian; kiểm thử tổ hợp hợp lệ/sai. |
| [x] | `LISTING-016` | Sắp xếp | Đã có API/UI sort thời gian/giá và ràng buộc không trộn loại/đơn vị thuê. |
| [x] | `LISTING-017` | Feed gần bạn | Đã có API/UI Nearby chọn tỉnh tường minh; kiểm thử quyền và đổi bộ lọc. |
| [x] | `LISTING-018` | Feed toàn quốc | Đã có API/UI National random seed/cursor; kiểm thử thứ tự và chống trùng. |
| [x] | `LISTING-019` | Infinite Scroll | Đã có 12 bài/lượt, observer/tải thêm, reset/dedup/retry và Chrome E2E 12→14 bài. |


## MEDIA — 10 chức năng

Chi tiết: [`MEDIA_REQUIREMENTS.md`](modules/MEDIA_REQUIREMENTS.md)

| Xong | Mã | Chức năng | Trạng thái thực tế / phần còn thiếu |
|---|---|---|---|
| [ ] | `MEDIA-001` | Tải ảnh lên | Đã có raw upload UI/preview/validation ảnh và Chrome E2E ở Phase 5B. |
| [ ] | `MEDIA-002` | Tải video lên | Đã có upload video UI và Chrome E2E MP4 Phase 5B; chưa nghiệm thu WebM browser/video 100 MiB. |
| [ ] | `MEDIA-003` | Xóa Media | Đã có bỏ media trong editor; detach nguyên tử sau lưu, hủy không ảnh hưởng ATTACHED (Phase 5B). |
| [ ] | `MEDIA-004` | Thay thế Media | Đã có thay media qua bản nháp/atomic manifest, bảo toàn media cũ nếu lưu lỗi (Phase 5B). |
| [ ] | `MEDIA-005` | Xem trước Media | Đã có preview Blob URL trước lưu, bỏ tệp và cảnh báo rời editor (Phase 5B). |
| [x] | `MEDIA-006` | Xem Media | Đã có thumbnail Feed, ảnh detail, gallery và video controls không autoplay; test/UI E2E đạt trong phạm vi nêu dưới. |
| [ ] | `MEDIA-007` | Chọn ảnh đại diện | Đã có UI chọn cover độc lập thứ tự và fallback sau bỏ cover; targeted tests Phase 5B. |
| [ ] | `MEDIA-008` | Sắp xếp ảnh | Đã có UI sắp xếp ảnh, atomic manifest và targeted tests Phase 5B. |
| [ ] | `MEDIA-009` | Kiểm tra Media | Đã có frontend MIME/bytes/duration sơ bộ và server kiểm tra nội dung thật; giới hạn nghiệm thu xem Phase 5B. |
| [ ] | `MEDIA-010` | Xử lý Media lỗi | Đã có trạng thái tải/xử lý/lỗi/retry/cancel và TTL cleanup; không có phần trăm byte (Phase 5B). |


## CHAT — 17 chức năng

Chi tiết: [`CHAT_REQUIREMENTS.md`](modules/CHAT_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [x] | `CHAT-001` | Tạo hội thoại theo Listing |
| [x] | `CHAT-002` | Tạo hội thoại tự do |
| [x] | `CHAT-003` | Danh sách hội thoại |
| [x] | `CHAT-004` | Xem hội thoại |
| [x] | `CHAT-005` | Xóa hội thoại |
| [x] | `CHAT-006` | Gửi tin nhắn |
| [x] | `CHAT-007` | Nhận tin nhắn |
| [x] | `CHAT-008` | Trạng thái tin nhắn |
| [x] | `CHAT-009` | Lịch sử tin nhắn |
| [x] | `CHAT-010` | Liên hệ theo giá niêm yết |
| [x] | `CHAT-011` | Đề xuất giá mới |
| [x] | `CHAT-012` | Chấp nhận giao dịch |
| [x] | `CHAT-013` | Từ chối đề xuất |
| [x] | `CHAT-014` | Lịch sử đề xuất |
| [x] | `CHAT-015` | Phân nhóm Inbox |
| [x] | `CHAT-016` | Card thông tin Listing |
| [ ] | `CHAT-017` | Thông báo tin nhắn |

Đối chiếu Chat 20/11/2026 trên `feat/chat-module`: REST/Socket.IO, Angular Inbox/Conversation, ảnh và proposal/snapshot đã kiểm chứng bằng targeted tests + Chrome hai tài khoản. [Bằng chứng và giới hạn](../database/INTEGRATION_TESTS.md#chat-module--20112026), [contract](../api/CHAT_DESIGN.md). `CHAT-017` mới có outbox identifiers; consumer, biểu tượng và danh sách thông báo thuộc Notification, chưa triển khai theo phạm vi nhiệm vụ. Không suy kết quả này thành nghiệm thu live S3, nhiều Backend process hoặc NFR p95.


## NOTIFICATION — 10 chức năng

Chi tiết: [`NOTIFICATION_REQUIREMENTS.md`](modules/NOTIFICATION_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `NOTI-001` | Thông báo tin nhắn mới |
| [ ] | `NOTI-002` | Thông báo chỉnh sửa Listing |
| [ ] | `NOTI-003` | Thông báo giao dịch |
| [ ] | `NOTI-004` | Danh sách thông báo |
| [ ] | `NOTI-005` | Số lượng chưa đọc |
| [ ] | `NOTI-006` | Thông báo nổi (toast) |
| [ ] | `NOTI-007` | Điều hướng |
| [ ] | `NOTI-008` | Đánh dấu đã đọc |
| [ ] | `NOTI-009` | Đánh dấu tất cả đã đọc |
| [ ] | `NOTI-010` | Xóa thông báo |


## REMINDER — 7 chức năng

Chi tiết: [`REMINDER_REQUIREMENTS.md`](modules/REMINDER_REQUIREMENTS.md)

| Xong | Mã | Chức năng |
|---|---|---|
| [ ] | `REM-001` | Kiểm tra hồ sơ |
| [ ] | `REM-002` | Nhắc số điện thoại |
| [ ] | `REM-003` | Nhắc email |
| [ ] | `REM-004` | Nhắc địa điểm |
| [ ] | `REM-005` | Hiển thị nhắc nhở |
| [ ] | `REM-006` | Bỏ qua |
| [ ] | `REM-007` | Điều hướng bổ sung |

## Ranh giới phạm vi

- Khách xem Listing/Profile công khai; các tương tác cần đăng nhập. Không có thanh toán, Admin đầy đủ hoặc backend Java trong Đồ án 1.
- **Đề xuất giao dịch/card** hiện thuộc Chat (`CHAT-010` đến `CHAT-014`), không tạo checklist module Transaction riêng để tránh trùng.
- **Listing** có 3 trạng thái `ACTIVE`, `HIDDEN`, `DELETED`.
- **Reminder** chỉ nhắc phone/email đã xác minh và tỉnh/thành phố; không nhắc avatar theo tài liệu module hiện hành.
- Tài liệu này theo dõi **chức năng nghiệp vụ**, không thay thế checklist hạ tầng, API, CI hoặc kiểm thử tổng thể.

## Bằng chứng và phần chưa hoàn thành

| Phạm vi | Bằng chứng hiện có | Giới hạn còn lại |
|---|---|---|
| Auth/User | [Frontend README](../../frontend/README.md#bằng-chứng-local-13112026): Chrome E2E 26 bước, unit/component, typecheck/build và review; [Backend integration](../database/INTEGRATION_TESTS.md) kiểm tra PostgreSQL/Redis, phiên, quyền sở hữu, concurrency và xóa tài khoản. Chat kiểm tra phiên và Block hai chiều khi tạo nội dung mới. | SMS/email thật, Google UI/client thật chưa nghiệm thu; Profile chưa có danh sách Listing. Backup/restore, retention và nguồn trạng thái xóa độc lập chưa triển khai. |
| Listing/Media Backend | [Integration tests](../database/INTEGRATION_TESTS.md): CRUD, atomic manifest, upload/delivery ảnh/video, Search/Feed/Follow, quyền hiển thị/Block, rollback/race và cleanup; Chat accept đã tích hợp nguyên tử với Listing/activeCycle. API theo [OpenAPI](../api/openapi.json). | Consumer Notification chỉnh sửa Listing và S3 thật chưa nghiệm thu. Outbox event không thay thế notification delivery. |
| Listing/Media Frontend | [Phase 5A](../../frontend/README.md#listing-public-discovery--phase-5a), [Phase 5B](../../frontend/README.md#listing-management-và-media--phase-5b) đã có discovery/management/media editor; [Phase 5C](../../frontend/README.md#follow-listing-và-tích-hợp--phase-5c) kiểm chứng Follow/Unfollow/danh sách, đổi tài khoản và quyền chủ bằng targeted tests + Chrome/API thật. Chat tích hợp ở mục bên dưới. | Notification participant chưa triển khai. Browser E2E đã kiểm chứng MP4, chưa nghiệm thu WebM/Safari/Firefox hoặc video lớn; video tải trọn tệp trước phát. |
| CI của lần đối chiếu ban đầu | Commit `36596d0`: [Backend CI PASS](https://github.com/DaimanBao/looply-rebuild/actions/runs/43420523096) và [Frontend CI PASS](https://github.com/DaimanBao/looply-rebuild/actions/runs/43420523089); được merge qua PR #25 vào `8477d6c`, không đổi code ứng dụng so với commit đã kiểm tra. | Đây là bằng chứng lịch sử; CI của Phase 5B/5C theo commit cuối tại PR tương ứng. Browser E2E là bằng chứng local trong README, không chạy trên GitHub Actions. |
| Chat | [Backend integration](../database/INTEGRATION_TESTS.md#chat-module--20112026), [Frontend](../../frontend/README.md#chat-module): Conversation, Message, realtime, ảnh, proposal/snapshot và Inbox đã triển khai/kiểm chứng/review. | `CHAT-017` chờ Notification; chưa nghiệm thu live S3, browser ngoài Chrome hoặc p95. |
| Notification, Reminder | Chưa có runtime/UI; Chat chỉ chuẩn bị event identifiers để tích hợp sau. | Các mã NOTI/REM tiếp tục `[ ]`; các thông báo lỗi UI thông thường không thay thế các module này. |
