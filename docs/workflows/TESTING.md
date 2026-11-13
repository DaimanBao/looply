# TESTING — Kiểm thử

## Đầu vào
- Mã nguồn và các bài test từ `IMPLEMENTATION.md`.
- Yêu cầu, tiêu chí chấp nhận từ ANALYSIS và phương án từ DESIGN.

## Risk-Based Targeted Testing

- Chọn phạm vi từ diff, tiêu chí chấp nhận và dependency có nguy cơ bị ảnh hưởng. Chỉ chạy test chức năng thay đổi và các dependency có rủi ro regression; không mặc định full suite local.
- Mở rộng phạm vi khi sửa phần dùng chung, contract/schema, cấu hình có ảnh hưởng rộng, phát hiện lỗi lan truyền hoặc chưa xác định được ảnh hưởng; nêu ngắn lý do kỹ thuật. Full suite chỉ khi rủi ro hoặc yêu cầu cụ thể đòi hỏi.
- Không chạy lại test đã PASS trên cùng code, test, cấu hình và môi trường liên quan nếu không có bằng chứng mới. Sau sửa lỗi, chạy lại test thất bại và các kiểm tra có thể bị ảnh hưởng; giữ kết quả còn hiệu lực giữa IMPLEMENTATION, TESTING, REVIEW và COMPLETION.
- Tận dụng CI đã PASS cho đúng commit và phạm vi cần kiểm chứng; không lặp full suite local nếu CI đã bao phủ. CI đang chờ, thất bại, commit cũ hoặc không bao phủ rủi ro không được tính là bằng chứng đạt.
- Khi sửa lỗi, bổ sung regression test tái hiện lỗi và chạy targeted tests liên quan.
- Documentation-only: kiểm tra Markdown, liên kết liên quan và `git diff --check`; không chạy unit/integration/API tests hoặc build. Thay đổi contract/nội dung thực thi trong tài liệu cần kiểm tra đặc tả/nội dung tương ứng.
- Thuần formatting/comment: review diff và `git diff --check`, không chạy riêng unit/integration/E2E Backend hoặc regression tests. Tách template/style Angular: chạy build một lần và targeted tests của component bị ảnh hưởng theo [Code Formatting](../standards/CODE_FORMATTING.md); chỉ mở rộng khi có lỗi hoặc rủi ro thực tế.

## Nhiệm vụ của AI Agent
1. Chọn kiểm tra kiểu dữ liệu, lint, build, runtime/API và test theo loại thay đổi và rủi ro; không mặc định chạy tất cả. Dùng lệnh đã có, không thay đổi dependencies/CI để phục vụ việc chọn test. Ghi nhận lệnh và kết quả thực tế.
2. Kiểm thử unit cho quy tắc nghiệp vụ; integration cho API, database, xác thực và phân quyền; E2E cho luồng người dùng quan trọng khi áp dụng.
3. Kiểm tra cả trường hợp hợp lệ, không hợp lệ, lỗi, dữ liệu biên và quyền truy cập; không chỉ kiểm tra happy path.
   Không bỏ qua kiểm thử bảo mật, phân quyền, transaction hoặc data integrity cần thiết; kiểm tra rollback, ràng buộc dữ liệu và thao tác đồng thời khi có rủi ro.
4. Dùng mock/seed khi phù hợp, nhưng không thay thế integration test cần thiết bằng mock. Chỉ dùng database test riêng đã xác minh; không reset hoặc làm mất dữ liệu dev/prod.
5. Khi test thất bại, xác định nguyên nhân, sửa trong phạm vi thiết kế và chạy lại các bài kiểm tra liên quan. Nếu cần đổi yêu cầu/thiết kế, quay về bước tương ứng.

## Đầu ra
- Kết quả từng nhóm kiểm thử: đạt, không đạt hoặc chưa chạy (kèm lý do).
- Danh sách lỗi còn tồn tại và bằng chứng kiểm tra (lệnh, log tóm tắt; commit/link khi dùng CI). Có thể tổng hợp trong PR/bàn giao cuối, không cần báo cáo riêng.

## Điều kiện chuyển sang REVIEW
- Các kiểm tra bắt buộc của phần thay đổi đều đạt; không còn lỗi nghiêm trọng chưa xử lý.
- Không được báo "đã test thành công" nếu chưa thực sự chạy.
