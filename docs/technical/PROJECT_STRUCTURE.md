# PROJECT_STRUCTURE.md — Looply

> **Trạng thái:** Tài liệu định hướng cấu trúc và ranh giới module. **Chưa phải bản kiểm kê source code đã xác minh.**
>
> **Phạm vi:** Đồ án 1. Cập nhật theo repository thực tế trong quá trình triển khai.

## 1. Mục đích và nguyên tắc

Tài liệu này giúp người phát triển và AI Agent biết **code thuộc module nào**, module nào sở hữu quy tắc nghiệp vụ và khi nào cần cập nhật kiến trúc. Không dùng tài liệu này để khẳng định một thư mục, file, endpoint hay tính năng đã được triển khai nếu chưa kiểm tra repository.

- Phân chia module theo **trách nhiệm nghiệp vụ**, không theo từng trang giao diện.
- Controller/route xử lý giao tiếp HTTP; service thực thi nghiệp vụ; repository/data access tương tác dữ liệu nếu dự án đang dùng phân lớp này.
- Không tạo abstraction, interface, folder hoặc module chỉ để dự phòng.
- Module khác có thể gọi chức năng công khai của module sở hữu, nhưng không sao chép logic hoặc truy cập tùy tiện vào dữ liệu nội bộ của module đó.
- Phân quyền, xác thực và validation cuối cùng thuộc backend; frontend chỉ cải thiện trải nghiệm.
- Mọi quyết định mới cần phù hợp với [đặc tả Đồ án 1](../requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md).

## 2. Cấu trúc repository — mô hình tham chiếu

**Chưa kiểm kê trực tiếp repository tại máy người dùng.** Sơ đồ sau là **mô hình tham chiếu**, không phải kết quả chạy `tree`.

```text
looply/
├── .github/
│   ├── copilot-instructions.md      # Người dùng xác nhận đã có
│   ├── skills/                      # Người dùng xác nhận đang rỗng
│   └── workflows/                   # Người dùng xác nhận đang rỗng
├── AGENTS.md                        # Quy tắc chung cho AI Agent
├── README.md                        # Nếu có trong repository
├── backend/                         # Express.js + TypeScript
│   ├── package.json
│   ├── prisma/                      # Vị trí thực tế cần xác minh
│   └── src/
│       └── modules/                # Cấu trúc module đề xuất, chưa kiểm kê
│           ├── auth/
│           ├── user/
│           ├── listing/
│           ├── media/
│           ├── chat/
│           ├── notification/
│           └── reminder/
├── frontend/                        # Angular + TypeScript
└── docs/
    ├── requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md
    ├── technical/
    │   ├── PROJECT_STRUCTURE.md
    │   └── backend/BACKEND_PACKAGES.md
    └── progress/DEVELOPMENT_PROGRESS.md  # Dự kiến tạo sau
```

**Lưu ý:** `AGENTS.md`, `README.md`, các file trong `docs/` và cấu trúc bên trong `backend/`, `frontend/` chỉ được đánh dấu “đã có” sau khi kiểm tra thực tế. Không tự tạo toàn bộ sơ đồ trên bằng một lần scaffold.

## 3. Bản đồ trách nhiệm backend

