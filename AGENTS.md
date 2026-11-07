# AGENTS.md — Looply

> Quy tắc chung dành cho AI coding agents trong repository Looply. File này hướng dẫn **cách làm việc**, không thay thế đặc tả nghiệp vụ. Ưu tiên đọc có chọn lọc để tránh tiêu tốn context không cần thiết.

## 1. Mục tiêu

Looply là nền tảng giao dịch đồ đã qua sử dụng. Giai đoạn hiện tại là **Đồ án 1**. Phát triển từng bước nhỏ, có kiểm chứng, giữ khả năng mở rộng mà không triển khai sớm chức năng tương lai.

Ưu tiên: **đúng nghiệp vụ → an toàn, ổn định → dễ bảo trì → đơn giản → tiến độ thực tế**.

## 2. Nguồn thông tin và chiến lược đọc tiết kiệm context

Không đọc toàn bộ repository hoặc tất cả tài liệu ở đầu mỗi tác vụ. Trước tiên xác định tác vụ thuộc module nào, sau đó chỉ mở file và **đoạn nội dung** liên quan.

| Nguồn | Khi nào cần đọc |
| --- | --- |
| `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md` | Phần nghiệp vụ liên quan tới tác vụ |
| `docs/technical/PROJECT_STRUCTURE.md` | Khi thêm/sửa module, quan hệ phụ thuộc hoặc cấu trúc |
| `docs/technical/backend/BACKEND_PACKAGES.md` | Khi dùng, thêm, thay đổi package backend |
| `docs/progress/DEVELOPMENT_PROGRESS.md` | Khi chọn việc tiếp theo, kiểm tra hoặc cập nhật tiến độ |
| `README.md` | Khi cần tổng quan, setup, chạy dự án |
| `backend/package.json`, `frontend/package.json`, config, migration, source, test | Kiểm tra hiện trạng thực tế của phần đang sửa |

**Quy trình tìm thông tin:** tìm đường dẫn/symbol/từ khóa → đọc đoạn phù hợp → mở rộng sang file phụ thuộc nếu cần → chỉ đọc toàn file khi cần hiểu toàn bộ. Giới hạn output tìm kiếm; bỏ qua `node_modules/`, `dist/`, `build/`, `coverage/`, `.git/` và file sinh tự động trừ khi tác vụ trực tiếp liên quan. Không sao chép lại các tài liệu dài vào câu trả lời.

**Thứ tự xử lý mâu thuẫn:** yêu cầu mới rõ ràng của người dùng → đặc tả đã chốt về hành vi mong muốn → code/test/config về những gì thực sự đã triển khai. Nếu nguồn mâu thuẫn hoặc yêu cầu mới thay đổi nghiệp vụ quan trọng, nêu rõ và xác nhận trước. Tiến độ không thay thế việc kiểm tra code. Không giả định file liệt kê ở trên đều đã tồn tại.

## 3. Skill hỗ trợ

Khi công cụ AI Agent hỗ trợ repository skills, dùng theo **nhu cầu**, không tự động tải nội dung tất cả Skill:

- `.github/skills/looply-development-workflow/SKILL.md`: quy trình phân tích → triển khai → kiểm chứng → cập nhật tài liệu; dùng khi thực hiện tác vụ phát triển.
- `.github/skills/looply-context-optimizer/SKILL.md`: hướng dẫn tìm kiếm và đọc source/tài liệu có chọn lọc, quản lý context; dùng khi khám phá codebase hoặc tác vụ có nguy cơ đọc nhiều dữ liệu.

Đường dẫn Skill chỉ là tham chiếu; kiểm tra file tồn tại và công cụ có hỗ trợ trước khi dùng. **Skill không ghi đè yêu cầu người dùng, nghiệp vụ đã chốt hoặc các quy tắc bảo mật trong file này.** Không đọc lại toàn bộ Skill ở mọi bước nếu nội dung đã có trong context và vẫn còn phù hợp.

## 4. Phạm vi và công nghệ

- Mặc định chỉ triển khai **Đồ án 1**, trừ khi người dùng yêu cầu khác. Không tự thêm Admin, thanh toán, AI recommendation hoặc chức năng Đồ án 2.
- Backend: **Express.js + TypeScript**; frontend: **Angular + TypeScript**; database: **PostgreSQL**; ORM: **Prisma 7** (xác minh phiên bản thực tế).
- Không tự đổi framework, ORM, database, package manager, kiến trúc monorepo hoặc nâng/hạ package.
- Chỉ đề xuất dependency khi tác vụ cần, sau khi kiểm tra những gì đã có; giải thích và xin xác nhận nếu ảnh hưởng đáng kể.
- Package đã cài **không có nghĩa** tính năng đã triển khai.
- Phân biệt **đã chốt**, **đề xuất**, **chưa chốt**; không biến giả định thành quyết định chính thức.

