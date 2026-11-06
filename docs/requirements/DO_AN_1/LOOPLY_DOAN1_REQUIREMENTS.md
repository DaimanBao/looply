# Looply -- Đặc tả nghiệp vụ và Checklist triển khai Đồ án 1

> **Loại tài liệu:** Product / Business Requirements Specification +
> Implementation Checklist\
> **Dự án:** Looply -- nền tảng đăng tin và trao đổi/mua bán/cho thuê đồ
> đã qua sử dụng\
> **Phạm vi:** Đồ án 1\
> **Đối tượng sử dụng:** Lập trình viên, AI Agent, người phân tích và
> kiểm thử hệ thống\
> **Tài liệu kỹ thuật liên quan:**
> `docs/technical/backend/BACKEND_PACKAGES.md`\
> **Nguyên tắc:** Chỉ những quyết định đã được thống nhất mới được xem
> là yêu cầu chính thức. Nội dung chưa chốt phải được giữ ở trạng thái
> chưa quyết định, không tự suy diễn thành yêu cầu.

------------------------------------------------------------------------

## 0. Cách đọc và sử dụng tài liệu

### 0.1. Mục đích

Tài liệu này là nguồn tham chiếu nghiệp vụ chính của Looply Đồ án 1. AI
Agent phải sử dụng tài liệu để hiểu:

-   Looply là hệ thống gì và phục vụ mục đích gì.
-   Những chức năng nào nằm trong phạm vi Đồ án 1.
-   Người dùng có thể làm gì trong từng tình huống.
-   Các quy tắc nghiệp vụ, điều kiện, giới hạn và ngoại lệ đã thống
    nhất.
-   Các module nghiệp vụ có trách nhiệm gì và liên quan với nhau ra sao.
-   Những nội dung nào chưa được quyết định và không được tự ý triển
    khai theo suy đoán.
-   Tiến độ triển khai và kiểm thử của từng nhóm chức năng.

Tài liệu này mô tả **hệ thống cần hoạt động như thế nào**, không thay
thế tài liệu thiết kế database, API contract, kiến trúc source code hoặc
hướng dẫn cài đặt package.

### 0.2. Quy tắc phân biệt trạng thái

Có hai loại trạng thái hoàn toàn khác nhau:

1.  **Trạng thái quyết định nghiệp vụ:** Nội dung đã được người dùng xác
    nhận hay chưa.
2.  **Trạng thái triển khai:** Chức năng đã được lập trình và kiểm thử
    đến đâu.

Một yêu cầu có thể đã được chốt về nghiệp vụ nhưng chưa được viết code.
Vì vậy, không được đánh dấu một chức năng là hoàn thành chỉ vì yêu cầu
của nó đã được mô tả ở đây.

### 0.3. Quy ước trạng thái checklist

Dùng các trạng thái sau trong phần tiến độ:

-   `[ ] Chưa thực hiện`: Chưa có bằng chứng chức năng đã được triển
    khai.
-   `[~] Đang thực hiện`: Đang triển khai, còn thiếu phần việc hoặc kiểm
    thử.
-   `[x] Đã hoàn thành`: Đã triển khai đúng yêu cầu và đã kiểm tra bằng
    chứng phù hợp.
-   `[!] Cần xử lý`: Có lỗi, sai khác nghiệp vụ hoặc cần làm lại.
-   `[?] Chưa đánh giá`: Chưa kiểm tra source code để xác định trạng
    thái.

**Trạng thái ban đầu trong tài liệu này là `[?] Chưa đánh giá`.** Không
giả định chức năng đã hoàn thành hoặc chưa hoàn thành khi chưa kiểm tra
repository.

Khi cập nhật tiến độ, AI Agent phải thay trạng thái theo bằng chứng thực
tế. Không được tự đánh dấu `[x]` chỉ vì đã tạo file, viết một đoạn code,
hoặc vì build thành công.

### 0.4. Quy tắc dành cho AI Agent

1.  Đọc tài liệu này trước khi thay đổi nghiệp vụ hoặc triển khai một
    chức năng Looply.
2.  Đọc source code hiện có trước khi tạo mới module, service, route,
    component, model hoặc package.
3.  Không tự ý thay đổi một quy tắc đã được xác nhận.
4.  Không tự bổ sung chức năng ngoài phạm vi Đồ án 1.
5.  Nếu gặp nội dung chưa chốt, không tự biến phỏng đoán thành quyết
    định. Hãy nêu rõ điểm chưa chốt và hỏi người dùng khi nó ảnh hưởng
    trực tiếp đến công việc hiện tại.
6.  Chỉ triển khai phần cần thiết cho bước hiện tại; không mở rộng thành
    một hệ thống phức tạp khi nghiệp vụ chưa yêu cầu.
7.  Giữ ranh giới trách nhiệm giữa các module. Không đưa toàn bộ nghiệp
    vụ vào một module chỉ vì thuận tiện.
8.  Khi hoàn thành một phần việc, kiểm tra kết quả, chạy test phù hợp và
    cập nhật checklist tương ứng.
9.  Nếu phát hiện code hiện tại trái với tài liệu, không âm thầm sửa
    nghiệp vụ theo ý mình. Xác định sai khác, giải thích và xin xác nhận
    nếu cần thay đổi quyết định đã chốt.
10. Nếu người dùng thay đổi quyết định, cập nhật tài liệu này để nó tiếp
    tục là nguồn thông tin chính xác.
11. Không đánh dấu hoàn thành các mục chưa được kiểm thử hoặc chưa xác
    minh hành vi thực tế.
12. Không sao chép toàn bộ đặc tả vào Skill. Skill chỉ nên hướng dẫn quy
    trình làm việc và trỏ đến tài liệu này.

### 0.5. Cách cập nhật checklist sau mỗi công việc

Sau mỗi phần việc, AI Agent cần:

1.  Xác định chính xác checklist nào bị ảnh hưởng.
2.  Kiểm tra code thực tế và đối chiếu với yêu cầu tương ứng.
3.  Chạy kiểm tra phù hợp: build, unit test, integration/API test hoặc
    kiểm tra thủ công.
4.  Nếu mới triển khai nhưng chưa kiểm thử đầy đủ, giữ `[~]`.
5.  Chỉ chuyển sang `[x]` khi hành vi đáp ứng yêu cầu và đã có bằng
    chứng kiểm tra.
6.  Nếu phát hiện sai, đánh dấu `[!]` và mô tả ngắn nguyên nhân/công
    việc còn lại.
7.  Ghi chú file/module hoặc test liên quan nếu hữu ích.
8.  Không đánh dấu hoàn thành toàn bộ module nếu chỉ một phần nhỏ đã
    xong.

Có thể bổ sung ngày hoàn thành hoặc liên kết commit khi dự án cần truy
vết. Không bắt buộc phải ghi ngày cho từng checkbox nếu gây tốn công mà
không tăng giá trị.

------------------------------------------------------------------------

# 1. Tổng quan sản phẩm

## 1.1. Looply là gì?

Looply là nền tảng công khai cho phép người dùng đăng tin về đồ đã qua
sử dụng để:

-   Bán.
-   Cho thuê.
-   Trao đổi.

Looply không giới hạn đối tượng tham gia ở sinh viên và không yêu cầu
xác minh sinh viên. Người dùng thông thường có thể tạo tài khoản và sử
dụng các chức năng theo quyền được cấp.

## 1.2. Mục tiêu Đồ án 1

Đồ án 1 tập trung xây dựng phiên bản nền tảng có các khả năng cốt lõi:

-   Đăng ký và đăng nhập.
-   Quản lý hồ sơ người dùng.
-   Tạo và quản lý tin đăng.
-   Xem, tìm kiếm và lọc tin đăng.
-   Theo dõi người dùng và tin đăng.
-   Nhắn tin giữa người dùng.
-   Nhận thông báo trong ứng dụng.
-   Kiểm soát quyền truy cập và xử lý lỗi cơ bản.