| Module | Sở hữu | Không sở hữu |
| --- | --- | --- |
| `auth` | Đăng ký, đăng nhập, xác minh OTP, phiên/token, tích hợp đăng nhập Google, xác thực danh tính | Chỉnh sửa thông tin hồ sơ chung, đăng tin, hội thoại |
| `user` | Hồ sơ, avatar ở góc độ thông tin người dùng, vị trí hồ sơ, theo dõi người dùng, chặn/bỏ chặn | Lưu trữ file nhị phân, xác thực OTP, nội dung tin đăng |
| `listing` | Tạo/sửa/ẩn/khôi phục/xóa mềm tin, trạng thái tin, quy tắc tương tác, danh sách/chi tiết, tìm kiếm/lọc/feed | Quản lý file gốc, nội dung tin nhắn, vận chuyển thông báo |
| `media` | Nhận, kiểm tra, xử lý, lưu và xóa media theo quyền được cấp; giao diện lưu trữ trừu tượng | Quyết định nghiệp vụ ai được sửa tin, nội dung tin, tài khoản |
| `chat` | Conversation duy nhất giữa cặp user, liên kết tin đăng, tin nhắn, trạng thái gửi/nhận/đọc, realtime chat, ẩn hội thoại theo từng user | Quyền sửa tin đăng, gửi SMS/email xác minh, sở hữu notification center |
| `notification` | Lưu, gửi realtime và quản lý thông báo trong ứng dụng; đánh dấu đã đọc/xóa | Tự quyết mọi sự kiện nào phải thông báo, sở hữu nội dung chat |
| `reminder` | Đánh giá điều kiện nhắc bổ sung thông tin tùy chọn và trạng thái bỏ qua trong phiên | Bắt buộc hoàn thiện hồ sơ, xác minh tài khoản, gửi thông báo nghiệp vụ tùy tiện |

Bảng này là **ranh giới định hướng** dựa trên nghiệp vụ đã trao đổi. Cách chia file và public interface cụ thể chỉ chốt khi triển khai module.

### 3.1. `auth`

- Sở hữu quy trình xác minh số điện thoại, email khi nghiệp vụ yêu cầu; đăng nhập username/password, phone/OTP và Google theo đặc tả.
- Có thể cần đọc thông tin định danh của user; không tự quản lý các trường hồ sơ không liên quan xác thực.
- Phân biệt tài khoản nội bộ và Google; không tự động liên kết danh tính khi chưa có quyết định nghiệp vụ.

### 3.2. `user`

- Sở hữu thông tin hồ sơ và các quan hệ follow/block giữa người dùng.
- Vị trí hồ sơ dùng làm giá trị gợi ý khi tạo listing; cập nhật hồ sơ **không** thay đổi listing cũ.
- Việc lưu file avatar giao cho `media` nếu phù hợp; `user` vẫn sở hữu hành động thay avatar và liên kết avatar với hồ sơ.
- Quy tắc block ảnh hưởng chat cần được thực thi ở luồng chat, dựa trên thông tin/quy tắc từ user; không nhân bản bảng block.

### 3.3. `listing`

- Sở hữu tin đăng và các trạng thái của tin; kiểm tra chủ sở hữu khi sửa/xóa/ẩn/khôi phục.
- Kiểm tra lịch sử tương tác chat trước khi sửa theo quy tắc đã chốt; không tự lưu bản sao conversation.
- Khi sửa thành công và cần thông báo, xác định sự kiện nghiệp vụ; việc phân phối và quản lý thông báo thuộc `notification`.
- Xử lý search/filter/sort/feed trong phạm vi Đồ án 1. **Chưa có module `category`** ở giai đoạn này.
- Media gắn với listing được quản lý theo phối hợp giữa `listing` (quy tắc số lượng/quyền) và `media` (xử lý file).

### 3.4. `media`

- Xử lý upload, xác thực loại/kích thước, tối ưu ảnh, lưu trữ file và metadata cần thiết.
- Đồ án 1 định hướng lưu local, nhưng cô lập phần lưu trữ để có thể chuyển sang dịch vụ khác sau này.
- Không cho phép client tự chỉ định đường dẫn tùy ý hoặc xóa media của đối tượng không sở hữu.
- Giới hạn video cuối cùng và quy trình xử lý chi tiết vẫn phải đối chiếu đặc tả trước khi triển khai.

### 3.5. `chat`

