# COMPLETION — Hoàn tất công việc

## Đầu vào
- Kết quả REVIEW, mã nguồn và kết quả kiểm thử cuối cùng.

## Nhiệm vụ của AI Agent
1. Đối chiếu lại phạm vi công việc và tiêu chí chấp nhận; xác nhận mục nào hoàn thành, chưa hoàn thành hoặc bị chặn.
2. Cập nhật đúng tài liệu liên quan nếu có thay đổi thực tế về chức năng, API, cấu trúc hoặc cách chạy; không sao chép nội dung giữa nhiều tài liệu.
3. Tổng hợp ngắn gọn các file/chức năng đã thay đổi, lệnh kiểm tra đã chạy, kết quả và vấn đề còn tồn tại.
4. Hướng dẫn cách chạy hoặc xác minh phần vừa hoàn thành khi cần; không tuyên bố tính năng hoạt động nếu chưa có bằng chứng.
5. Chỉ kết thúc nhiệm vụ khi kết quả đáp ứng yêu cầu; nếu chưa đạt, nêu rõ lý do và quay về bước thích hợp.

## Đầu ra
- Báo cáo bàn giao ngắn gọn: **đã làm — đã kiểm tra — kết quả — tồn đọng**.
- Trạng thái sẵn sàng cho nhiệm vụ tiếp theo.

## Nguyên tắc
- Không tự commit, merge, push hoặc triển khai production khi chưa được yêu cầu.
- Hoàn tất một nhiệm vụ không đồng nghĩa toàn bộ Đồ án 1 đã hoàn thành.