Đồ án 1 là nền tảng ban đầu để có thể tiếp tục mở rộng ở Đồ án 2 và các
giai đoạn sau. Tuy nhiên, không được đưa trước các tính năng thuộc giai
đoạn sau vào phạm vi hiện tại.

## 1.3. Đối tượng và quyền truy cập tổng quát

Có hai trạng thái truy cập:

-   **Khách (Guest):** Chưa đăng nhập.
-   **Người dùng đã đăng nhập (Authenticated User):** Đã xác thực và
    được phép sử dụng các chức năng tương tác theo quyền.

Khách được phép duyệt nội dung công khai, nhưng muốn sử dụng chức năng
tương tác hoặc các chức năng cá nhân phải đăng nhập.

## 1.4. Những giới hạn lớn của Đồ án 1

-   Không có hệ thống Admin trong phạm vi Đồ án 1.
-   Không có thanh toán trực tuyến.
-   Không có hệ thống Category/danh mục trong Đồ án 1.
-   Không có xác minh người dùng là sinh viên.
-   Không triển khai Push Notification trong Đồ án 1.
-   Không hiển thị trạng thái online hoặc typing trong chat.
-   Không có chức năng thu hồi/xóa tin nhắn đã gửi.
-   Không triển khai chức năng hoàn tất giao dịch thuê bằng một trạng
    thái riêng; khi tin không còn được cung cấp, người đăng có thể đưa
    tin về trạng thái không còn khả dụng/ẩn theo nghiệp vụ đã thống
    nhất.

------------------------------------------------------------------------

# 2. Vai trò người dùng và quyền truy cập

## 2.1. Khách chưa đăng nhập

Khách được phép:

-   Xem danh sách tin đăng công khai.
-   Tìm kiếm tin đăng.
-   Sử dụng bộ lọc tin đăng.
-   Xem trang chi tiết tin đăng.

Khách không được phép thực hiện các hành động tương tác hoặc chức năng
cá nhân, bao gồm:

-   Follow/unfollow người dùng.
-   Follow/unfollow tin đăng.
-   Chat hoặc gửi tin nhắn.
-   Quản lý hồ sơ cá nhân.
-   Truy cập và sử dụng chức năng thông báo.
-   Các hành động khác yêu cầu danh tính người dùng.

Khi khách cố sử dụng chức năng yêu cầu đăng nhập, hệ thống hiển thị một
card với nội dung:

> "Bạn có muốn đăng nhập để trải nghiệm đầy đủ các tính năng của Looply
> không?"

Card có nút điều hướng đến trang đăng nhập.

## 2.2. Người dùng đã đăng nhập

Người dùng đã đăng nhập có thể sử dụng các chức năng tương tác theo
quyền, bao gồm:

-   Quản lý hồ sơ của chính mình.
-   Tạo và quản lý tin đăng của mình.
-   Follow/unfollow người dùng và tin đăng.
-   Chat với người dùng khác khi không bị chặn.
-   Quản lý thông báo của mình.
-   Sử dụng các chức năng cá nhân khác theo nghiệp vụ.

Việc đăng nhập không có nghĩa người dùng được phép sửa dữ liệu của người
khác. Backend phải kiểm tra quyền sở hữu và quyền truy cập trên từng
hành động.

## 2.3. Admin

Đồ án 1 không triển khai vai trò Admin và không xây dựng các chức năng
quản trị dành cho Admin.

------------------------------------------------------------------------

# 3. Authentication -- Đăng ký và đăng nhập

**Module chịu trách nhiệm:** `auth`

## 3.1. Đăng ký tài khoản

### Dữ liệu đăng ký

Quy trình đăng ký sử dụng các thông tin:

-   Username.
-   Password.
-   Email.
-   Số điện thoại.
-   Mã OTP SMS hợp lệ để xác minh số điện thoại.

Người dùng phải cung cấp đủ dữ liệu bắt buộc và hoàn tất xác minh OTP
thì mới có thể hoàn thành đăng ký.

### Quy tắc username

-   Username là định danh đăng nhập của tài khoản nội bộ.
-   Không nên cho phép ký tự đặc biệt trong username.
-   Username và email là hai thông tin riêng biệt.
-   Email không được tự động dùng thay username trong luồng đăng nhập
    nội bộ.

### Quy tắc password

-   Password được phép chứa ký tự đặc biệt.
-   Không cấm ký tự đặc biệt chỉ vì lo ngại SQL Injection.
-   Việc chống SQL Injection phải được xử lý bằng truy vấn có tham
    số/ORM phù hợp, không phải bằng cách cấm ký tự hợp lệ trong mật
    khẩu.
-   Mật khẩu phải được hash trước khi lưu; không lưu plaintext.

### Xác minh số điện thoại

-   Đăng ký cần OTP SMS hợp lệ.
-   OTP dùng để xác minh số điện thoại.
-   Không hoàn tất đăng ký nếu OTP không hợp lệ hoặc không đáp ứng điều
    kiện xác minh.

## 3.2. Các phương thức đăng nhập

Looply có các phương thức đăng nhập đã thống nhất:

1.  Username + Password.
2.  Số điện thoại + SMS OTP.
3.  Đăng nhập bằng Google.

### Username + Password

-   Người dùng nhập username và password.
-   Backend xác minh tài khoản và mật khẩu.
-   Mật khẩu được kiểm tra dựa trên password hash đã lưu.

### Số điện thoại + SMS OTP

-   Người dùng sử dụng số điện thoại và OTP SMS để đăng nhập.
-   OTP phải được xác minh ở Backend.
-   Không tin OTP hoặc trạng thái xác minh do Frontend tự khai báo.

### Đăng nhập Google

-   Google là phương thức đăng nhập riêng.
-   Backend phải xác minh danh tính/token Google.
-   Không tự động coi email Google là tài khoản nội bộ có password.
-   Không tự động chuyển đổi hoặc liên kết tài khoản Google với tài
    khoản nội bộ nếu chưa có quy trình liên kết được xác nhận.

## 3.3. Phân biệt tài khoản Google và tài khoản nội bộ

Tài khoản được đăng ký bằng Google không mặc nhiên có thể đăng nhập bằng
username/password nội bộ.

Không tự triển khai cơ chế tự động gộp tài khoản chỉ vì hai phương thức
có cùng email.

## 3.4. Thay đổi thông tin bảo mật

Email và số điện thoại không được thay đổi như một trường profile thông
thường.

Khi thay đổi:

-   Email mới phải được xác minh bằng email OTP.
-   Số điện thoại mới phải được xác minh bằng SMS OTP.
-   Chỉ cập nhật thông tin sau khi xác minh thông tin mới thành công.

## 3.5. Những điểm chưa chốt trong Authentication

Không tự quyết định thay người dùng các nội dung sau nếu công việc hiện
tại cần đến:

-   Nhà cung cấp SMS.
-   Nhà cung cấp email.
-   Thời hạn OTP cụ thể.
-   Độ dài OTP, số lần nhập sai và chính sách gửi lại OTP cụ thể.
-   Quy tắc liên kết/chuyển đổi hai loại tài khoản nếu sau này phát sinh
    nhu cầu.
-   Chính sách chi tiết về khóa tài khoản hoặc khôi phục tài khoản.

Các chi tiết trên cần được quyết định riêng trước khi triển khai phần
phụ thuộc vào chúng.

------------------------------------------------------------------------

# 4. User / Profile -- Hồ sơ người dùng

**Module chịu trách nhiệm:** `user`

## 4.1. Quản lý hồ sơ

-   Người dùng có thể xem và chỉnh sửa thông tin hồ sơ của chính mình.
-   Không được chỉnh sửa hồ sơ người dùng khác.
-   Email và số điện thoại không chỉnh sửa trực tiếp trong luồng edit
    profile thông thường; chúng có quy trình xác minh riêng ở module
    `auth`.

