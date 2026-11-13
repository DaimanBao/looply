# Hướng dẫn quản lý tài liệu Looply

## 1. Mục đích

Giúp AI Agent tìm đúng tài liệu, hiểu yêu cầu và cập nhật đúng nơi. Tài liệu cần **ngắn gọn, rõ ràng, đủ để thực hiện công việc**, không viết dài hoặc lặp nội dung.

## 2. Nguồn thông tin chính

| Nội dung | Tài liệu chịu trách nhiệm |
|---|---|
| Quy tắc bắt buộc dành cho AI Agent | `AGENTS.md` |
| Tổng quan, mục tiêu, phạm vi Đồ án 1 | `docs/PROJECT_OVERVIEW.md` |
| Quy ước tổ chức và cập nhật tài liệu | `docs/DOCUMENTATION_GUIDE.md` |
| Công nghệ và phiên bản đã chốt | `docs/TECH_STACK.md` |
| Formatting và ngôn ngữ comment | `docs/standards/CODE_FORMATTING.md` |
| Quy trình phát triển tổng thể | `docs/workflows/DEVELOPMENT_WORKFLOW.md` |
| Yêu cầu chức năng và quy tắc nghiệp vụ | `docs/requirements/FUNCTIONAL_REQUIREMENTS.md` và `docs/requirements/modules/` |
| Thiết kế dữ liệu, mô hình quan hệ và ràng buộc | `docs/database/` |
| Hợp đồng HTTP và quy ước API | `docs/api/openapi.json` (OpenAPI 3.1), `docs/api/CONVENTIONS.md` |
| Cấu hình, chạy và kiểm thử Backend Core | `backend/README.md` |
| Cấu trúc Root, Backend, Frontend | `docs/structures/` |
| Hướng dẫn từng giai đoạn phân tích, thiết kế, triển khai, kiểm thử, review, hoàn tất | `docs/workflows/` |

## 3. Quy tắc dành cho AI Agent

1. **BẮT BUỘC** đọc `AGENTS.md` và tài liệu liên quan trực tiếp đến nhiệm vụ trước khi sửa code.
2. **BẮT BUỘC** chỉ ghi chi tiết tại tài liệu sở hữu nội dung; tài liệu khác dẫn chiếu, không sao chép.
3. **BẮT BUỘC** chỉ cập nhật tài liệu sở hữu nội dung thực sự bị ảnh hưởng khi yêu cầu, API contract, cấu trúc hoặc quyết định kỹ thuật được phê duyệt thay đổi; không đồng bộ hàng loạt docs khi không có thay đổi tương ứng.
4. **BẮT BUỘC** phân biệt yêu cầu đã chốt, đề xuất và trạng thái triển khai; không tự xem đề xuất là quyết định.
5. **BẮT BUỘC** báo cáo khi tài liệu thiếu, mâu thuẫn hoặc không khớp code; không tự ý thay đổi nghiệp vụ đã chốt.
6. **NÊN** dùng tiêu đề rõ, bảng hoặc danh sách ngắn; ưu tiên thông tin có thể hành động, tránh diễn giải dài dòng.
7. **KHÔNG ĐƯỢC** tạo tài liệu trùng mục đích hoặc đổi tên/di chuyển tài liệu hiện có khi chưa có lý do và phạm vi được chấp thuận.

## 4. Ngôn ngữ và định dạng

- Viết **tiếng Việt**; giữ nguyên tên công nghệ, định danh, đường dẫn, lệnh và thuật ngữ kỹ thuật khi cần.
- Dùng Markdown (`.md`), mã hóa UTF-8; tên file theo cấu trúc đã thống nhất.
- Ví dụ chỉ đưa vào khi giúp Agent hiểu chính xác hành vi cần thực hiện.

## 5. Khi có mâu thuẫn

Ưu tiên yêu cầu mới nhất **được người dùng xác nhận rõ ràng** và các giới hạn an toàn trong `AGENTS.md`. Với mâu thuẫn giữa các tài liệu, xác định tài liệu sở hữu nội dung theo bảng ở mục 2; nếu vẫn chưa rõ hoặc cần thay đổi nghiệp vụ/kiến trúc, hỏi trước khi triển khai.

## 6. Phạm vi áp dụng

Áp dụng cho toàn bộ tài liệu của Looply trong Đồ án 1. Không tự bổ sung kế hoạch tương lai thành chức năng thuộc phạm vi hiện tại.
