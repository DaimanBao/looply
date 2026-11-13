# DESIGN — Thiết kế giải pháp

## Mục tiêu
Chuyển kết quả của `ANALYSIS.md` thành thiết kế đủ rõ để AI Agent triển khai đúng yêu cầu, phù hợp kiến trúc Looply Đồ án 1.

## Đầu vào
- Yêu cầu đã rõ từ **ANALYSIS**: luồng nghiệp vụ, quy tắc, dữ liệu, phân quyền, tiêu chí chấp nhận; không cần lượt phê duyệt riêng nếu không phát sinh quyết định cần duyệt.
- Kiến trúc, tech stack, cấu trúc dự án và mã nguồn hiện có liên quan.

## Nhiệm vụ của Agent
1. Xác định module chịu trách nhiệm và các thành phần cần tạo/sửa; ưu tiên tái sử dụng, không dồn logic vào một file.
2. Thiết kế luồng xử lý, ranh giới giữa các lớp/module và cách xử lý lỗi, trường hợp biên.
3. Xác định thay đổi dữ liệu: schema, quan hệ, ràng buộc, migration (nếu cần); không tự chạy thao tác phá hủy dữ liệu.
4. Xác định API contract, DTO, validation, authentication/authorization và sự kiện realtime/background nếu liên quan.
5. Xác định các trường hợp cần kiểm thử và tác động đến chức năng hiện có.
6. Đối chiếu thiết kế với yêu cầu và công nghệ đã chốt; nêu rõ điểm chưa xác định, không tự thêm nghiệp vụ.

## Đầu ra
Thiết kế vừa đủ cho rủi ro của thay đổi; có thể gộp với phân tích và triển khai theo [Lean Development Workflow](DEVELOPMENT_WORKFLOW.md), không bắt buộc kế hoạch dài hoặc tài liệu thiết kế riêng.

- Phương án thiết kế có thể triển khai: thành phần/file dự kiến, luồng xử lý, dữ liệu và giao diện giữa các thành phần.
- Danh sách thay đổi và các trường hợp kiểm thử cần thực hiện.
- Các quyết định hoặc vướng mắc cần xác nhận (nếu có).

## Điều kiện chuyển sang IMPLEMENTATION
- Thiết kế đáp ứng tiêu chí chấp nhận của ANALYSIS, không mâu thuẫn yêu cầu hoặc kiến trúc.
- Những vấn đề ảnh hưởng đến nghiệp vụ, dữ liệu hoặc bảo mật đã được làm rõ.
- Chưa viết code tính năng trong giai đoạn DESIGN; chỉ chuyển sang triển khai khi thiết kế đủ rõ.