## 4.2. Địa điểm hồ sơ

-   Địa điểm là thông tin bắt buộc khi đăng ký.
-   Phạm vi địa điểm hồ sơ là tỉnh/thành phố hoặc thông tin thành phố +
    tỉnh theo cấu trúc dữ liệu được triển khai.
-   Không yêu cầu địa chỉ chi tiết như số nhà, đường, phường/xã trong
    thông tin hồ sơ bắt buộc.
-   Địa điểm hồ sơ phục vụ trải nghiệm nội dung gần người dùng và làm
    giá trị mặc định khi tạo listing.
-   Khi người dùng đổi địa điểm hồ sơ, các listing đã tạo trước đó không
    tự động thay đổi địa điểm.

## 4.3. Avatar

Người dùng có thể:

-   Upload avatar.
-   Thay avatar.
-   Tối ưu dung lượng ảnh avatar.

Avatar là media của hồ sơ người dùng và được xử lý thông qua module
`media`.

## 4.4. Follow người dùng

Người dùng đã đăng nhập có thể:

-   Follow người dùng khác.
-   Unfollow người dùng đang follow.
-   Xem danh sách follower.
-   Xem danh sách following.
-   Xem số lượng follower.
-   Xem số lượng following.

Khi unfollow, hệ thống phải yêu cầu xác nhận trước khi thực hiện.

Không gửi notification chỉ vì một người follow hoặc unfollow người khác.

## 4.5. Block người dùng

Người dùng có thể:

-   Block người dùng khác.
-   Xem danh sách blocked users.
-   Unblock người dùng đã block.

Quy tắc đã thống nhất:

-   Người bị block biết rằng mình bị block.
-   Block ngăn việc nhắn tin giữa hai người theo phạm vi nghiệp vụ chat.
-   Block không làm thay đổi trạng thái follow.
-   Block không tự động ẩn listing của người bị block.
-   Khi unblock, hai bên có thể nhắn tin lại ngay theo điều kiện chat
    thông thường.

**Điểm cần xác nhận trước khi triển khai chiều chặn:** Quy tắc chặn tin
nhắn một chiều hay chặn cả hai chiều trong trường hợp A block B chưa
được người dùng xác nhận rõ. Không tự suy diễn thành quyết định cuối
cùng.

------------------------------------------------------------------------

# 5. Listing -- Tin đăng

**Module chịu trách nhiệm:** `listing`

## 5.1. Mục đích

Listing là nội dung người dùng tạo để giới thiệu món đồ đã qua sử dụng
với mục đích bán, cho thuê hoặc trao đổi.

## 5.2. Loại giao dịch

Đồ án 1 hỗ trợ ba loại giao dịch:

-   Bán.
-   Thuê.
-   Trao đổi.

Quy tắc thay đổi loại giao dịch:

-   Trước khi listing có người bắt đầu tương tác bằng chat, chủ listing
    có thể thay đổi loại giao dịch.
-   Sau khi đã có tương tác chat, loại giao dịch được cố định theo quy
    tắc đã thống nhất.

Follow listing không được xem là tương tác làm khóa loại giao dịch.

## 5.3. Địa điểm listing

-   Địa điểm listing là bắt buộc.
-   Khi tạo listing, địa điểm được điền sẵn từ địa điểm hồ sơ.
-   Người đăng có thể chỉnh sửa địa điểm này trước khi đăng.
-   Địa điểm listing độc lập với địa điểm hồ sơ sau khi listing đã được
    tạo.
-   Thay đổi địa điểm hồ sơ không làm thay đổi các listing cũ.

## 5.4. Thay đổi listing trước và sau khi có tương tác

### Trước khi có người nhắn tin

Chủ listing có thể chỉnh sửa thông tin listing theo quy tắc hiện tại.

Follow listing không làm hạn chế quyền sửa listing.

### Sau khi có người nhắn tin

Khi listing đã có ít nhất một người tương tác bằng chat:

1.  Chủ listing muốn chỉnh sửa thì hệ thống hiển thị cảnh báo rằng
    listing đã có người tương tác.
2.  Hệ thống hỏi chủ listing có muốn tiếp tục chỉnh sửa không.
3.  Nếu chủ listing xác nhận, hệ thống cho phép tiếp tục.
4.  Nếu chủ listing hủy, dữ liệu không thay đổi và không gửi thông báo
    sửa listing.
5.  Nếu chỉnh sửa thành công, hệ thống gửi thông báo đến những người có
    conversation liên quan đến listing đó.

Không gửi thông báo sửa listing cho follower chỉ vì họ follow listing.

## 5.5. Follow listing

-   Người dùng đã đăng nhập có thể follow/unfollow listing.
-   Follow không được xem là tương tác chat.
-   Người follow không nhận thông báo chỉ vì chủ listing chỉnh sửa
    listing.
-   Việc chỉnh sửa listing không tự động hủy follow của người dùng.

## 5.6. Trạng thái listing

Listing có bốn trạng thái nghiệp vụ:

1.  Đang hiển thị.
2.  Đã ẩn.
3.  Không còn khả dụng.
4.  Đã xóa.

Quy tắc:

-   Listing đã ẩn không hiển thị như listing đang hoạt động trong danh
    sách công khai.
-   Listing không còn khả dụng được loại khỏi danh sách listing đang có
    thể giao dịch.
-   Listing đã xóa được xử lý theo cơ chế soft delete.
-   Lịch sử chat liên quan đến listing vẫn được giữ theo quy tắc chat.
-   Khi listing đã ẩn, đã xóa hoặc không còn khả dụng, không cho phép
    bắt đầu conversation mới từ listing đó.
-   Conversation cũ liên quan đến listing vẫn có thể tiếp tục nhắn tin.

**Lưu ý:** Không tự tạo thêm trạng thái như "đã hoàn tất thuê" trong Đồ
án 1. Nghiệp vụ thuê không có trạng thái hoàn tất riêng đã được chốt;
khi không còn cung cấp, listing được xử lý bằng trạng thái phù hợp trong
bốn trạng thái đã nêu.

## 5.7. Quyền quản lý listing

-   Chỉ chủ listing được phép chỉnh sửa, ẩn, khôi phục hoặc xóa listing
    của mình.
-   Backend phải kiểm tra quyền sở hữu trước khi thực hiện.
-   Không được chỉ dựa vào việc ẩn nút trên Frontend.
-   Không được tin ID do client gửi mà bỏ qua kiểm tra chủ sở hữu.

## 5.8. Thời gian tạo và cập nhật

-   Cần lưu thời điểm tạo listing (`createdAt`).
-   Cần lưu thời điểm cập nhật gần nhất (`updatedAt`).
-   `createdAt` phản ánh thời điểm listing được tạo.
-   `updatedAt` thay đổi khi listing được chỉnh sửa.

Người dùng mong muốn ngày hiển thị trên listing phản ánh việc chỉnh sửa
thay vì luôn hiển thị ngày cũ. Cách trình bày chính xác trên UI (ví dụ
nhãn "Đã cập nhật") cần được quyết định trong lúc thiết kế giao diện;
không được xóa mất dữ liệu thời điểm tạo ban đầu.

## 5.9. Các điểm listing chưa được đặc tả đầy đủ

Không tự đặt ra các trường hoặc quy tắc chưa được xác nhận, ví dụ:

-   Danh sách trường dữ liệu đầy đủ của listing.
-   Quy tắc chi tiết về giá cho từng loại giao dịch.
-   Tập trạng thái chuyển đổi đầy đủ và điều kiện của từng chuyển đổi
    ngoài các quy tắc đã nêu.
-   Quy trình kiểm duyệt listing.
-   Quy tắc báo cáo vi phạm.
-   Các trường thông tin sản phẩm chưa được thảo luận.