- **Một cặp user chỉ có một conversation**, bất kể bắt đầu từ tin đăng hay free chat.
- Một conversation có thể liên quan nhiều listing; không thiết kế quan hệ conversation = một listing.
- Tin đã ẩn/xóa/không khả dụng không cho **bắt đầu chat mới từ tin đó**, nhưng conversation cũ vẫn hoạt động theo nghiệp vụ.
- Kiểm tra membership và block ở backend, kể cả kết nối realtime.
- Chat notification hiển thị biểu tượng/số chưa đọc, không mặc định xem trước nội dung.

### 3.6. `notification`

- Cung cấp cơ chế lưu thông báo, đếm chưa đọc, đánh dấu từng cái/tất cả đã đọc, xóa và điều hướng theo loại sự kiện.
- Module phát sinh sự kiện quyết định **khi nào** cần thông báo theo đặc tả; `notification` xử lý **cách lưu/phát/đọc**.
- Không tự phát thông báo follow/unfollow/block/unblock nếu nghiệp vụ không yêu cầu.
- Toast tạm thời và bản ghi notification center là hai cách hiển thị khác nhau.

### 3.7. `reminder`

- Chỉ nhắc những thông tin hồ sơ **tùy chọn và thực sự có ích**, không cản trở sử dụng.
- Đánh giá khi bắt đầu phiên theo định nghĩa sẽ chốt lúc triển khai.
- Bỏ qua trong phiên hiện tại; phiên sau có thể kiểm tra lại.
- Không mặc định phải có cron/background job.

## 4. Phối hợp giữa các module — ví dụ

### 4.1. Tạo tin đăng

1. `auth`/middleware xác định người dùng đã đăng nhập.
2. `listing` xác minh dữ liệu nghiệp vụ và quyền tạo tin.
3. `user` cung cấp vị trí hồ sơ làm giá trị gợi ý nếu cần; vị trí được lưu độc lập trong listing.
4. `media` xử lý các file được phép đính kèm.
5. `listing` lưu tin và liên kết media, bảo đảm tính nhất quán dữ liệu.

### 4.2. Bắt đầu chat từ tin đăng

1. `chat` nhận yêu cầu, xác minh user và trạng thái block.
2. `listing` xác nhận tin còn cho phép khởi tạo chat mới.
3. `chat` tìm conversation đã có giữa hai user; chỉ tạo mới nếu chưa tồn tại.
4. `chat` liên kết listing vào conversation theo mô hình đã thống nhất, không tạo conversation trùng.

### 4.3. Chỉnh sửa tin đã có tương tác

1. `listing` kiểm tra quyền và tình trạng có chat liên quan.
2. Frontend hiển thị cảnh báo/xác nhận khi nghiệp vụ yêu cầu.
3. Chỉ sau khi người dùng xác nhận và backend cập nhật thành công mới phát sinh sự kiện chỉnh sửa.
4. `notification` lưu/phát thông báo đến những user có conversation liên quan theo đặc tả; không gửi tới follower chỉ vì follow.

Các luồng trên là **mô hình nghiệp vụ**, không phải hợp đồng API hoặc thiết kế transaction đã chốt.

## 5. Tổ chức file bên trong module

Không áp đặt một bộ file cố định cho tất cả module. Khi module đủ phức tạp, có thể cân nhắc:

```text
<module>/
├── <module>.routes.ts       # Định tuyến HTTP (nếu có)
├── <module>.controller.ts   # Chuyển HTTP request/response
├── <module>.service.ts      # Nghiệp vụ
├── <module>.repository.ts   # Truy cập dữ liệu nếu cần
├── <module>.schema.ts       # Validation nếu cần
└── ...                      # File theo đúng nhu cầu thực tế
```

Đây **chỉ là ví dụ**, không phải yêu cầu phải tạo đầy đủ file. Socket handlers, rules, types, tests và thư mục con được bổ sung khi có lý do cụ thể. Tên file thực tế phải nhất quán với source code hiện có.

## 6. Frontend Angular

