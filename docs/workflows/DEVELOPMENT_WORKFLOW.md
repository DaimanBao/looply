# Quy trình phát triển Looply — Đồ án 1

## Mục đích
Áp dụng Lean Development Workflow: giữ chất lượng implementation, testing, security và maintainability, giảm thao tác không tạo thêm bằng chứng. Thực hiện theo phần việc có thể kiểm chứng trong phạm vi Đồ án 1.

## Context và triển khai

- Chỉ đọc quy tắc áp dụng và tài liệu, code, test, contract liên quan trực tiếp. Tìm kiếm có mục tiêu theo file, symbol hoặc nơi sử dụng; không quét toàn repository theo mặc định.
- Dùng lại nội dung đã biết trong phiên nếu chưa thay đổi; chỉ đọc lại khi có thay đổi hoặc thiếu thông tin cần thiết.
- Xác định ngắn gọn phạm vi ảnh hưởng, ranh giới trách nhiệm và cách kiểm chứng trước khi sửa. Yêu cầu rõ thì triển khai ngay; không bắt buộc kế hoạch dài, báo cáo hoặc file đầu ra riêng cho từng giai đoạn.
- Không refactor ngoài phạm vi, mở rộng tính năng hoặc tự thay đổi nghiệp vụ, công nghệ, kiến trúc.
- Chỉ hỏi khi có blocker hoặc quyết định cần phê duyệt; tiếp tục phần độc lập đã được cho phép trong khi chờ.

## Các bước kiểm soát chất lượng

Luồng mặc định: **Implement → Targeted Tests → Final Self-Review → Fix → PR/CI**. Agent tự review diff cuối trong cùng nhiệm vụ, sửa lỗi phát hiện và chỉ kiểm chứng lại phần bị ảnh hưởng; không cần prompt review thứ hai. PR/push tuân theo quyền Git đã được cấp, không tự merge.

1. [ANALYSIS](ANALYSIS.md): làm rõ yêu cầu và tiêu chí chấp nhận.
2. [DESIGN](DESIGN.md): xác định giải pháp phù hợp yêu cầu và kiến trúc.
3. [IMPLEMENTATION](IMPLEMENTATION.md): triển khai code và kiểm tra cơ bản.
4. [TESTING](TESTING.md): chạy và ghi nhận kết quả kiểm thử thực tế.
5. [REVIEW](REVIEW.md): rà soát nghiệp vụ, cấu trúc, bảo mật, chất lượng.
6. [COMPLETION](COMPLETION.md): xác nhận hoàn thành và cập nhật tài liệu.

Đây là các trách nhiệm cần đáp ứng, không phải sáu lượt báo cáo/phê duyệt. Có thể gộp phân tích, thiết kế và triển khai khi yêu cầu rõ. Chỉ đọc hướng dẫn chi tiết cần dùng, không bắt buộc đọc toàn bộ workflow mỗi nhiệm vụ.

## Quy tắc chuyển bước
- Chỉ chuyển bước khi đầu ra và điều kiện hoàn thành của giai đoạn hiện tại đạt yêu cầu.
- Thiếu thông tin hoặc quyết định nghiệp vụ quan trọng: báo rõ để làm rõ, không tự suy đoán.
- Phát hiện lỗi hoặc sai lệch: quay về giai đoạn liên quan để sửa, sau đó kiểm thử và review lại phần bị ảnh hưởng.
- Không xem việc viết xong code là hoàn thành; phải có bằng chứng chạy/test phù hợp.
- Không bỏ qua trách nhiệm kiểm soát chất lượng; dùng lại kết quả kiểm chứng còn hiệu lực theo [TESTING](TESTING.md), không khởi động lại toàn bộ quy trình khi chỉ một phần bị ảnh hưởng.

## Kiểm chứng và tài liệu

- Áp dụng [Risk-Based Targeted Testing](TESTING.md); không mặc định full suite local hoặc lặp kết quả PASS còn hiệu lực.
- Chỉ cập nhật tài liệu sở hữu nội dung thực sự thay đổi theo [Documentation Guide](../DOCUMENTATION_GUIDE.md); không đồng bộ hàng loạt hoặc tạo báo cáo trung gian không cần thiết.
- Documentation-only: kiểm tra Markdown, liên kết liên quan và `git diff --check`; không chạy unit/integration/API tests hoặc build. Nếu thay đổi contract hay nội dung thực thi trong tài liệu, bổ sung kiểm tra đặc tả/nội dung tương ứng.
- Formatting/comment theo [Code Formatting](../standards/CODE_FORMATTING.md): review diff để bảo đảm không đổi logic; không chạy riêng test Backend. Nếu tách template/style Angular, chạy build một lần và targeted tests cho component bị ảnh hưởng, không mặc định full suite/E2E.

## Phạm vi và báo cáo
- Tuân thủ [TECH_STACK](../TECH_STACK.md), yêu cầu chức năng và tài liệu cấu trúc tương ứng; chỉ triển khai phạm vi Đồ án 1.
- Cập nhật tiến độ ngắn khi có phát hiện, blocker hoặc đổi hướng đáng kể; không thuật lại từng thao tác. Bàn giao cuối gồm thay đổi chính, kiểm tra/kết quả, rủi ro/tồn đọng và PR nếu có. Phân biệt kết quả local, CI và chưa chạy; không bịa kết quả.
- Không tự push, merge hoặc thực hiện thao tác phá hủy dữ liệu khi chưa được phép.
