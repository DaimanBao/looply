# IMPLEMENTATION — Triển khai

## Mục tiêu
Hiện thực thiết kế đã thống nhất thành mã nguồn chạy được, đúng yêu cầu và cấu trúc Looply — Đồ án 1.

## Đầu vào
- Giải pháp đủ rõ từ `DESIGN.md`; chỉ cần phê duyệt riêng khi có quyết định vượt phạm vi đã được cho phép.
- Yêu cầu module tương ứng trong `docs/requirements/`.
- Quy định công nghệ, kiến trúc và cấu trúc trong `docs/TECH_STACK.md`, `docs/structures/` và `AGENTS.md`.

## Nhiệm vụ của AI Agent
1. Xác định các file cần tạo/sửa và tác động đến các module khác trước khi viết code.
2. Triển khai theo từng phần nhỏ, đúng thiết kế và quy tắc nghiệp vụ; không tự thêm tính năng hoặc đổi công nghệ.
3. Tách đúng trách nhiệm (route, controller, service, repository, validation, middleware, UI component...); dùng lại phần chung khi hợp lý, tránh file quá lớn và trừu tượng hóa không cần thiết.
4. Xử lý lỗi, kiểm tra đầu vào, phân quyền và bảo vệ dữ liệu ở các điểm liên quan; không đưa bí mật vào mã nguồn.
5. Viết test phù hợp cho logic mới hoặc thay đổi; sử dụng mock/seed đúng mục đích, không thay thế kiểm thử tích hợp thực tế.
6. Chọn thời điểm và kiểm tra theo [Risk-Based Targeted Testing](TESTING.md), dùng lại kết quả PASS còn hiệu lực giữa IMPLEMENTATION và TESTING; không chạy mọi kiểm tra sau mỗi phần. Sửa lỗi phát sinh; không tuyên bố đạt khi chưa có bằng chứng.
7. Cập nhật tài liệu liên quan khi việc triển khai làm thay đổi hợp đồng API, cấu trúc hoặc quyết định kỹ thuật đã được duyệt.

## Đầu ra
Tổng hợp trong PR/bàn giao cuối; không cần báo cáo trung gian riêng cho giai đoạn.

- Mã nguồn được triển khai theo thiết kế, có test liên quan.
- Danh sách file đã thay đổi và tóm tắt chức năng đã làm.
- Kết quả các lệnh kiểm tra đã chạy; nêu rõ phần chưa kiểm chứng và vấn đề còn tồn tại.

## Điều kiện chuyển sang TESTING
- Phần triển khai đã hoàn tất theo thiết kế, không còn lỗi đã biết ngăn cản việc chạy kiểm thử.
- Có đủ mã nguồn, cấu hình và test cần thiết để giai đoạn `TESTING.md` kiểm chứng.

## Giới hạn
- Không tự push, merge hoặc thao tác phá hủy dữ liệu.
- Chỉ chạy migration hoặc thao tác dữ liệu khi đã xác định đúng môi trường; không reset database phát triển/production.
- Nếu thiết kế thiếu hoặc mâu thuẫn, quay lại làm rõ ở `DESIGN.md` thay vì tự suy đoán.