------------------------------------------------------------------------

# 6. Media -- Ảnh và video

**Module chịu trách nhiệm:** `media`

## 6.1. Phạm vi media listing

Một listing được phép có:

-   Tối đa 5 ảnh.
-   Tối đa 1 video.

Video được upload trực tiếp lên hệ thống, không chỉ lưu đường dẫn nhúng
từ nền tảng bên ngoài.

## 6.2. Quản lý media

Người dùng có thể:

-   Xem trước ảnh/video trước khi đăng listing.
-   Thay thế media.
-   Sắp xếp thứ tự media.
-   Xóa media.

## 6.3. Xử lý ảnh

-   Ảnh cần được tối ưu/nén để giảm dung lượng.
-   Avatar cũng cần được tối ưu.
-   Việc xử lý ảnh thuộc trách nhiệm của module `media`, không nên rải
    logic xử lý ảnh vào module `user` và `listing`.

## 6.4. Lưu trữ

-   Trong Đồ án 1, media được lưu local trên máy phục vụ môi trường
    localhost/demo.
-   Thiết kế nên có lớp trừu tượng/service lưu trữ để có thể thay local
    storage bằng storage bên ngoài trong tương lai mà không phải sửa
    nhiều nghiệp vụ `user` hoặc `listing`.
-   Module nghiệp vụ không nên phụ thuộc trực tiếp vào đường dẫn vật lý
    của file trên máy.

## 6.5. Giới hạn video chưa chốt hoàn toàn

Người dùng đã định hướng video ngắn, khoảng 2--3 phút; có thể chấp nhận
tối đa 5 phút nếu khả thi.

Do giới hạn cuối cùng chưa được xác nhận, không được tự coi một con số
cụ thể là yêu cầu cuối cùng.

Các thông số chưa chốt: - Thời lượng tối đa chính thức. - Dung lượng tối
đa. - Định dạng/codec được chấp nhận. - Cách kiểm tra metadata và thời
lượng. - Có cần xử lý chuyển mã video hay chỉ lưu và phục vụ file gốc.

------------------------------------------------------------------------

# 7. Search, Filtering và Feed

**Trách nhiệm chính:** `listing` phối hợp với logic truy vấn/feed phù
hợp. Không có module Category trong Đồ án 1.

## 7.1. Tìm kiếm

-   Tìm kiếm theo tiêu đề listing.
-   Không tìm kiếm theo description trong Đồ án 1.
-   Hỗ trợ nội dung tiếng Việt.
-   Có gợi ý kết quả khi người dùng đang nhập (autocomplete).

## 7.2. Bộ lọc

Các bộ lọc đã thống nhất:

-   Loại giao dịch: bán, thuê, trao đổi.
-   Giá.
-   Địa điểm.
-   Thời gian đăng.

Giá phải được xử lý phù hợp với loại giao dịch. Đặc biệt, thuê có đơn vị
ngày/tháng; không được coi giá thuê theo ngày và giá thuê theo tháng là
cùng một đơn vị khi lọc hoặc hiển thị.

Không có bộ lọc tình trạng sản phẩm trong Đồ án 1.

Không có bộ lọc Category trong Đồ án 1.

## 7.3. Sắp xếp

Các lựa chọn sắp xếp:

-   Mới nhất.
-   Cũ nhất.
-   Giá thấp đến cao.
-   Giá cao đến thấp.

Quy tắc sắp xếp giá cần tôn trọng ngữ nghĩa loại giao dịch và đơn vị
giá; không tự so sánh các giá khác đơn vị như thể chúng tương đương.

## 7.4. Tải danh sách liên tục

-   Giao diện dùng Infinite Scroll thay vì yêu cầu người dùng chuyển
    trang bằng pagination truyền thống.
-   Backend cần cung cấp cách phân đoạn dữ liệu phù hợp để Frontend tải
    tiếp khi cuộn.

**Lưu ý:** Cursor-based pagination là hướng kỹ thuật đã được đề xuất,
nhưng chi tiết cursor, sort key và API contract chưa được chốt trong đặc
tả nghiệp vụ này.

## 7.5. Feed từ người đang follow và người còn lại

Feed được ghép từ hai nhóm:

1.  Một số lượng N listing ngẫu nhiên từ những người mà người dùng đang
    follow, chỉ lấy listing trong 3 ngày gần nhất.
2.  Một số lượng N listing mới nhất từ những người còn lại.

Hai nhóm được ghép thành feed.

Các điểm chưa chốt: - Giá trị cụ thể của N. - Quy tắc loại trùng chi
tiết giữa hai nhóm. - Cách đảm bảo kết quả ổn định khi tải các lượt tiếp
theo. - Có cần ghi nhớ lịch sử listing đã hiển thị cho từng user hay
không.

AI Agent không được tự đặt N hoặc tự thêm thuật toán feed phức tạp khi
chưa cần thiết. Hãy hỏi người dùng nếu việc triển khai hiện tại phụ
thuộc vào các chi tiết này.

------------------------------------------------------------------------

# 8. Chat -- Nhắn tin

**Module chịu trách nhiệm:** `chat`

## 8.1. Mục đích

Chat cho phép người dùng đã đăng nhập trao đổi trực tiếp với nhau về
listing hoặc nhắn tin tự do không gắn với listing cụ thể.

Chat phải hỗ trợ gửi/nhận tin nhắn thời gian thực, không cần tải lại
trang.

## 8.2. Một conversation duy nhất giữa một cặp người dùng

Quy tắc quan trọng:

-   Một cặp người dùng chỉ có một conversation duy nhất.
-   Không tạo conversation mới chỉ vì hai người bắt đầu trao đổi về
    listing khác.
-   Nếu conversation giữa hai người đã tồn tại, thao tác nhắn tin tiếp
    theo mở lại conversation đó.
-   Nếu chưa tồn tại, hệ thống tạo conversation.

Quy tắc này áp dụng cho cả chat bắt đầu từ listing và chat tự do.

## 8.3. Conversation có thể liên quan đến nhiều listing

Một conversation có thể trao đổi về nhiều listing khác nhau.

Ví dụ:

1.  A nhắn B về listing laptop.
2.  Sau đó A tiếp tục nhắn B về listing điện thoại.
3.  Hệ thống vẫn sử dụng conversation hiện có giữa A và B.
4.  Conversation được liên kết thêm với listing điện thoại; không tạo
    conversation thứ hai.

Vì vậy, không thiết kế conversation theo hướng bắt buộc mỗi listing có
một conversation riêng.

Một listing vẫn có thể có nhiều conversation với nhiều người dùng khác
nhau.

## 8.4. Chat tự do

-   Người dùng có thể chủ động nhắn cho người dùng khác mà không bắt đầu
    từ listing.
-   Chat tự do vẫn tuân theo quy tắc một conversation duy nhất giữa cặp
    người dùng.
-   Conversation có thể chưa liên kết listing nào.

## 8.5. Chat realtime

-   Gửi và nhận tin nhắn không cần reload.
-   Dùng cơ chế realtime đã chọn cho Backend/Frontend.
-   Không hiển thị online status.
-   Không hiển thị typing indicator.

## 8.6. Trạng thái tin nhắn

Sử dụng ba trạng thái phân biệt:

-   **Sent:** Tin nhắn đã được Backend lưu thành công.
-   **Delivered:** Client của người nhận đã nhận được tin nhắn.
-   **Read:** Người nhận đã mở conversation và tin nhắn được xác định là
    đã đọc theo logic hệ thống.

Không gộp ba trạng thái thành một nếu cần thể hiện tiến trình
gửi/nhận/đọc.

## 8.7. Ẩn conversation ở phía người dùng

-   Người dùng có thể soft-delete/ẩn conversation ở phía tài khoản của
    mình.
-   Việc ẩn conversation của một người không đồng nghĩa xóa conversation
    của người còn lại.
