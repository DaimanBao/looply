# AGENTS.md — Looply

> Quy tắc làm việc cho AI coding agents trong repository Looply. File này hướng dẫn **cách làm việc**, không thay thế đặc tả nghiệp vụ.

## 1. Mục tiêu

Looply là nền tảng đăng tin giao dịch đồ đã qua sử dụng. Giai đoạn hiện tại là **Đồ án 1**. Phát triển từng bước nhỏ, có kiểm chứng, giữ khả năng mở rộng mà không triển khai sớm các chức năng tương lai.

Ưu tiên: đúng nghiệp vụ → an toàn và ổn định → dễ bảo trì → đơn giản → tiến độ thực tế.

## 2. Đọc tài liệu trước khi làm

Đọc những file liên quan **nếu tồn tại**:

| File | Nguồn thông tin |
| --- | --- |
| `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md` | Nghiệp vụ và phạm vi Đồ án 1 |
| `docs/technical/PROJECT_STRUCTURE.md` | Cấu trúc, trách nhiệm và ranh giới module |
| `docs/technical/backend/BACKEND_PACKAGES.md` | Vai trò các package backend |
| `docs/progress/DEVELOPMENT_PROGRESS.md` | Tiến độ đã được xác nhận |
| `README.md` | Tổng quan và cách chạy |
| `backend/package.json`, `frontend/package.json`, cấu hình, migration, source và test | Hiện trạng kỹ thuật thực tế |

Không giả định những file được liệt kê đều đã tồn tại. Đọc đúng phần liên quan, không cần tải toàn bộ tài liệu cho mỗi việc nhỏ.

**Thứ tự xử lý mâu thuẫn:** yêu cầu mới, rõ ràng của người dùng → đặc tả đã chốt về hành vi mong muốn → hiện trạng code/test về những gì đã thực hiện. Khi yêu cầu mới thay đổi quyết định cũ hoặc các nguồn mâu thuẫn, nêu rõ và xác nhận trước khi sửa nghiệp vụ quan trọng. Tài liệu tiến độ không thay thế kiểm tra code.

## 3. Phạm vi và công nghệ

- Chỉ triển khai **Đồ án 1** trừ khi người dùng yêu cầu khác. Không tự thêm Admin, thanh toán, AI recommendation hay chức năng của Đồ án 2.
- Backend: **Express.js + TypeScript**; frontend: **Angular + TypeScript**; database: **PostgreSQL**; ORM: **Prisma 7** (kiểm tra phiên bản thực tế).
- Không tự đổi framework, ORM, database, package manager, kiến trúc monorepo hoặc nâng/hạ package.
- Chỉ thêm dependency khi tác vụ hiện tại thực sự cần và sau khi kiểm tra package đang có; nêu lý do và xin xác nhận nếu ảnh hưởng đáng kể.
- Package đã cài **không đồng nghĩa** tính năng đã triển khai.
- Phân biệt quyết định **đã chốt**, **đang đề xuất** và **chưa chốt**. Không tự biến giả định thành yêu cầu chính thức.

## 4. Quy trình cho mỗi tác vụ

### 4.1. Hiểu và kiểm tra
1. Xác định mục tiêu, tiêu chí hoàn thành và phạm vi.
2. Đọc nghiệp vụ liên quan; kiểm tra source, schema, API, test và cấu hình hiện có.
3. Xác định tác động tới module khác, dữ liệu, bảo mật và tương thích.

### 4.2. Phân tích vừa đủ
1. Đề xuất phương án đơn giản nhất phù hợp hiện trạng.
2. Hỏi trước khi thay đổi nghiệp vụ đã chốt, public API, schema có nguy cơ phá vỡ tương thích, kiến trúc lớn hoặc cơ chế bảo mật quan trọng.
3. Với quyết định kỹ thuật nhỏ, chọn hợp lý và giải thích ngắn gọn; không lập kế hoạch toàn bộ hệ thống trước.

### 4.3. Triển khai
1. Thay đổi nhỏ, tập trung đúng tác vụ; không refactor ngoài phạm vi.
2. Giữ module đúng trách nhiệm; không nhồi nghiệp vụ vào controller hoặc giao diện.
3. Giữ TypeScript type-safe; tránh lạm dụng `any`, `@ts-ignore`, ép kiểu thiếu kiểm chứng.
4. Không thêm code giả, placeholder được mô tả như tính năng đã hoạt động.
5. Không tự commit, push, merge, tạo PR hoặc deploy khi chưa được yêu cầu.

### 4.4. Kiểm chứng
1. Kiểm tra scripts thực tế trước khi chạy lệnh.
2. Chạy typecheck, test, lint, build hoặc kiểm tra thủ công phù hợp với thay đổi và môi trường.
3. Bổ sung/cập nhật test khi sửa nghiệp vụ; xét cả thành công, thất bại và phân quyền.
4. Không tuyên bố đã test nếu chưa chạy. Nếu thiếu database, network, secret hoặc môi trường, nêu giới hạn cụ thể.