## 5. Quy trình thực hiện tác vụ

1. **Hiểu:** xác định mục tiêu, tiêu chí hoàn thành, module và phần nghiệp vụ liên quan.
2. **Kiểm tra:** tìm file/symbol trước, đọc đúng đoạn source, schema, API, test và cấu hình cần thiết; kiểm tra tác động liên module.
3. **Phân tích vừa đủ:** chọn phương án đơn giản phù hợp hiện trạng. Hỏi trước khi thay đổi nghiệp vụ đã chốt, public API, schema có nguy cơ phá tương thích, kiến trúc lớn hoặc bảo mật quan trọng.
4. **Triển khai:** thay đổi nhỏ, đúng phạm vi; không refactor không liên quan, không nhồi nghiệp vụ vào controller/UI, không tạo code giả như đã hoạt động. Giữ TypeScript type-safe; tránh `any`, `@ts-ignore` và ép kiểu thiếu kiểm chứng.
5. **Kiểm chứng:** xem scripts trước khi chạy; thực hiện typecheck, lint, test, build hoặc kiểm tra thủ công phù hợp. Bổ sung test cho nghiệp vụ và quyền truy cập khi cần. Báo rõ bước nào chưa thể chạy.
6. **Đồng bộ:** cập nhật tài liệu kiến trúc/package khi có thay đổi thực tế; cập nhật tiến độ dựa trên bằng chứng, không đánh dấu hoàn thành theo dự đoán.
7. **Báo cáo ngắn gọn:** nêu file đã sửa, kết quả, kiểm chứng và việc còn lại; không lặp lại toàn bộ code hoặc log dài nếu không được yêu cầu.

Không tự commit, push, merge, tạo PR hoặc deploy khi người dùng chưa yêu cầu.

## 6. Nguyên tắc kiến trúc

- Mỗi module sở hữu đúng nghiệp vụ của mình; không tạo chức năng trùng lặp giữa module.
- Backend thực thi validation, xác thực, ownership, quyền tham gia conversation và quy tắc nghiệp vụ; frontend validation cải thiện trải nghiệm, không thay thế backend.
- Tách HTTP handling khỏi business logic; giữ API, error response và kiểu dữ liệu nhất quán.
- Ưu tiên tái sử dụng hợp lý, tránh abstraction quá mức và tối ưu hóa sớm.
- Với migration, đánh giá dữ liệu hiện có, tác động tương thích và khả năng phục hồi; không reset database tùy tiện.
- Không thay đổi quyết định cũ chỉ vì phương án mới có vẻ hấp dẫn hơn.

## 7. Bảo mật

- Không log, commit hoặc tiết lộ mật khẩu, OTP, token, API key, secret hay connection string nhạy cảm.
- Không hardcode secret; dùng biến môi trường và placeholder trong tài liệu.
- Không thực hiện thao tác phá hủy (reset/drop database, xóa volume, force push, xóa dữ liệu) khi chưa được chấp thuận rõ ràng.
- Validate input ở backend; dùng Prisma/parameterized queries, không ghép SQL từ input.
- Bảo vệ endpoint và Socket.IO bằng xác thực/phân quyền phía server.
- Upload phải kiểm tra định dạng, kích thước, quyền và nội dung; không tin hoàn toàn filename/MIME do client cung cấp.
- Không tự gửi dữ liệu dự án hoặc dữ liệu người dùng đến dịch vụ ngoài.

## 8. Các điểm nghiệp vụ dễ triển khai sai

> Chỉ là lời nhắc; luôn đối chiếu phần tương ứng trong requirements khi triển khai.

- Guest có thể duyệt, tìm kiếm/lọc và xem chi tiết tin; tương tác yêu cầu đăng nhập.
- Vị trí hồ sơ bắt buộc khi đăng ký; thay đổi vị trí hồ sơ không tự sửa vị trí tin đăng cũ.
- **Một cặp user có một conversation**, có thể liên quan nhiều tin đăng; không tạo conversation mới cho mỗi tin.
- Tin ẩn/không còn khả dụng/đã soft-delete không cho khởi tạo chat mới từ tin; chat cũ được giữ theo quy tắc đã chốt.
- Sửa tin đã có chat cần cảnh báo/xác nhận và xử lý thông báo đúng đối tượng.
- Không mặc định thông báo cho mọi hành động follow, block hay chỉnh sửa profile.
- Không có trang Admin trong Đồ án 1.
- Thời lượng video chính xác, N của feed, chính sách OTP và các điểm mở khác phải kiểm tra trước khi chốt triển khai.

## 9. Giao tiếp và quản lý context

