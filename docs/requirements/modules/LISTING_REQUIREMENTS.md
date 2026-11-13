# LISTING REQUIREMENTS — Looply (Đồ án 1)

> Phạm vi: yêu cầu chức năng và quy tắc nghiệp vụ của Listing. Chi tiết truyền tin, card giao dịch và lưu lịch sử thuộc Chat/Conversation; xử lý tải tệp thuộc Media. Tài liệu này không quy định cấu trúc API hoặc database.

## 1. Danh mục chức năng

| Mã | Chức năng | Yêu cầu chính |
|---|---|---|
| LISTING-001 | Tạo bài đăng | Tạo SALE, RENT hoặc EXCHANGE với dữ liệu hợp lệ và tối thiểu một ảnh. |
| LISTING-002 | Chỉnh sửa bài đăng | Chủ bài sửa nội dung, giá, địa điểm, liên hệ và media theo các ràng buộc. |
| LISTING-003 | Xóa bài đăng | Soft delete, xác nhận trước khi xóa; không tự khôi phục. |
| LISTING-004 | Quản lý bài đăng cá nhân | Xem bài ACTIVE/HIDDEN của bản thân, kể cả bài đã ẩn sau giao dịch. |
| LISTING-005 | Xem danh sách công khai | Chỉ hiển thị Listing ACTIVE; khách chưa đăng nhập được xem. |
| LISTING-006 | Xem chi tiết bài đăng | Hiển thị thông tin, media, giá/đơn vị thuê, địa điểm, người đăng và hành động hợp lệ. |
| LISTING-007 | Ẩn bài đăng | Chủ bài chuyển ACTIVE → HIDDEN; tạm dừng đề xuất đang chờ. |
| LISTING-008 | Hiển thị lại | Chủ bài chuyển HIDDEN → ACTIVE; xác nhận khi mở lại bài đã được chấp nhận giao dịch. |
| LISTING-009 | Cập nhật trạng thái theo giao dịch | SALE/EXCHANGE được chấp nhận → HIDDEN; RENT được chấp nhận vẫn ACTIVE. |
| LISTING-010 | Theo dõi bài đăng | Người đã đăng nhập theo dõi bài của người khác. |
| LISTING-011 | Bỏ theo dõi | Người theo dõi hủy theo dõi bài. |
| LISTING-012 | Xem bài đã theo dõi | Xem danh sách Listing đã theo dõi, tuân thủ quyền hiển thị. |
| LISTING-013 | Tìm kiếm | Tìm theo tiêu đề, không phân biệt hoa/thường, hỗ trợ tiếng Việt có/không dấu. |
| LISTING-014 | Gợi ý tìm kiếm | Gợi ý tiêu đề ACTIVE, khoảng 5–8 mục, debounce khoảng 300 ms. |
| LISTING-015 | Lọc bài đăng | Theo loại giao dịch, giá, tỉnh/thành phố và thời gian đăng. |
| LISTING-016 | Sắp xếp | Mới nhất, cũ nhất, giá tăng dần hoặc giảm dần. |
| LISTING-017 | Feed gần bạn | Bài ACTIVE cùng tỉnh/thành phố, ưu tiên mới nhất; chọn địa điểm thủ công được. |
| LISTING-018 | Feed toàn quốc | Bài ACTIVE toàn quốc, có yếu tố ngẫu nhiên, không trùng trong một lượt cuộn. |
| LISTING-019 | Infinite Scroll | Khoảng 12 bài/lượt; tải thêm khi cuộn, đặt lại khi đổi truy vấn/tab/bộ lọc/sắp xếp. |

## 2. Dữ liệu và quy tắc tạo bài

- **Bắt buộc:** tiêu đề, mô tả, loại giao dịch, địa điểm, **1–5 ảnh**. Video tùy chọn, tối đa **1**; giới hạn dung lượng/thời lượng và quy trình tải thuộc Media.
- Tiêu đề 10–150 và mô tả 20–5000 Unicode code point sau bỏ khoảng trắng ASCII hai đầu, giữ giới hạn database hiện có; không đếm bằng JavaScript `.length`.
- **SALE:** giá niêm yết bằng VNĐ, **> 0**.
- **RENT:** giá niêm yết bằng VNĐ, **> 0**, kèm đơn vị **ngày hoặc tháng**.
- **EXCHANGE:** không có giá tiền hoặc đơn vị thuê, không có thỏa thuận giá bằng tiền; mô tả điều kiện trao đổi trong nội dung bài.
- Địa điểm bắt buộc, được gợi ý từ hồ sơ nhưng có thể thay đổi và lưu độc lập. Số điện thoại liên hệ được gợi ý từ hồ sơ, cho phép chỉnh sửa độc lập.
- Thông tin ngày tạo (`createdAt`) và ngày cập nhật (`updatedAt`) được phân biệt; chỉnh sửa không thay đổi ngày tạo.

## 3. Chỉnh sửa và xóa