-   Khi có tin nhắn mới từ phía bên kia, conversation đã ẩn sẽ xuất hiện
    lại ở phía người dùng đã ẩn.
-   Tin nhắn cũ được giữ lại theo conversation; không xóa lịch sử chỉ vì
    một người ẩn conversation.

## 8.8. Listing thay đổi trạng thái nhưng chat cũ vẫn hoạt động

Khi listing bị ẩn, xóa hoặc không còn khả dụng:

-   Không cho phép bắt đầu conversation mới từ listing đó.
-   Conversation đã tồn tại vẫn có thể tiếp tục trao đổi.
-   Lịch sử chat không bị xóa theo listing.
-   Thiết kế dữ liệu phải cho phép conversation/message tồn tại ngay cả
    khi listing không còn khả dụng hoặc đã bị xóa mềm.
-   Chat tự do vẫn có thể tiếp tục trong conversation đó.

## 8.9. Không thu hồi tin nhắn

Đồ án 1 không có chức năng thu hồi hoặc xóa tin nhắn đã gửi.

## 8.10. Block và chat

-   Người dùng bị block không thể nhắn tin theo quy tắc block đã nêu.
-   Sau khi unblock, hai bên có thể nhắn tin lại theo điều kiện thông
    thường.
-   Chiều áp dụng block (một chiều hay hai chiều) vẫn cần xác nhận trước
    khi triển khai nếu logic hiện tại phụ thuộc vào quyết định đó.

------------------------------------------------------------------------

# 9. Notification -- Thông báo

**Module chịu trách nhiệm:** `notification`

## 9.1. Phạm vi

Đồ án 1 có thông báo trong ứng dụng (in-app notification) và cập nhật
realtime.

Không triển khai Push Notification trong Đồ án 1.

## 9.2. Thông báo liên quan đến chat

-   Chỉ hiển thị biểu tượng thông báo và số lượng thông báo/tin nhắn
    chưa đọc theo thiết kế đã thống nhất.
-   Không cần hiển thị nội dung tin nhắn xem trước trong notification.
-   Cập nhật số lượng chưa đọc theo sự kiện phù hợp.

## 9.3. Thông báo liên quan đến người dùng

Không tạo notification chỉ vì các hành động sau:

-   Follow user.
-   Unfollow user.
-   Block user.
-   Unblock user.

Không tự bổ sung notification cho mọi thay đổi hồ sơ người dùng.

## 9.4. Notification center

Người dùng có thể:

-   Xem danh sách thông báo.
-   Đánh dấu từng thông báo đã đọc.
-   Đánh dấu tất cả thông báo đã đọc.
-   Xóa từng thông báo riêng lẻ.

Thông báo trong danh sách không tự động biến mất chỉ vì đã qua một
khoảng thời gian.

## 9.5. Toast

-   Toast có thể tự đóng sau vài giây.
-   Việc toast biến mất không đồng nghĩa xóa bản ghi notification.
-   Nếu notification cần được lưu trong trung tâm thông báo, bản ghi vẫn
    tồn tại theo quy tắc lưu trữ của hệ thống.

## 9.6. Điều hướng khi nhấn notification

-   Notification liên quan đến tin nhắn mới: mở conversation tương ứng.
-   Notification liên quan đến listing được chỉnh sửa: mở trang chi tiết
    listing tương ứng.
-   Notification đã được đánh dấu đọc vẫn có thể được nhấn và điều hướng
    như bình thường.

## 9.7. Sự kiện listing được chỉnh sửa

Khi chủ listing chỉnh sửa thành công một listing đã có người nhắn tin và
xác nhận tiếp tục:

-   Gửi thông báo đến những người có conversation liên quan đến listing.
-   Không gửi thông báo cho người chỉ follow listing mà không có
    conversation liên quan.
-   Nếu chủ listing hủy thao tác chỉnh sửa thì không có thay đổi và
    không phát notification chỉnh sửa.

------------------------------------------------------------------------

# 10. Reminder -- Nhắc hoàn thiện hồ sơ

**Module chịu trách nhiệm:** `reminder`

## 10.1. Mục đích

Reminder chỉ nhắc người dùng hoàn thiện những thông tin hồ sơ tùy chọn
khi điều đó thực sự có ích cho trải nghiệm.

Reminder không được biến thành cơ chế ép buộc người dùng hoàn thiện mọi
thông tin.

## 10.2. Địa điểm không thuộc Reminder

Địa điểm là thông tin bắt buộc khi đăng ký vì có ảnh hưởng đến feed và
địa điểm listing. Do đó:

-   Không coi địa điểm là thông tin tùy chọn để Reminder nhắc sau.
-   Không cho phép hoàn tất đăng ký nếu thiếu địa điểm bắt buộc theo quy
    tắc đăng ký.

## 10.3. Những thông tin không tự động nhắc

Không mặc định nhắc avatar hoặc bio chỉ vì người dùng chưa điền.

Chỉ nhắc thông tin tùy chọn khi có lý do thực sự hữu ích và phù hợp với
trải nghiệm.

## 10.4. Thời điểm kiểm tra

-   Kiểm tra điều kiện reminder khi người dùng bắt đầu một phiên sử dụng
    mới.
-   Khi người dùng bỏ qua/đóng lời nhắc, không nhắc lại trong phiên hiện
    tại.
-   Sang phiên tiếp theo, nếu điều kiện vẫn còn thì có thể nhắc lại.

## 10.5. Giao diện và hành vi

-   Lời nhắc nhỏ, không gây cản trở.
-   Có nút điều hướng đến khu vực chỉnh sửa hồ sơ phù hợp.
-   Có thể đóng hoặc bỏ qua.
-   Không ép người dùng hoàn thiện.
-   Không khóa hoặc ngăn cản các chức năng khác.

## 10.6. Những điểm kỹ thuật chưa chốt

-   Định nghĩa kỹ thuật chính xác của một phiên sử dụng.
-   Cách lưu trạng thái bỏ qua theo phiên.
-   Danh sách cuối cùng các trường tùy chọn đủ quan trọng để nhắc.

Không tự dùng cron job hoặc hệ thống lịch chạy định kỳ nếu nghiệp vụ đã
xác định kiểm tra khi bắt đầu phiên và chưa có yêu cầu khác.

------------------------------------------------------------------------

# 11. Authorization -- Xác thực quyền và kiểm soát truy cập

**Trách nhiệm:** `auth` và middleware/phần authorization dùng chung; các
module nghiệp vụ phải thực hiện kiểm tra quyền sở hữu tài nguyên của
mình.

## 11.1. Phân biệt Authentication và Authorization

-   Authentication: xác định người dùng là ai.
-   Authorization: xác định người dùng có quyền thực hiện hành động cụ
    thể hay không.

Có JWT hợp lệ không đồng nghĩa người dùng được phép thao tác trên mọi
tài nguyên.

## 11.2. Guest access

-   Guest được xem, tìm kiếm, lọc và mở chi tiết listing công khai.
-   Guest không được thực hiện các hành động tương tác hoặc chức năng cá
    nhân cần đăng nhập.
-   Backend phải từ chối request không có xác thực hợp lệ đối với
    endpoint được bảo vệ.

## 11.3. Listing ownership

-   Chỉ chủ listing được sửa, ẩn, khôi phục hoặc xóa listing của mình.
-   Backend phải xác định chủ sở hữu từ danh tính đã xác thực và dữ liệu
    lưu trong database.
-   Không tin `ownerId` hoặc ID do client gửi nếu chưa kiểm tra quyền.

## 11.4. Profile ownership

-   Người dùng chỉ được sửa profile của chính mình.
-   Không được thay đổi thông tin bảo mật của người khác.
-   Email và phone có quy trình xác minh riêng.

## 11.5. Chat authorization

-   Chỉ người tham gia conversation được truy cập nội dung conversation
    đó.
