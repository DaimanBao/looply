# Quy trình phát triển Looply — Đồ án 1

## Mục đích
Điều phối công việc của AI Agent theo sáu giai đoạn. Thực hiện theo từng chức năng hoặc phần việc có thể kiểm chứng; kết quả giai đoạn trước là đầu vào giai đoạn sau.

## Thứ tự bắt buộc
1. [ANALYSIS](ANALYSIS.md): làm rõ yêu cầu và tiêu chí chấp nhận.
2. [DESIGN](DESIGN.md): xác định giải pháp phù hợp yêu cầu và kiến trúc.
3. [IMPLEMENTATION](IMPLEMENTATION.md): triển khai code và kiểm tra cơ bản.
4. [TESTING](TESTING.md): chạy và ghi nhận kết quả kiểm thử thực tế.
5. [REVIEW](REVIEW.md): rà soát nghiệp vụ, cấu trúc, bảo mật, chất lượng.
6. [COMPLETION](COMPLETION.md): xác nhận hoàn thành và cập nhật tài liệu.

## Quy tắc chuyển bước
- Chỉ chuyển bước khi đầu ra và điều kiện hoàn thành của giai đoạn hiện tại đạt yêu cầu.
- Thiếu thông tin hoặc quyết định nghiệp vụ quan trọng: báo rõ để làm rõ, không tự suy đoán.
- Phát hiện lỗi hoặc sai lệch: quay về giai đoạn liên quan để sửa, sau đó kiểm thử và review lại phần bị ảnh hưởng.
- Không xem việc viết xong code là hoàn thành; phải có bằng chứng chạy/test phù hợp.
- Không bỏ qua bước, không báo cáo kiểm thử thành công nếu chưa thực sự chạy.

## Phạm vi và báo cáo
- Tuân thủ [TECH_STACK](../TECH_STACK.md), yêu cầu chức năng và tài liệu cấu trúc tương ứng; chỉ triển khai phạm vi Đồ án 1.
- Cuối mỗi phần việc, tóm tắt: đã làm gì, kết quả test/build, vấn đề còn lại và bước tiếp theo.
- Không tự push, merge hoặc thực hiện thao tác phá hủy dữ liệu khi chưa được phép.