- Chỉ chủ bài đăng được tạo thay đổi lên bài của mình; backend phải kiểm tra quyền sở hữu.
- **Chưa có Conversation:** chỉnh sửa bình thường. **Đã có Conversation:** cảnh báo và yêu cầu xác nhận; nếu hủy, không lưu thay đổi. Nếu xác nhận, thông báo đến người đã có Conversation liên quan, **không** thông báo chỉ vì theo dõi Listing.
- Sau khi phát sinh Conversation liên quan, **không được đổi loại giao dịch**. Các trường khác có thể sửa theo ràng buộc; sau sửa vẫn phải có ít nhất một ảnh.
- Khi đổi giá niêm yết, đề xuất đang chờ **vẫn hiệu lực**, giữ nguyên thông tin và giá tại thời điểm gửi; giá mới áp dụng cho yêu cầu tạo sau đó.
- Chỉnh sửa không tự làm thay đổi trạng thái Listing hoặc hủy lượt theo dõi. Bài đã được chấp nhận giao dịch và đang HIDDEN cần được mở lại ACTIVE trước khi sửa nội dung giao dịch.
- Xóa phải xác nhận; chuyển `DELETED` (soft delete), không xuất hiện trong quản lý thông thường, không cho người dùng tự khôi phục. Dữ liệu và Conversation cũ vẫn được giữ.

## 4. Vòng đời Listing — đúng 3 trạng thái

| Trạng thái | Công khai | Giao dịch mới | Đề xuất đang chờ | Quản lý của chủ bài |
|---|---|---|---|---|
| `ACTIVE` | Có | Cho phép | Có thể xử lý | Có |
| `HIDDEN` | Không | Không | Giữ nguyên, **tạm dừng chấp nhận** | Có |
| `DELETED` | Không | Không | Không được tiếp tục chấp nhận | Không hiện trong danh sách thường |

- `ACTIVE ↔ HIDDEN`: chủ bài được ẩn/hiện lại; khi mở lại sau khi chấp nhận giao dịch cần xác nhận và **giữ lịch sử giao dịch**. Đề xuất đang chờ được tiếp tục xử lý khi ACTIVE trở lại.
- `ACTIVE/HIDDEN → DELETED`: xóa mềm, không có thao tác tự khôi phục.
- Không dùng `COMPLETED`, `UNAVAILABLE` hay trường `hiddenReason` làm trạng thái Listing.
- Các Conversation cũ vẫn nhắn tin được khi bài HIDDEN/DELETED; không cho tạo Conversation/giao dịch mới từ các bài này. Thông tin tóm tắt bài đã xóa có thể được giữ trong lịch sử Chat.

## 5. Tương tác giao dịch với Conversation

### SALE — Bán
1. **Nhắn tin liên hệ:** người mua được hỏi xác nhận mua theo **giá niêm yết**, không thương lượng. Nếu đồng ý, mở/tạo Conversation và gửi card giao dịch; người bán có nút **Chấp nhận**.
2. **Thỏa thuận lại giá:** người mua nhập giá đề xuất **> 0 VNĐ**, gửi card chứa thông tin bài, giá niêm yết tại thời điểm gửi, giá đề xuất; người bán có nút **Chấp nhận** và **Không chấp nhận**.
3. **Chấp nhận:** ghi nhận giao dịch được chấp nhận; Listing chuyển `HIDDEN`; các đề xuất còn chờ của người khác **không bị hủy**, chỉ tạm dừng đến khi bài ACTIVE trở lại.
4. **Không chấp nhận:** đề xuất chuyển `REJECTED`, không làm đổi trạng thái Listing; người mua muốn tiếp tục phải **tạo đề xuất mới**, không tái sử dụng card bị từ chối.

### RENT — Cho thuê
- Hai cách liên hệ/đề xuất giá như SALE; đề xuất giá **> 0**, theo đơn vị thuê ngày/tháng của Listing.
- Khi người đăng chấp nhận, ghi nhận giao dịch thuê được chấp nhận nhưng **Listing vẫn ACTIVE**, không tự động ẩn; có thể có nhiều giao dịch thuê.

### EXCHANGE — Trao đổi
- Người dùng liên hệ; Conversation hiển thị card bài đăng và nút **Chấp nhận** dành cho người đăng.
- Khi chấp nhận, Listing chuyển `HIDDEN`; đề xuất khác đang chờ tạm dừng như SALE.
- **Không** có nhập giá hay thương lượng giá bằng tiền.

### Quy tắc chung
- Mỗi yêu cầu giao dịch/card giữ thông tin và mức giá tại thời điểm gửi; lịch sử không bị ghi đè khi bài được sửa hoặc mở lại.
- Đề xuất `REJECTED` không được chấp nhận lại. Các đề xuất `PENDING` được giữ khi bài HIDDEN; chỉ xử lý chấp nhận khi bài ACTIVE.
- Backend cần kiểm soát cập nhật đồng thời để không chấp nhận trùng các yêu cầu SALE/EXCHANGE trong cùng một lượt bài ACTIVE.
- Chi tiết card, trạng thái đề xuất, lưu lịch sử và cơ chế tạo Conversation thuộc tài liệu Chat.

## 6. Theo dõi, tìm kiếm và Feed