-   Backend phải kiểm tra quyền trước khi cho phép tham gia room
    Socket.IO hoặc nhận/gửi sự kiện.
-   Phải kiểm tra block theo quy tắc đã thống nhất và điểm còn chờ xác
    nhận.
-   Không để người dùng truy cập conversation chỉ bằng cách đoán hoặc
    thay ID.

## 11.6. Không có Admin trong Đồ án 1

Không tạo role Admin hoặc API quản trị nếu chưa có yêu cầu thuộc phạm vi
Đồ án 1.

------------------------------------------------------------------------

# 12. Validation -- Kiểm tra dữ liệu

**Trách nhiệm:** Frontend kiểm tra sớm để cải thiện trải nghiệm; Backend
luôn kiểm tra lại để bảo vệ hệ thống.

## 12.1. Frontend validation

-   Kiểm tra dữ liệu ngay khi người dùng nhập hoặc khi tương tác với
    biểu mẫu.
-   Hiển thị lỗi sớm, tránh đợi gửi request lên Backend mới phát hiện
    lỗi có thể kiểm tra tại giao diện.
-   Lỗi nên hiển thị gần trường nhập liệu tương ứng khi có thể.
-   Frontend validation giúp trải nghiệm tốt hơn nhưng không phải ranh
    giới bảo mật.

## 12.2. Backend validation

-   Backend phải kiểm tra mọi dữ liệu nhận từ request trước khi xử lý
    nghiệp vụ.
-   Không giả định request luôn đi qua giao diện Looply.
-   Request gửi trực tiếp, request bị sửa hoặc request từ client khác
    vẫn phải chịu validation.
-   Backend trả lỗi theo cấu trúc thống nhất để Frontend có thể xử lý.

## 12.3. Phân biệt validation và nghiệp vụ

Validation kiểm tra dữ liệu có đúng định dạng/giới hạn hay không.

Business rule kiểm tra hành động có hợp lệ theo trạng thái hệ thống hay
không.

Ví dụ: - Giá sai định dạng: validation. - Người dùng không phải chủ
listing: authorization. - Listing không còn khả dụng nên không thể bắt
đầu chat mới: business rule. - OTP hết hạn: điều kiện nghiệp vụ xác
minh.

Không gom tất cả lỗi vào một loại lỗi chung.

------------------------------------------------------------------------

# 13. Error Handling -- Xử lý lỗi

## 13.1. Backend

-   Có cơ chế xử lý lỗi tập trung.
-   Các API trả lỗi theo cấu trúc thống nhất.
-   Phân biệt lỗi validation, lỗi nghiệp vụ, lỗi xác thực/phân quyền và
    lỗi hệ thống.
-   Không trả stack trace hoặc thông tin database nội bộ cho người dùng.
-   Không để mỗi route tự tạo một kiểu response lỗi không nhất quán.

## 13.2. Frontend

Frontend đảm nhiệm chính việc hiển thị lỗi cho người dùng.

Các nhóm lỗi cần phân biệt: - Lỗi nhập liệu. - Lỗi nghiệp vụ. - Lỗi xác
thực hoặc không đủ quyền. - Lỗi mạng/không kết nối được Backend. - Lỗi
hệ thống không dự kiến.

Thông báo cần thân thiện, dễ hiểu và không tiết lộ thông tin kỹ thuật
nhạy cảm.

## 13.3. Logging

-   Có ghi nhận lỗi và thông tin vận hành cần thiết.
-   Dùng logging có cấu trúc theo công cụ đã lựa chọn trong tài liệu
    package Backend.
-   Không ghi password, OTP, token, secret hoặc dữ liệu nhạy cảm.
-   Logging phục vụ phát triển, debug và bảo trì cả Đồ án 1 lẫn các giai
    đoạn sau.

------------------------------------------------------------------------

# 14. Testing -- Kiểm thử

## 14.1. Mục tiêu

Không chỉ dựa vào kiểm thử thủ công. Dự án cần có kiểm thử tự động để
phát hiện lỗi khi code hoặc nghiệp vụ thay đổi.

## 14.2. Các loại kiểm thử Backend

-   Unit test: kiểm tra hàm/service/logic riêng.
-   Integration test: kiểm tra nhiều thành phần phối hợp.
-   API test: kiểm tra endpoint, status code, response và các trường hợp
    lỗi.
-   Coverage: theo dõi phần code được thực thi bởi test.

Bộ công cụ Backend đã được thống nhất trong tài liệu package: Vitest,
Supertest và Vitest coverage provider.

## 14.3. Kiểm thử Frontend

Frontend cần kiểm thử các logic, form và component phù hợp với cấu hình
Angular được lựa chọn khi triển khai. Không tự cài trùng framework test
nếu Angular đã cung cấp cấu hình tương ứng.

## 14.4. Postman

-   Postman là công cụ kiểm thử thủ công.
-   Có thể dùng khi cần gửi request trực tiếp, kiểm tra
    header/body/token/response hoặc thử nhanh API.
-   Postman không thay thế unit test, integration test và API test tự
    động.

## 14.5. E2E

E2E là hướng có thể bổ sung khi các luồng chính trên trình duyệt đã ổn
định. Không coi E2E là điều kiện bắt buộc phải hoàn thành trước khi bắt
đầu xây dựng các module nền tảng.

------------------------------------------------------------------------

# 15. Ranh giới trách nhiệm giữa các module

Các module nghiệp vụ dự kiến của Looply Đồ án 1:

  -----------------------------------------------------------------------
  Module                  Trách nhiệm chính       Không nên làm thay
  ----------------------- ----------------------- -----------------------
  `auth`                  Đăng ký, đăng nhập, xác Quản lý toàn bộ hồ sơ,
                          minh OTP, Google        listing hoặc chat
                          authentication, xác     
                          thực danh tính          

  `user`                  Hồ sơ, follow user,     Xử lý password/token
                          block user,             thay auth; xử lý file
                          follower/following      ảnh thô thay media

  `listing`               Tạo, xem, sửa, ẩn, khôi Tự xử lý chi tiết file
                          phục, xóa và quản lý    upload thay media
                          trạng thái listing      

  `media`                 Tiếp nhận, kiểm tra,    Quyết định nghiệp vụ
                          tối ưu và lưu trữ file  listing hoặc profile
                          media                   

  `chat`                  Conversation, message,  Quản lý notification
                          quyền truy cập chat và  center thay
                          trạng thái tin nhắn     notification

  `notification`          Tạo, lưu, đọc, xóa và   Tự xử lý nghiệp vụ
                          phát thông báo          nguồn như sửa listing
                                                  hoặc gửi message

  `reminder`              Kiểm tra điều kiện nhắc Chặn người dùng sử dụng
                          hoàn thiện hồ sơ và     ứng dụng
                          trạng thái nhắc         

  Shared infrastructure   Database client,        Chứa toàn bộ nghiệp vụ
                          validation utilities,   của mọi module
                          error handling,         
                          logging, auth           
                          middleware và cấu hình  
                          dùng chung              
  -----------------------------------------------------------------------

Các module có thể gọi hoặc phát sự kiện cho nhau qua cách tích hợp được
thiết kế rõ ràng. Không vì một module cần dữ liệu của module khác mà sao
chép toàn bộ logic của module kia.

------------------------------------------------------------------------

# 16. Phạm vi không triển khai trong Đồ án 1