### 4.5. Đồng bộ và báo cáo
1. Tóm tắt file đã thay đổi, hành vi mới, kết quả kiểm chứng và phần chưa hoàn tất.
2. Cập nhật tài liệu kỹ thuật khi kiến trúc, cấu trúc hoặc package thực sự thay đổi.
3. Cập nhật `DEVELOPMENT_PROGRESS.md` dựa trên bằng chứng thực tế, không tự đánh dấu hoàn thành vì đã viết code nhưng chưa kiểm chứng.
4. Nếu tài liệu chưa tồn tại, nói rõ; không giả vờ đã cập nhật.

## 5. Nguyên tắc kiến trúc

- Mỗi module sở hữu nghiệp vụ thuộc trách nhiệm của mình; tôn trọng ranh giới module.
- Backend luôn xác thực dữ liệu, quyền sở hữu, quyền tham gia conversation và quy tắc nghiệp vụ; frontend validation chỉ hỗ trợ trải nghiệm.
- Tái sử dụng logic phù hợp, tránh trùng lặp; không tạo abstraction phức tạp khi chưa cần.
- Giữ API, response lỗi và kiểu dữ liệu nhất quán.
- Khi thay đổi database/migration, đánh giá dữ liệu cũ, tác động tương thích và khả năng phục hồi; không reset database tùy tiện.
- Không thay đổi quyết định cũ chỉ vì một phương án mới có vẻ hấp dẫn hơn.

## 6. Bảo mật

- Không log, commit hoặc hiển thị mật khẩu, OTP, token, API key, secret hay connection string nhạy cảm.
- Không hardcode secret; dùng biến môi trường và placeholder trong tài liệu.
- Không chạy thao tác phá hủy (reset/drop database, xóa volume, force push, xóa dữ liệu) khi chưa có sự chấp thuận rõ ràng.
- Backend phải validate input; dùng Prisma/parameterized queries thay vì ghép SQL từ input.
- Bảo vệ endpoint và Socket.IO bằng xác thực và phân quyền phía server.
- Upload cần kiểm tra định dạng, kích thước, quyền và nội dung phù hợp; không tin hoàn toàn tên file/MIME do client khai báo.
- Không tự gửi dữ liệu dự án hoặc dữ liệu người dùng đến dịch vụ ngoài.

## 7. Các điểm nghiệp vụ cần đặc biệt chú ý

> Đây là lời nhắc, **không thay thế** file requirements.

- Guest chỉ được duyệt, tìm kiếm/lọc và xem chi tiết tin; các tương tác cần đăng nhập.
- Vị trí hồ sơ bắt buộc khi đăng ký; thay đổi vị trí hồ sơ không tự sửa vị trí tin đăng cũ.
- **Một cặp user có một conversation**, có thể liên quan nhiều tin đăng; không tạo một conversation cho mỗi tin.
- Tin ẩn/không còn khả dụng/đã soft-delete không được khởi tạo chat mới từ tin; cuộc trò chuyện cũ vẫn được giữ theo quy tắc đã chốt.
- Sửa tin đã có chat cần cảnh báo/xác nhận và xử lý thông báo đúng đối tượng.
- Không mặc định thông báo cho mọi hành động follow, block hay chỉnh sửa profile.
- Không có trang Admin trong Đồ án 1.
- Thời lượng video chính xác, N của feed, chi tiết OTP và những điểm còn mở phải được kiểm tra trước khi chốt triển khai.

## 8. Giao tiếp với người dùng

- Dùng **tiếng Việt**, rõ ràng, thực tế, từng bước; tránh giải thích dài không phục vụ tác vụ.
- Khi hướng dẫn lệnh, dựa vào hệ điều hành, terminal và cấu hình thực tế.
- Nêu rõ điều gì đã làm, đang đề xuất, chưa xác minh hoặc cần người dùng quyết định.
- Khi có lỗi, đọc lỗi và kiểm tra hiện trạng trước; không đề nghị cài lại/làm lại toàn bộ một cách phản xạ.
- Không tuyên bố “đã sửa”, “đã chạy”, “đã test”, “đã commit” khi chưa thực sự làm.

## 9. Định nghĩa hoàn thành

Một tác vụ chỉ được đánh dấu hoàn thành khi đáp ứng yêu cầu đã chốt, thay đổi được tích hợp đúng vị trí, kiểm chứng khả thi đã chạy, kết quả được báo trung thực và tài liệu/tiến độ liên quan được đồng bộ. Nếu còn thiếu, ghi **hoàn thành một phần**, **chưa kiểm chứng** hoặc **đang bị chặn**.

---

**Nguyên tắc cốt lõi:** *Phân tích đủ cho bước hiện tại → code → kiểm chứng → cập nhật tài liệu → tiếp tục*. Giữ lại những quyết định đã chốt; chỉ thay đổi khi có lý do cụ thể và sự thống nhất của người dùng.
