# TỔNG QUAN DỰ ÁN LOOPLY

> **Mục đích:** Giúp người đọc và AI Agent nắm nhanh bài toán, mục tiêu và phạm vi **Đồ án 1**. Chi tiết nghiệp vụ, công nghệ và quy trình thuộc các tài liệu chuyên trách.

## 1. Giới thiệu và bài toán

**Looply** là nền tảng web kết nối người muốn **bán, trao đổi hoặc cho thuê đồ dùng** với người có nhu cầu. Sản phẩm dành cho cộng đồng rộng rãi, **không giới hạn sinh viên**.

Looply giải quyết việc thông tin đồ dùng và người có nhu cầu còn phân tán: người dùng có thể đăng bài, khám phá, tìm kiếm, lọc, theo dõi và trao đổi trực tiếp trong ngữ cảnh bài đăng. Trong Đồ án 1, nền tảng **hỗ trợ kết nối và thỏa thuận**, không xử lý thanh toán hoặc bảo đảm việc giao dịch ngoài đời thực.

## 2. Mục tiêu Đồ án 1

- Xây dựng ứng dụng web có **Frontend, Backend và cơ sở dữ liệu tích hợp thực tế**, chạy được và trình diễn được các luồng chính.
- Tổ chức mã nguồn theo module và trách nhiệm rõ ràng, dễ tìm kiếm, tái sử dụng, kiểm thử, bảo trì và mở rộng.
- Duy trì **API contract nhất quán** giữa Frontend và Backend; phát triển từng phần và kiểm chứng kết quả thực tế.

## 3. Đối tượng và quyền sử dụng tổng quan

- **Khách chưa đăng nhập:** Xem danh sách và chi tiết bài đăng công khai; không thực hiện tương tác cần tài khoản.
- **Người dùng đã đăng nhập:** Đăng và quản lý bài, theo dõi, trò chuyện, quản lý hồ sơ và sử dụng các chức năng tương tác được phép.
- **Người đăng / người quan tâm:** Là vai trò theo từng tình huống, **không phải hai loại tài khoản riêng**.

## 4. Phạm vi chức năng

| Nhóm | Chức năng chính |
| --- | --- |
| **Auth** | Đăng ký, đăng nhập bằng các phương thức đã thống nhất; xác minh và quản lý phiên. |
| **User** | Quản lý hồ sơ, thông tin liên hệ và tương tác người dùng. |
| **Listing** | Đăng, xem, sửa, ẩn/hiện, quản lý trạng thái; tìm kiếm, lọc, theo dõi bài đăng. |
| **Media** | Quản lý ảnh, video của bài đăng và nội dung liên quan. |
| **Chat** | Hội thoại theo bài đăng hoặc trực tiếp, hỗ trợ thời gian thực. |
| **Transaction Proposal** | Tạo và quản lý đề xuất giao dịch theo nghiệp vụ đã thống nhất. |
| **Notification** | Thông báo sự kiện liên quan, quản lý trạng thái đã đọc. |
| **Reminder** | Nhắc bổ sung thông tin hồ sơ khi phù hợp, không gây cản trở không cần thiết. |

Đây là **phạm vi dự kiến**, không phải xác nhận các chức năng đã hoàn thành. Chi tiết và điều kiện nghiệp vụ nằm trong [`requirements/`](requirements/).

## 5. Ngoài phạm vi Đồ án 1

- Hệ thống **Admin hoàn chỉnh** phục vụ xử lý vi phạm, khóa tài khoản và vận hành nâng cao.
- **Thanh toán trực tuyến**, bảo đảm giao dịch tài chính hoặc thực hiện giao nhận ngoài đời thực.
- Backend Admin bằng **Java/Spring Boot** và việc tách thành các dịch vụ độc lập.
- Các tính năng mở rộng chưa được phê duyệt trong yêu cầu Đồ án 1.

## 6. Định hướng giải pháp và kết quả mong đợi

- Kiến trúc Backend: **Modular Monolith**, phân tách module và các tầng trách nhiệm; Frontend tổ chức theo feature.
- Ưu tiên **rõ trách nhiệm và khả năng tái sử dụng** hơn số lượng file ít; không dồn nghiệp vụ khác nhau vào một file.
- Kết quả mong đợi: các luồng chính **chạy được, tích hợp thực tế, dữ liệu nhất quán và có kết quả kiểm thử phù hợp**. Không coi skeleton hoặc mock là chức năng đã hoàn thành.

## 7. Tài liệu nguồn cần tham chiếu

- [`requirements/FUNCTIONAL_REQUIREMENTS.md`](requirements/FUNCTIONAL_REQUIREMENTS.md) và [`requirements/modules/`](requirements/modules/): yêu cầu và quy tắc nghiệp vụ chi tiết.
- [`TECH_STACK.md`](TECH_STACK.md): công nghệ, phiên bản và vai trò.
- [`structures/`](structures/): cấu trúc Root, Backend và Frontend.
- [`DEVELOPMENT_WORKFLOW.md`](workflows/DEVELOPMENT_WORKFLOW.md) và [`workflows/`](workflows/): quy trình triển khai, kiểm thử và hoàn thành.
- [`DOCUMENTATION_GUIDE.md`](DOCUMENTATION_GUIDE.md): quy tắc quản lý tài liệu; [`../AGENTS.md`](../AGENTS.md): quy định bắt buộc cho AI Agent.

**Quy tắc cập nhật:** Chỉ sửa file này khi thay đổi mục tiêu, đối tượng hoặc phạm vi tổng quan; không đưa API chi tiết, cây thư mục, hướng dẫn kiểm thử hay nhật ký tiến độ vào đây.
