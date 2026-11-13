# ANALYSIS — Phân tích yêu cầu

## Mục tiêu
Làm rõ **cần xây dựng gì** trước khi thiết kế hoặc viết code. Kết quả của giai đoạn này là đầu vào cho `DESIGN.md`.

## Đầu vào
Chỉ đọc đầu vào liên quan trực tiếp theo [Lean Development Workflow](DEVELOPMENT_WORKFLOW.md); dùng lại thông tin đã biết nếu chưa thay đổi.

- Yêu cầu người dùng và phạm vi Đồ án 1 trong `docs/PROJECT_OVERVIEW.md`.
- Quy tắc nghiệp vụ trong `docs/requirements/FUNCTIONAL_REQUIREMENTS.md` và tài liệu module liên quan.
- Trạng thái code, database và API hiện có (nếu có).

## AI Agent phải làm
1. Xác định mục tiêu, phạm vi và các chức năng thuộc yêu cầu đang xử lý; không tự mở rộng sang Đồ án 2.
2. Xác định tác nhân, luồng chính, trường hợp ngoại lệ, điều kiện đầu vào/đầu ra và quy tắc nghiệp vụ.
3. Kiểm tra các thành phần, API, dữ liệu và module liên quan để phát hiện phụ thuộc hoặc nguy cơ ảnh hưởng chức năng cũ.
4. Xác định yêu cầu về phân quyền, xác thực, kiểm tra dữ liệu và xử lý lỗi nếu có liên quan.
5. Đề xuất tiêu chí chấp nhận **có thể kiểm chứng** cho từng chức năng.
6. Nếu yêu cầu thiếu, mâu thuẫn hoặc chưa được quyết định: nêu rõ câu hỏi cần xác nhận; **không tự coi giả định là quyết định đã chốt**.

## Đầu ra bắt buộc
Xác định ngắn gọn các nội dung áp dụng dưới đây; có thể giữ trong ngữ cảnh làm việc, không cần báo cáo/file riêng khi yêu cầu đã rõ:
- **Mục tiêu & phạm vi:** làm gì, không làm gì.
- **Luồng nghiệp vụ:** luồng chính và ngoại lệ quan trọng.
- **Quy tắc & dữ liệu:** ràng buộc, quyền truy cập, dữ liệu cần xử lý.
- **Phụ thuộc & ảnh hưởng:** module, API, database, giao diện liên quan.
- **Tiêu chí chấp nhận:** điều kiện xác định chức năng hoàn thành.
- **Vấn đề cần xác nhận:** chỉ liệt kê khi thực sự còn điểm chưa rõ.

## Điều kiện chuyển sang DESIGN
- Yêu cầu quan trọng đã rõ và không mâu thuẫn với tài liệu được chốt.
- Có đủ luồng nghiệp vụ, ràng buộc và tiêu chí chấp nhận để thiết kế.
- Nếu còn quyết định quan trọng chưa rõ, dừng và yêu cầu xác nhận trước khi tiếp tục.

> Giai đoạn ANALYSIS **không viết code, không tự chọn công nghệ mới và không thay đổi yêu cầu đã thống nhất**. Chỉ cập nhật tài liệu yêu cầu khi thay đổi đã được xác nhận.