- Chưa xác minh cấu trúc Angular hiện tại; không tự giả định đang dùng `core/`, `shared/`, `features/` hay mô hình state management cụ thể.
- Component tập trung UI và tương tác; service quản lý giao tiếp API và logic dùng chung phù hợp.
- Các tính năng guest xem được phải hoạt động không cần đăng nhập; tương tác được bảo vệ phải có trải nghiệm điều hướng đăng nhập và kiểm tra backend.
- Chỉ thiết kế cấu trúc theo feature khi triển khai các màn hình thực tế; tránh sao chép nguyên cấu trúc backend sang frontend một cách máy móc.

## 7. Thành phần dùng chung và hạ tầng

Những nhu cầu có thể phát sinh: cấu hình môi trường, kết nối Prisma, error handler, logging, auth middleware, validation helper, realtime gateway, upload storage adapter, test utilities.

**Không mặc định tạo tất cả ngay.** Khi cần:

1. Kiểm tra thành phần tương đương đã tồn tại chưa.
2. Đặt ở vị trí dùng chung nếu thật sự được nhiều module sử dụng.
3. Tránh biến thư mục dùng chung thành nơi chứa logic nghiệp vụ không rõ chủ sở hữu.
4. Không để module phụ thuộc vòng vào nhau; cân nhắc service contract hoặc điều phối ở tầng phù hợp khi phát sinh nhu cầu.

## 8. Quy tắc thay đổi cấu trúc

Trước khi thêm module/thư mục mới, AI Agent phải:

1. Xác định nghiệp vụ đang cần và module hiện tại có sở hữu không.
2. Đọc cấu trúc repository thực tế và các file liên quan.
3. Giải thích vì sao không thể đặt hợp lý trong module hiện tại.
4. Nếu thay đổi ranh giới module hoặc ảnh hưởng kiến trúc lớn, hỏi người dùng trước.
5. Chỉ tạo file/thư mục cần thiết cho tác vụ hiện tại.
6. Sau khi triển khai, cập nhật tài liệu này với đường dẫn **đã xác minh** và ghi lại thay đổi quan trọng.

Không tự tạo module `admin`, `payment`, `recommendation`, `category` hoặc các module tương lai trong Đồ án 1 khi chưa được yêu cầu.

## 9. Kiểm kê hiện trạng — cần thực hiện

Để chuyển tài liệu này từ **mô hình tham chiếu** sang **bản đồ code thực tế**, cần lấy kết quả lệnh sau tại thư mục gốc trên máy phát triển:

```powershell
cd E:\DO-AN\looply
Get-ChildItem -Force | Select-Object Name, Mode
Get-ChildItem backend -Recurse -Directory | Select-Object FullName
Get-ChildItem frontend -Directory | Select-Object FullName
```

Có thể giới hạn độ sâu khi dự án có `node_modules`, `.angular`, `dist` hoặc thư mục build lớn; **không đưa các thư mục sinh tự động vào sơ đồ kiến trúc**. Sau khi có dữ liệu thực tế, cập nhật:

- Cấu trúc thực có, phân biệt với dự kiến.
- Những module/file đã tồn tại và trách nhiệm đã triển khai.
- Vị trí Prisma schema/migrations, bootstrap, routes, middleware, frontend feature.
- Các phụ thuộc chéo cần điều chỉnh khi có bằng chứng.

## 10. Quan hệ với các tài liệu khác

- [`AGENTS.md`](../../AGENTS.md): cách AI Agent làm việc.
- [`LOOPLY_DOAN1_REQUIREMENTS.md`](../requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md): **nghiệp vụ và phạm vi**.
- [`BACKEND_PACKAGES.md`](backend/BACKEND_PACKAGES.md): package backend và mục đích.
- `docs/progress/DEVELOPMENT_PROGRESS.md`: **tiến độ thực tế** (khi được tạo).

**Nguyên tắc cuối:** Tài liệu cấu trúc phải đi theo code đã được kiểm chứng, không ép code chạy theo một sơ đồ giả định.
