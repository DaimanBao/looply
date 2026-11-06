# Looply — Development Progress (Đồ án 1)

> **Mục đích:** Theo dõi tiến độ triển khai **đã được kiểm chứng**. Đây không phải đặc tả nghiệp vụ và không thay thế việc kiểm tra source code.
>
> **Trạng thái khởi tạo:** Chưa đối chiếu repository thực tế. Các công việc bên dưới mặc định **Chưa xác minh**, không đồng nghĩa với **Chưa làm**.

## 1. Nguyên tắc cập nhật

- Chỉ đánh dấu **Hoàn thành** khi có bằng chứng cụ thể (đường dẫn code, migration, test, hoặc kết quả chạy).
- Phân biệt **Chưa xác minh** (chưa kiểm tra) với **Chưa bắt đầu** (đã xác nhận chưa triển khai).
- Không đánh dấu tính năng hoàn thành chỉ vì đã cài package, tạo file rỗng, hoặc mô tả trong tài liệu.
- Một chức năng có thể ở trạng thái **Đang thực hiện**, **Bị chặn**, hoặc **Cần kiểm thử**.
- Khi sửa trạng thái, ghi ngày, phạm vi, bằng chứng và phần còn lại. Không xóa lịch sử quyết định quan trọng.
- Đối chiếu với `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md` trước khi chốt phạm vi.

### Trạng thái chuẩn

| Trạng thái | Ý nghĩa |
| --- | --- |
| Chưa xác minh | Chưa kiểm tra hiện trạng source code/test |
| Chưa bắt đầu | Đã kiểm tra và xác nhận chưa triển khai |
| Đang thực hiện | Đã bắt đầu nhưng chưa đáp ứng đủ tiêu chí |
| Cần kiểm thử | Có code nhưng chưa kiểm chứng đầy đủ |
| Bị chặn | Không thể tiếp tục vì thiếu quyết định, dữ liệu hoặc môi trường |
| Hoàn thành | Đã triển khai, kiểm chứng và cập nhật tài liệu liên quan |

## 2. Tổng quan

| Hạng mục | Trạng thái | Bằng chứng / Ghi chú |
| --- | --- | --- |
| Thiết lập repository, backend, frontend | Chưa xác minh | Cần kiểm tra cây thư mục và scripts |
| PostgreSQL / Prisma schema và migrations | Chưa xác minh | Cần kiểm tra cấu hình và migrations |
| Authentication | Chưa xác minh | Xem mục 3 |
| User / Profile | Chưa xác minh | Xem mục 3 |
| Listing | Chưa xác minh | Xem mục 3 |
| Media | Chưa xác minh | Xem mục 3 |
| Search / Filter / Feed | Chưa xác minh | Xem mục 3 |
| Chat realtime | Chưa xác minh | Xem mục 3 |
| Notification | Chưa xác minh | Xem mục 3 |
| Reminder | Chưa xác minh | Xem mục 3 |
| Authorization / Security | Chưa xác minh | Xem mục 3 |
| Test / Build / CI | Chưa xác minh | Cần chạy kiểm tra tương ứng |

## 3. Theo dõi theo nhóm chức năng

> Các mục dưới đây là **danh mục cần đối chiếu**, không phải xác nhận đã triển khai. Chi tiết nghiệp vụ và ngoại lệ nằm trong tài liệu requirements.

### 3.1. Nền tảng và môi trường

- [ ] Xác minh cấu trúc monorepo và cấu hình Git.
- [ ] Xác minh backend Express + TypeScript chạy được.
- [ ] Xác minh frontend Angular chạy được.
- [ ] Xác minh kết nối PostgreSQL.
- [ ] Xác minh Prisma 7, schema và migration.
- [ ] Xác minh cấu hình môi trường, logging và xử lý lỗi chung.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.2. Authentication (`auth`)

- [ ] Đăng ký username/password/email/phone và SMS OTP.
- [ ] Đăng nhập username + password.
- [ ] Đăng nhập phone + SMS OTP.
- [ ] Đăng nhập Google theo quy tắc tài khoản riêng.
- [ ] Xác thực phiên/token và đăng xuất (theo thiết kế được chốt khi triển khai).
- [ ] Kiểm thử validation, OTP, phân quyền và lỗi.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.3. User / Profile (`user`)

- [ ] Xem/chỉnh sửa hồ sơ và vị trí bắt buộc.
- [ ] Đổi email bằng email OTP, đổi phone bằng SMS OTP.
- [ ] Avatar.
- [ ] Follow/unfollow user và danh sách liên quan.
- [ ] Block/unblock user và danh sách block.
- [ ] Kiểm thử quyền chỉnh sửa và các trường hợp lỗi.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.4. Listing (`listing`)

- [ ] Tạo tin đăng với loại giao dịch sale/rent/exchange.
- [ ] Danh sách và chi tiết tin đăng.
- [ ] Chỉnh sửa tin đăng và xử lý cảnh báo sau khi có chat.
- [ ] Ẩn/khôi phục/đánh dấu không khả dụng/xóa mềm theo quy tắc.
- [ ] Vị trí tin đăng độc lập với thay đổi vị trí hồ sơ.
- [ ] Quyền owner, trạng thái và các trường hợp lỗi.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.5. Media (`media`)

- [ ] Upload và quản lý tối đa 5 ảnh + 1 video theo đặc tả.
- [ ] Xem trước, thay thế, sắp xếp, xóa media.
- [ ] Tối ưu ảnh và kiểm tra upload phía server.
- [ ] Lưu trữ local với khả năng thay backend lưu trữ về sau.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.6. Search / Filter / Feed

