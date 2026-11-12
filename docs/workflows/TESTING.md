# TESTING — Kiểm thử

## Đầu vào
- Mã nguồn và các bài test từ `IMPLEMENTATION.md`.
- Yêu cầu, tiêu chí chấp nhận từ ANALYSIS và phương án từ DESIGN.

## Nhiệm vụ của AI Agent
1. Chạy kiểm tra kiểu dữ liệu, lint, build và các bài test phù hợp với phần thay đổi; ghi nhận lệnh và kết quả thực tế.
2. Kiểm thử unit cho quy tắc nghiệp vụ; integration cho API, database, xác thực và phân quyền; E2E cho luồng người dùng quan trọng khi áp dụng.
3. Kiểm tra cả trường hợp hợp lệ, không hợp lệ, lỗi, dữ liệu biên và quyền truy cập; không chỉ kiểm tra happy path.
4. Dùng mock/seed khi phù hợp, nhưng không thay thế integration test cần thiết bằng mock. Chỉ dùng database test riêng đã xác minh; không reset hoặc làm mất dữ liệu dev/prod.
5. Khi test thất bại, xác định nguyên nhân, sửa trong phạm vi thiết kế và chạy lại các bài kiểm tra liên quan. Nếu cần đổi yêu cầu/thiết kế, quay về bước tương ứng.

## Đầu ra
- Kết quả từng nhóm kiểm thử: đạt, không đạt hoặc chưa chạy (kèm lý do).
- Danh sách lỗi còn tồn tại và bằng chứng kiểm tra (lệnh, log tóm tắt).

## Điều kiện chuyển sang REVIEW
- Các kiểm tra bắt buộc của phần thay đổi đều đạt; không còn lỗi nghiêm trọng chưa xử lý.
- Không được báo "đã test thành công" nếu chưa thực sự chạy.