Những nội dung sau được loại khỏi phạm vi Đồ án 1 hoặc để dành cho giai
đoạn sau:

  -----------------------------------------------------------------------
  Nội dung                            Phạm vi
  ----------------------------------- -----------------------------------
  Admin và hệ thống quản trị          Đồ án 2

  Category/danh mục listing           Đồ án 2

  Thanh toán trực tuyến               Ngoài Đồ án 1; định hướng giai đoạn
                                      sau

  Các nghiệp vụ quản trị vi phạm,     Đồ án 2
  khóa tài khoản ở cấp Admin          

  Xác minh người dùng là sinh viên    Không thuộc định hướng sản phẩm đã
                                      chọn

  Push Notification                   Không triển khai Đồ án 1

  Online status và typing indicator   Không triển khai Đồ án 1

  Thu hồi/xóa tin nhắn đã gửi         Không triển khai Đồ án 1

  Search theo description             Không triển khai Đồ án 1

  Filter theo Category                Không triển khai Đồ án 1

  Filter theo tình trạng sản phẩm     Không triển khai Đồ án 1

  Hoàn tất giao dịch thuê bằng trạng  Không có trong Đồ án 1
  thái riêng                          
  -----------------------------------------------------------------------

Không được chủ động triển khai các mục này chỉ vì thấy chúng phổ biến ở
marketplace hoặc mạng xã hội khác.

------------------------------------------------------------------------

# 17. Các quyết định còn mở -- Không được tự suy diễn

Phần này ghi nhận những điểm chưa được xác nhận đầy đủ. Đây không phải
danh sách chức năng được phép tự triển khai theo phỏng đoán.

  -----------------------------------------------------------------------
  Nhóm                                Nội dung còn mở
  ----------------------------------- -----------------------------------
  Auth                                Nhà cung cấp SMS/email; thời hạn và
                                      chính sách OTP chi tiết; khôi phục
                                      tài khoản; liên kết hai phương thức
                                      tài khoản

  User / Block                        Block áp dụng một chiều hay hai
                                      chiều đối với nhắn tin

  Listing                             Bộ trường dữ liệu listing đầy đủ;
                                      một số điều kiện chuyển trạng thái
                                      chi tiết; cách trình bày ngày cập
                                      nhật trên UI

  Media                               Thời lượng video tối đa chính thức;
                                      dung lượng; định dạng/codec; xử
                                      lý/chuyển mã video

  Search                              Chi tiết autocomplete, cách xử lý
                                      ranking; API contract tìm kiếm

  Feed                                Giá trị N; quy tắc loại trùng và ổn
                                      định giữa các lần tải

  Pagination                          Chi tiết cursor và contract tải
                                      tiếp

  Chat                                Chi tiết kỹ thuật về delivered/read
                                      acknowledgement; block hai chiều;
                                      quy tắc cụ thể khi hai bên có nhiều
                                      thao tác đồng thời

  Reminder                            Định nghĩa kỹ thuật của phiên sử
                                      dụng; danh sách cuối cùng các
                                      trường tùy chọn được nhắc

  UI                                  Chi tiết thiết kế, bố cục,
                                      responsive và nội dung của các màn
                                      hình ngoài những hành vi đã nêu

  Security                            Chính sách chi tiết về thời hạn
                                      access token, refresh token, thu
                                      hồi phiên và khóa đăng nhập
  -----------------------------------------------------------------------

Khi một công việc phụ thuộc vào một điểm còn mở: 1. Xác định chính xác
quyết định còn thiếu. 2. Giải thích vì sao cần quyết định đó. 3. Hỏi
người dùng một câu hỏi trọng tâm. 4. Chỉ tiếp tục phần bị phụ thuộc sau
khi có quyết định; các phần độc lập vẫn có thể triển khai.

------------------------------------------------------------------------

# 18. Checklist tổng thể Đồ án 1

> Các mục bên dưới là checklist theo dõi **tiến độ triển khai**, không
> phải checklist xác nhận nghiệp vụ. Tất cả bắt đầu ở trạng thái
> `[?] Chưa đánh giá` cho đến khi kiểm tra repository.

## 18.1. Nền tảng và cấu hình

-   \[?\] Kiểm tra cấu trúc Backend/Frontend hiện tại.
-   \[?\] Cấu hình môi trường phát triển.
-   \[?\] Cấu hình kết nối PostgreSQL.
-   \[?\] Cấu hình Prisma Client và migration.
-   \[?\] Cấu hình Express application.
-   \[?\] Cấu hình logging dùng chung.
-   \[?\] Cấu hình xử lý lỗi tập trung.
-   \[?\] Cấu hình validation dùng chung.
-   \[?\] Chuẩn hóa response API ở mức cần thiết.
-   \[?\] Cấu hình kiểm thử tự động cơ bản.

## 18.2. Authentication

-   \[?\] Đăng ký với các dữ liệu bắt buộc.
-   \[?\] Kiểm tra quy tắc username.
-   \[?\] Hash và lưu password an toàn.
-   \[?\] Xác minh số điện thoại bằng SMS OTP.
-   \[?\] Đăng nhập username/password.
-   \[?\] Đăng nhập số điện thoại/OTP.
-   \[?\] Đăng nhập Google và xác minh token ở Backend.
-   \[?\] Phân biệt tài khoản Google và tài khoản nội bộ.
-   \[?\] Middleware xác thực request.
-   \[?\] Giới hạn request ở endpoint nhạy cảm.
-   \[?\] Thay đổi số điện thoại có SMS OTP.
-   \[?\] Thay đổi email có email OTP.

## 18.3. User / Profile

-   \[?\] Xem hồ sơ người dùng.
-   \[?\] Chỉnh sửa hồ sơ của chính mình.
-   \[?\] Bảo vệ quyền chỉnh sửa hồ sơ.
-   \[?\] Upload và thay avatar.
-   \[?\] Tối ưu avatar.
-   \[?\] Follow user.
-   \[?\] Unfollow user có xác nhận.
-   \[?\] Danh sách follower.
-   \[?\] Danh sách following.
-   \[?\] Hiển thị số lượng follower/following.
-   \[?\] Block user.
-   \[?\] Danh sách blocked users.
-   \[?\] Unblock user.
-   \[?\] Áp dụng đúng ảnh hưởng của block đối với chat sau khi chiều
    chặn được xác nhận.

## 18.4. Listing

-   \[?\] Tạo listing.
-   \[?\] Xem danh sách listing.
-   \[?\] Xem chi tiết listing.
-   \[?\] Chỉnh sửa listing trước khi có chat interaction.
-   \[?\] Follow listing không khóa quyền sửa.
-   \[?\] Cảnh báo khi sửa listing đã có người chat.
-   \[?\] Hủy chỉnh sửa không làm thay đổi dữ liệu.
-   \[?\] Xác nhận chỉnh sửa và cập nhật dữ liệu.
-   \[?\] Gửi notification cho conversation liên quan khi sửa thành
    công.
-   \[?\] Cập nhật `createdAt`/`updatedAt` đúng ý nghĩa.
-   \[?\] Quản lý bốn trạng thái listing.
-   \[?\] Ẩn listing.
-   \[?\] Khôi phục listing theo quyền chủ sở hữu.
-   \[?\] Đánh dấu listing không còn khả dụng.
-   \[?\] Soft-delete listing.
-   \[?\] Kiểm tra ownership ở Backend.
-   \[?\] Không cho tạo chat mới từ listing không còn khả dụng/đã ẩn/đã
    xóa.
-   \[?\] Giữ chat cũ sau khi listing thay đổi trạng thái.

## 18.5. Media

-   \[?\] Upload tối đa 5 ảnh cho listing.
-   \[?\] Giới hạn tối đa 1 video cho listing.
-   \[?\] Kiểm tra file upload ở Backend.
-   \[?\] Tối ưu ảnh.
-   \[?\] Preview media trước khi đăng.
-   \[?\] Thay thế media.
-   \[?\] Sắp xếp thứ tự media.
-   \[?\] Xóa media.
-   \[?\] Lưu media local trong môi trường Đồ án 1.
-   \[?\] Tổ chức StorageService abstraction.
-   \[?\] Xác nhận và triển khai giới hạn video sau khi thông số được
    chốt.

## 18.6. Search / Filtering / Feed