- [ ] Tìm kiếm theo tiêu đề, hỗ trợ tiếng Việt.
- [ ] Autocomplete.
- [ ] Filter theo loại giao dịch, giá, vị trí, thời gian đăng.
- [ ] Sort theo thời gian và giá, xử lý đơn vị thuê hợp lý.
- [ ] Infinite scroll.
- [ ] Feed kết hợp tin từ người theo dõi và tin mới theo đặc tả.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.7. Chat (`chat`)

- [ ] Một conversation cho mỗi cặp user, hỗ trợ nhiều listing.
- [ ] Tạo/mở lại conversation từ listing và free chat.
- [ ] Nhắn tin realtime.
- [ ] Trạng thái sent/delivered/read.
- [ ] Ẩn conversation riêng từng user; tin mới làm hiện lại.
- [ ] Giữ chat cũ khi listing không còn khả dụng.
- [ ] Kiểm tra membership và quy tắc block.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.8. Notification (`notification`)

- [ ] Trung tâm thông báo trong ứng dụng.
- [ ] Badge số lượng chưa đọc cho chat, không preview nội dung.
- [ ] Đánh dấu đã đọc từng thông báo / tất cả.
- [ ] Xóa thông báo và điều hướng khi nhấn.
- [ ] Toast tự tắt nhưng thông báo lưu trong trung tâm.
- [ ] Thông báo cập nhật listing cho các user có conversation liên quan.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.9. Reminder (`reminder`)

- [ ] Kiểm tra thông tin tùy chọn thực sự cần nhắc ở đầu phiên.
- [ ] Dismiss trong phiên, kiểm tra lại ở phiên tiếp theo.
- [ ] Không chặn sử dụng và không nhắc mặc định các trường không cần thiết.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

### 3.10. Authorization, validation và chất lượng

- [ ] Guest chỉ duyệt/xem tin; thao tác khác yêu cầu đăng nhập.
- [ ] Card mời đăng nhập khi guest chọn chức năng được bảo vệ.
- [ ] Backend validation, ownership/membership checks.
- [ ] Error handling nhất quán và log không lộ secret.
- [ ] Unit/integration tests cho các luồng quan trọng.
- [ ] Build và kiểm tra hồi quy.

**Trạng thái:** Chưa xác minh  
**Bằng chứng:** Chưa thu thập.

## 4. Công việc đang thực hiện

| ID | Công việc | Module | Trạng thái | Người thực hiện | Bằng chứng / Vướng mắc |
| --- | --- | --- | --- | --- | --- |
| — | Chưa ghi nhận tác vụ đã xác minh | — | Chưa xác minh | — | Cần đối chiếu repository |

## 5. Nhật ký thay đổi tiến độ

| Ngày (YYYY-MM-DD) | Công việc | Thay đổi trạng thái | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| 2026-11-06 | Khởi tạo tài liệu tiến độ | Chưa xác minh | Chưa kiểm tra repository | Không suy diễn tiến độ từ mô tả dự án |

## 6. Quyết định còn mở / Vướng mắc

Chỉ ghi các quyết định ảnh hưởng đến công việc hiện tại; không cần chốt toàn bộ ngay:

| Chủ đề | Trạng thái | Khi nào cần chốt |
| --- | --- | --- |
| Chính sách OTP (hết hạn, giới hạn thử, gửi lại) | Chưa chốt | Trước khi triển khai OTP |
| Giới hạn thời lượng/dung lượng/định dạng video | Chưa chốt | Trước khi triển khai upload video |
| Số lượng N và cách ổn định feed | Chưa chốt | Trước khi triển khai feed |
| Chiều tác động của block đến chat | Cần xác nhận | Trước khi triển khai block/chat |
| Định nghĩa phiên cho reminder | Chưa chốt | Trước khi triển khai reminder |

## 7. Mẫu cập nhật sau mỗi tác vụ

```markdown
### [TASK-ID] Tên tác vụ
- Ngày: YYYY-MM-DD
- Trạng thái: Đang thực hiện / Cần kiểm thử / Bị chặn / Hoàn thành
- Phạm vi: module hoặc chức năng
- Thay đổi: file/API/schema liên quan
- Kiểm chứng: lệnh đã chạy và kết quả; nếu chưa chạy, ghi rõ lý do
- Bằng chứng: đường dẫn file, test, migration, PR/commit (nếu có)
- Còn lại: lỗi, giới hạn hoặc bước tiếp theo
- Tài liệu đã đồng bộ: ...
```

## 8. Cách AI Agent sử dụng tài liệu này

1. Đọc phần requirements liên quan và kiểm tra source code trước khi chọn trạng thái.
2. Khi bắt đầu tác vụ, ghi nhận công việc đang làm nếu đã xác định rõ phạm vi.
3. Sau khi code, chạy kiểm tra khả thi và ghi kết quả thật.
4. Chỉ chuyển sang **Hoàn thành** khi đáp ứng tiêu chí trong `AGENTS.md`.
5. Không tự động đánh dấu các checklist khác đã xong chỉ vì một module có file code.
6. Nếu phát hiện khác biệt giữa tài liệu và code, báo rõ và cập nhật sau khi thống nhất.

---

**Nguồn nghiệp vụ:** `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md`  
**Quy tắc AI Agent:** `AGENTS.md`  
**Cấu trúc kỹ thuật:** `docs/technical/PROJECT_STRUCTURE.md`