- Dùng **tiếng Việt**, rõ ràng, thực tế, từng bước; không kéo dài câu trả lời khi không cần.
- Khi hướng dẫn lệnh, dựa trên hệ điều hành, terminal và cấu hình thực tế.
- Không lặp lại nguyên văn yêu cầu hoặc dump cả file/log khi chỉ cần tóm tắt hay diff.
- Với phiên dài, duy trì bản tóm tắt ngắn gồm **mục tiêu, quyết định đã chốt, file đã sửa, kết quả test, việc còn lại và điểm chưa chốt**; xác minh lại từ source khi tiếp tục.
- Tiết kiệm token **không được đánh đổi** tính đúng đắn, bảo mật, kiểm thử hoặc việc đọc thông tin cần thiết.
- Khi có lỗi, đọc thông báo và kiểm tra hiện trạng trước; không đề nghị cài lại toàn bộ theo phản xạ.
- Không nói “đã sửa”, “đã chạy”, “đã test”, “đã commit” nếu chưa thực sự làm.

## 10. Định nghĩa hoàn thành

Chỉ đánh dấu hoàn thành khi hành vi đáp ứng yêu cầu đã chốt, thay đổi được tích hợp đúng vị trí, kiểm chứng khả thi đã chạy, kết quả được báo trung thực và tài liệu/tiến độ liên quan đã đồng bộ. Nếu còn thiếu, ghi **hoàn thành một phần**, **chưa kiểm chứng** hoặc **đang bị chặn**.

---

**Nguyên tắc cốt lõi:** *Phân tích đủ cho bước hiện tại → code → kiểm chứng → cập nhật tài liệu → tiếp tục*. Đọc đúng thứ cần đọc, nhưng không bỏ qua bằng chứng quan trọng chỉ để tiết kiệm token.

# Chú thích Mã nguồn và Độ dễ đọc (Code Comments & Readability)

Khi viết hoặc chỉnh sửa mã nguồn, hãy luôn ưu tiên **độ dễ đọc**, **khả năng bảo trì** và **lời giải thích rõ ràng**.

---

## Quy tắc Viết Chú thích (Commenting Rules)

1. **Tương quan với độ phức tạp:** Chú thích (comment) phải tỉ lệ thuận với độ phức tạp của mã nguồn.
2. **Đoạn mã đơn giản:** Đối với các hàm, phương thức, lớp hoặc đoạn mã đơn giản, chỉ sử dụng chú thích ngắn gọn mô tả mục đích khi thấy cần thiết.
3. **Logic phức tạp vừa phải:** Giải thích trách nhiệm chính và các điều kiện quan trọng.
4. **Logic/Thuật toán phức tạp:** Đối với các thuật toán, quy trình làm việc (workflow), quy tắc nghiệp vụ (business rules) hoặc hành vi không trực quan, hãy cung cấp chú thích chi tiết giải thích cách logic hoạt động và lý do tại sao nó lại cần thiết.
5. **Trường hợp biên & Quyết định thiết kế:** Giải thích các trường hợp biên (edge cases), giới hạn kỹ thuật và các quyết định thiết kế mà các lập trình viên sau này cần phải hiểu.
6. **Tập trung vào lý do ("Why"):** Ưu tiên giải thích *tại sao* đoạn mã được viết như vậy hơn là chỉ lặp lại *cái gì* mà mã nguồn đã thể hiện rõ.
7. **Tránh rườm rà:** Không viết chú thích dài dòng không cần thiết cho các thao tác đơn giản.
8. **Tránh trùng lặp:** Tránh các chú thích dư thừa lặp lại các câu lệnh, gán biến hoặc lời gọi hàm đã rõ ràng.
9. **Tên gọi & Cấu trúc mã:** Sử dụng tên biến/hàm có ý nghĩa và cấu trúc mã rõ ràng; chú thích nhằm hỗ trợ độ dễ đọc chứ không dùng để bù đắp cho mã nguồn rối rắm.
10. **Cập nhật đồng bộ:** Giữ chú thích luôn chính xác và cập nhật lại mỗi khi logic liên quan thay đổi.
11. **Chuẩn JSDoc:** Sử dụng JSDoc cho các hàm, lớp hoặc API khi việc tài liệu hóa các tham số, giá trị trả về, hợp đồng (contracts) hoặc hành vi quan trọng mang lại lợi ích.
12. **Ngôn ngữ sử dụng:** Sử dụng **tiếng Việt** cho các chú thích giải thích để dự án dễ hiểu và nhất quán, đồng thời giữ nguyên các thuật ngữ kỹ thuật phổ biến khi cần thiết.

---

## Nguyên tắc Cốt lõi (Guiding Principle)

> **Mã nguồn đơn giản cần lời giải thích đơn giản. Mã nguồn phức tạp cần lời giải thích rõ ràng và đủ chi tiết.**

Mục tiêu không phải là tối đa hóa số lượng chú thích, mà là đảm bảo các nhà phát triển có thể hiểu được mục đích, hành vi và lý do đằng sau cách triển khai.