-   \[?\] Tìm kiếm theo tiêu đề listing.
-   \[?\] Hỗ trợ tìm kiếm tiếng Việt.
-   \[?\] Gợi ý khi đang nhập.
-   \[?\] Lọc loại giao dịch.
-   \[?\] Lọc giá phù hợp loại giao dịch/đơn vị.
-   \[?\] Lọc địa điểm.
-   \[?\] Lọc thời gian đăng.
-   \[?\] Sắp xếp mới nhất/cũ nhất.
-   \[?\] Sắp xếp giá thấp-cao/cao-thấp theo đơn vị phù hợp.
-   \[?\] Infinite Scroll.
-   \[?\] Feed listing từ người đang follow trong 3 ngày gần nhất.
-   \[?\] Feed listing mới nhất từ những người còn lại.
-   \[?\] Hoàn thiện số lượng N và quy tắc feed sau khi được xác nhận.

## 18.7. Chat

-   \[?\] Tạo/mở conversation theo cặp người dùng.
-   \[?\] Bảo đảm một conversation duy nhất cho một cặp.
-   \[?\] Chat bắt đầu từ listing.
-   \[?\] Chat tự do không gắn listing.
-   \[?\] Một conversation liên kết được nhiều listing.
-   \[?\] Một listing có thể liên quan đến nhiều conversation.
-   \[?\] Gửi/nhận message realtime.
-   \[?\] Lưu message bền vững trong database.
-   \[?\] Trạng thái sent.
-   \[?\] Trạng thái delivered.
-   \[?\] Trạng thái read.
-   \[?\] Kiểm tra quyền truy cập conversation.
-   \[?\] Ẩn conversation riêng theo từng người dùng.
-   \[?\] Conversation xuất hiện lại khi có tin nhắn mới.
-   \[?\] Chat cũ tiếp tục hoạt động khi listing bị ẩn/xóa/không còn khả
    dụng.
-   \[?\] Không hiển thị online/typing.
-   \[?\] Không triển khai thu hồi/xóa message đã gửi.
-   \[?\] Áp dụng block theo quyết định cuối cùng.

## 18.8. Notification

-   \[?\] Lưu notification trong database.
-   \[?\] Cập nhật realtime.
-   \[?\] Biểu tượng và số lượng chưa đọc cho chat.
-   \[?\] Không preview nội dung tin nhắn.
-   \[?\] Đánh dấu từng notification đã đọc.
-   \[?\] Đánh dấu tất cả đã đọc.
-   \[?\] Xóa notification riêng lẻ.
-   \[?\] Notification center giữ bản ghi sau khi toast tự đóng.
-   \[?\] Click notification tin nhắn mở conversation.
-   \[?\] Click notification listing edited mở listing detail.
-   \[?\] Notification đã đọc vẫn điều hướng được.
-   \[?\] Không tạo notification follow/unfollow user.
-   \[?\] Không tạo notification block/unblock user.
-   \[?\] Không triển khai Push Notification.

## 18.9. Reminder

-   \[?\] Kiểm tra reminder khi bắt đầu phiên sử dụng.
-   \[?\] Chỉ nhắc thông tin tùy chọn thực sự hữu ích.
-   \[?\] Không nhắc địa điểm như trường tùy chọn.
-   \[?\] Không mặc định nhắc avatar/bio.
-   \[?\] Có thể bỏ qua/đóng reminder.
-   \[?\] Không nhắc lại trong cùng phiên sau khi bỏ qua.
-   \[?\] Có thể nhắc lại ở phiên tiếp theo nếu điều kiện vẫn còn.
-   \[?\] Điều hướng đến phần chỉnh sửa hồ sơ.
-   \[?\] Không chặn chức năng khác.

## 18.10. Authorization / Validation / Error Handling

-   \[?\] Guest xem listing công khai.
-   \[?\] Guest tìm kiếm/lọc listing công khai.
-   \[?\] Guest xem chi tiết listing.
-   \[?\] Guest bị yêu cầu đăng nhập khi tương tác.
-   \[?\] Backend bảo vệ endpoint yêu cầu đăng nhập.
-   \[?\] Backend kiểm tra ownership listing.
-   \[?\] Backend kiểm tra ownership profile.
-   \[?\] Backend kiểm tra quyền conversation.
-   \[?\] Frontend validation hiển thị sớm.
-   \[?\] Backend validation độc lập.
-   \[?\] Response validation thống nhất.
-   \[?\] Error handling tập trung.
-   \[?\] Frontend phân biệt lỗi validation/nghiệp vụ/mạng/hệ thống.
-   \[?\] Không trả stack trace hoặc secret cho client.

## 18.11. Logging / Testing

-   \[?\] Logger dùng chung.
-   \[?\] HTTP request logging.
-   \[?\] Redact dữ liệu nhạy cảm khỏi log.
-   \[?\] Unit test cho logic quan trọng.
-   \[?\] Integration test cho các luồng phối hợp.
-   \[?\] API test bằng Supertest.
-   \[?\] Coverage report.
-   \[?\] Cấu hình test database an toàn.
-   \[?\] Postman dùng cho kiểm tra thủ công khi cần.
-   \[?\] Kiểm thử các luồng nghiệp vụ chính trước khi bàn giao.

------------------------------------------------------------------------

# 19. Tiêu chí hoàn thành Đồ án 1

Không đánh giá dự án hoàn thành chỉ dựa trên việc các màn hình đã xuất
hiện hoặc server chạy được.

Một nhóm chức năng chỉ được xem là hoàn thành khi:

1.  Đúng nghiệp vụ đã thống nhất trong tài liệu.
2.  Có xử lý các trường hợp lỗi và điều kiện quan trọng của chức năng.
3.  Backend có validation và authorization phù hợp.
4.  Dữ liệu được lưu/truy vấn đúng theo nghiệp vụ.
5.  Frontend phản hồi đúng trạng thái thành công/thất bại.
6.  Các luồng liên quan giữa module hoạt động đúng.
7.  Có kiểm thử phù hợp và kết quả đã được xác minh.
8.  Tài liệu và checklist được cập nhật.

Đồ án 1 được xem là đạt phạm vi khi các chức năng cốt lõi đã thống nhất
được triển khai, kiểm thử và không còn sai khác nghiêm trọng so với yêu
cầu.

------------------------------------------------------------------------

# 20. Lịch sử cập nhật tài liệu

  -----------------------------------------------------------------------
  Ngày                                Nội dung
  ----------------------------------- -----------------------------------
  2026-11-06                          Tạo bản đặc tả nghiệp vụ Đồ án 1 từ
                                      các quyết định đã thống nhất trong
                                      quá trình phân tích Looply.

  -----------------------------------------------------------------------

Khi thay đổi nghiệp vụ, bổ sung dòng mới ghi rõ ngày và nội dung thay
đổi. Không âm thầm sửa một quyết định quan trọng mà không ghi nhận.

------------------------------------------------------------------------

## Chỉ dẫn cuối cùng cho AI Agent

**Tài liệu này là nguồn tham chiếu nghiệp vụ của Looply Đồ án 1.**

Khi được giao một công việc:

1.  Xác định module và checklist liên quan.
2.  Đọc yêu cầu tương ứng trong tài liệu.
3.  Kiểm tra source code và cấu hình hiện có.
4.  Xác định các điểm chưa chốt có ảnh hưởng trực tiếp.
5.  Thực hiện từng bước nhỏ, không tự mở rộng phạm vi.
6.  Kiểm tra kết quả bằng test phù hợp.
7.  Cập nhật checklist trung thực theo bằng chứng.
8.  Nếu có quyết định nghiệp vụ mới, cập nhật tài liệu sau khi người
    dùng xác nhận.

**Không tự sáng tạo nghiệp vụ. Không tự mở rộng phạm vi Đồ án 1. Không
đánh dấu hoàn thành khi chưa kiểm chứng.**