- **Theo dõi:** cần đăng nhập; không cho tự theo dõi bài của mình. Chỉnh sửa bài không hủy theo dõi; không phát sinh thông báo chỉ vì có lượt theo dõi. Danh sách khám phá công khai không hiển thị bài HIDDEN/DELETED.
- **Tìm kiếm:** chỉ tiêu đề ACTIVE; hỗ trợ có/không dấu, không phân biệt chữ hoa/thường. Từ khóa rỗng hiển thị danh sách thông thường; không tìm trong mô tả, số điện thoại hay dữ liệu cá nhân.
- **Gợi ý:** 5–8 tiêu đề phù hợp của bài ACTIVE, debounce khoảng 300 ms; không yêu cầu lịch sử tìm kiếm.
- **Lọc:** SALE/RENT/EXCHANGE; giá tối thiểu/tối đa (không áp dụng EXCHANGE, RENT phải xét đúng đơn vị ngày/tháng); địa điểm toàn quốc/cùng tỉnh/thành phố/tỉnh thành khác; thời gian tất cả/24 giờ/7 ngày/30 ngày. Các bộ lọc kết hợp được.
- **Sắp xếp:** `createdAt` mới nhất (mặc định), cũ nhất; giá tăng/giảm. Không so sánh trực tiếp giá thuê theo ngày và tháng; EXCHANGE không tham gia sắp xếp giá.
- **Feed gần bạn:** bài ACTIVE cùng tỉnh/thành phố, ưu tiên mới nhất; người chưa đăng nhập được chọn địa điểm thủ công, không bắt buộc GPS.
- **Feed toàn quốc:** bài ACTIVE trên toàn quốc, có ngẫu nhiên, không trùng trong một lượt cuộn. Đồ án 1 chưa ưu tiên người theo dõi trong thuật toán Feed.
- **Infinite Scroll:** khoảng 12 bài/lượt; tránh trùng khi phân trang; đặt lại từ đầu khi đổi tab/từ khóa/lọc/sắp xếp; hiển thị trạng thái tải, lỗi và hết dữ liệu.

## 7. Quyết định bổ sung đã duyệt — chưa triển khai

- Follow mới chỉ khi Listing ACTIVE và hai User đủ quyền tương tác, không Block hai chiều; cấm tự Follow và quan hệ trùng. HIDDEN giữ Follow nhưng không hiện trong danh sách thường, ACTIVE lại thì hiện lại; DELETED không cho Follow mới. Chủ quan hệ vẫn được Unfollow khi bài không còn công khai. Không thông báo follower.
- Price filter/sort bắt buộc chọn duy nhất SALE hoặc RENT; RENT bắt buộc DAY hoặc MONTH. Không trộn giá bán/thuê, thuê ngày/tháng hoặc đưa EXCHANGE vào sort giá. API từ chối tổ hợp không hợp lệ; UI không cung cấp tổ hợp gây hiểu nhầm.
- Feed toàn quốc dùng thứ tự ngẫu nhiên xác định theo seed trong lượt cuộn, cursor gắn query/filter/sort/seed; không random riêng mỗi trang hoặc lưu snapshot toàn bộ feed. Client loại trùng và bỏ response cũ. Không cam kết snapshot bất biến khi dữ liệu thay đổi giữa các trang.
- Card Chat giữ snapshot cả văn bản và ảnh độc lập Listing hiện tại, theo [Chat requirements](CHAT_REQUIREMENTS.md#6-snapshot-lịch-sử-và-retention-ảnh--đã-phê-duyệt).

Thuật toán chuẩn hóa, thứ tự khóa, cursor và kế hoạch kiểm thử thuộc [thiết kế kỹ thuật](../../api/LISTING_MEDIA_DESIGN.md); schema HTTP thuộc [OpenAPI](../../api/openapi.json). Đây là thiết kế, không đánh dấu chức năng đã triển khai.

## 8. Quyền truy cập và giới hạn phạm vi

- **Khách:** được xem danh sách/chi tiết bài công khai, tìm kiếm, lọc và sắp xếp.
- **Người đăng nhập:** được tạo bài, theo dõi, liên hệ và tạo yêu cầu giao dịch hợp lệ; không tự giao dịch với bài của mình.
- **Chủ bài:** được sửa, ẩn, hiện lại, xóa và phản hồi đề xuất của bài mình; backend kiểm tra quyền ở mọi thao tác.
- Không triển khai trong Đồ án 1: danh mục sản phẩm, lọc tình trạng sản phẩm, lọc khoảng cách GPS, xếp hạng người bán, thanh toán, Admin, thuật toán đề xuất nâng cao.

---

**Phạm vi tài liệu:** 19 chức năng LISTING-001 đến LISTING-019. Những hành vi giao tiếp được mô tả ở mức hợp đồng nghiệp vụ; đặc tả triển khai thuộc Chat, Media, Auth/User và Notification tương ứng.

> **Theo dõi tiến độ:** Xem checklist theo mã chức năng tại [`FUNCTIONAL_REQUIREMENTS.md`](../FUNCTIONAL_REQUIREMENTS.md). File này chỉ mô tả yêu cầu nghiệp vụ, không tự xác nhận trạng thái triển khai.
