# Looply — Quy tắc dành cho AI Agent

Tài liệu này áp dụng cho toàn bộ repository Looply. `AGENTS.md` quy định **những điều AI Agent phải tuân thủ**, không thay thế tài liệu phân tích, thiết kế và hướng dẫn chi tiết trong `docs/`. Các file `backend/AGENTS.md` hoặc `frontend/AGENTS.md` (nếu có) chỉ được bổ sung quy tắc đặc thù, không được làm suy yếu quy tắc tại đây.

**BẮT BUỘC**: phải thực hiện. **NÊN**: ưu tiên thực hiện, chỉ ngoại lệ khi có lý do kỹ thuật cụ thể. **CÓ THỂ**: tùy tình huống. Luôn tuân thủ chỉ dẫn có mức ưu tiên cao hơn; trong phạm vi quyết định dự án, ưu tiên quyết định rõ ràng mới nhất đã được người dùng phê duyệt. Không tự suy diễn quyết định nghiệp vụ hoặc kiến trúc khi tài liệu thiếu hoặc mâu thuẫn.

## 1. Mục đích, phạm vi và nguồn thông tin chính thức

- **BẮT BUỘC** làm việc trong phạm vi Đồ án 1 đã phê duyệt, với kiến trúc Modular Monolith. Không tự triển khai nội dung dự kiến cho Đồ án 2.
- **BẮT BUỘC** tuân thủ công nghệ và phiên bản đã chốt; không tự ý thay đổi.
- **BẮT BUỘC** đọc tài liệu liên quan trước khi triển khai hoặc sửa chức năng. Mã nguồn phản ánh trạng thái hiện tại nhưng không được tự động xem là đúng hơn yêu cầu đã duyệt.
- **BẮT BUỘC** phát hiện mâu thuẫn giữa yêu cầu, API contract, thiết kế, test và mã nguồn. Phải hỏi khi cách giải quyết làm thay đổi nghiệp vụ, bảo mật, giao diện công khai hoặc kiến trúc.

### Bản đồ tài liệu — mỗi nội dung có một nguồn chính thức

| Cần tìm hiểu | Tài liệu chính |
| --- | --- |
| Looply là gì, phạm vi Đồ án 1 | `docs/PROJECT_OVERVIEW.md` |
| Công nghệ và phiên bản được sử dụng | `docs/TECH_STACK.md` |
| Quy tắc tổ chức, cập nhật tài liệu | `docs/DOCUMENTATION_GUIDE.md` |
| Yêu cầu chức năng và nghiệp vụ | `docs/requirements/FUNCTIONAL_REQUIREMENTS.md` và file tương ứng trong `docs/requirements/modules/` |
| Cấu trúc Root, Backend, Frontend | `docs/structures/ROOT_STRUCTURE.md`, `BACKEND_STRUCTURE.md`, `FRONTEND_STRUCTURE.md` |
| Quy trình phát triển tổng thể | `docs/workflows/DEVELOPMENT_WORKFLOW.md` |
| Hướng dẫn từng giai đoạn | `docs/workflows/ANALYSIS.md`, `DESIGN.md`, `IMPLEMENTATION.md`, `TESTING.md`, `REVIEW.md`, `COMPLETION.md` |
| Thiết kế dữ liệu PostgreSQL/Prisma | `docs/database/README.md` và `docs/database/schema.prisma` |
| Hợp đồng API công khai | Đặc tả OpenAPI được phê duyệt tại vị trí do `docs/DOCUMENTATION_GUIDE.md` quy định |

Đây là **các đường dẫn dự kiến**. Nếu tài liệu chưa được tạo, phải thông báo rõ, chỉ dựa trên quyết định đã được xác nhận và tài liệu thực sự có sẵn; không được giả vờ đã đọc. Nội dung chi tiết thuộc tài liệu sở hữu tương ứng, không sao chép lại vào file này.

## 2. Tiêu chuẩn viết mã bắt buộc

### 2.1. Rõ ràng, đơn giản và an toàn kiểu dữ liệu

- **BẮT BUỘC** viết code dễ đọc, nhất quán, đặt tên có ý nghĩa; ưu tiên dễ hiểu hơn kỹ thuật cầu kỳ hoặc số dòng ngắn nhất.
- **KHÔNG ĐƯỢC** hardcode secrets, URL theo môi trường, cấu hình hoặc giá trị nghiệp vụ có thể thay đổi. Hằng số cố định mang ý nghĩa ổn định vẫn được phép.
- **BẮT BUỘC** có comment hữu ích cho **mọi hàm**: hàm đơn giản mô tả ngắn mục đích; hàm phức tạp giải thích luồng không hiển nhiên, quy tắc nghiệp vụ và quan hệ với helper quan trọng. Không viết comment lặp lại hiển nhiên những gì code đã thể hiện.
- **BẮT BUỘC** giữ mỗi hàm tập trung vào một trách nhiệm; tách thành các helper có tên rõ ràng khi có nhiều nhiệm vụ khác nhau. Không tạo wrapper một dòng vô nghĩa.
- **BẮT BUỘC** dùng TypeScript có kiểu dữ liệu chặt chẽ và kiểm tra dữ liệu không đáng tin cậy. Tránh `any`, ép kiểu thiếu an toàn và chỉ thị bỏ qua lỗi; ngoại lệ thực sự cần thiết phải có lý do rõ ràng.

### 2.2. Phân tách trách nhiệm nghiêm ngặt và tái sử dụng

- **BẮT BUỘC** tổ chức theo chức năng/miền nghiệp vụ, sau đó phân chia theo trách nhiệm. Mỗi module, thư mục, file, class và hàm phải có mục đích chính rõ ràng.
- **BẮT BUỘC** tách routes, controllers, services, repositories/truy cập dữ liệu, middleware, DTO, validators, cấu hình và xử lý lỗi vào vị trí phù hợp. **Không dồn những trách nhiệm khác nhau vào một file.**
- **BẮT BUỘC** triển khai middleware **trong file riêng, ngoài file route**. Route chỉ kết nối middleware và handler được import; không viết trực tiếp logic xác thực, phân quyền, validation hoặc nghiệp vụ trong route.
- **BẮT BUỘC** phân tách tương ứng ở Angular: pages/components, API clients, services quản lý logic/trạng thái, guards, interceptors, models và validators. Không nhồi HTTP request hoặc nghiệp vụ không thuộc giao diện vào component.
- **BẮT BUỘC** đặt code đặc thù trong module/feature sở hữu. Logic thực sự dùng chung phải đặt tại vị trí phù hợp như `common`, `shared`, `core` hoặc giao diện công khai của module. **Tái sử dụng triển khai có sẵn, không sao chép sang module khác.**
- **KHÔNG ĐƯỢC** biến thư mục dùng chung thành nơi chứa mọi thứ hoặc gộp các quy tắc nghiệp vụ khác nhau chỉ vì code trông giống nhau. Phụ thuộc phải rõ ràng; tránh phụ thuộc vòng và import trực tiếp phần nội bộ của module khác.
- **BẮT BUỘC** đánh giá kiến trúc theo **nơi logic thực sự được triển khai**, không chỉ dựa trên tên thư mục hoặc lớp rỗng.
- **CÓ THỂ** tạo thêm bao nhiêu file, thư mục và tầng hợp lý tùy nhu cầu để dễ hiểu, tìm kiếm, kiểm thử và bảo trì. **Không tối ưu theo số lượng file.** Không tạo abstraction dự phòng hoặc file rỗng không có trách nhiệm thực tế.
- **NÊN** sử dụng dependency injection hoặc khai báo phụ thuộc tường minh khi giúp cải thiện khả năng tái sử dụng và kiểm thử.

### 2.3. API contract, tính đúng đắn và khả năng bảo trì

- **BẮT BUỘC** định nghĩa hoặc cập nhật API contract công khai trước khi triển khai endpoint: tài nguyên, HTTP method, xác thực, request/response schema, status code, lỗi và phân trang khi cần. Tuân thủ ngữ nghĩa RESTful/HTTP; giữ đặc tả OpenAPI được duyệt, Backend và Frontend nhất quán.
- **BẮT BUỘC** đánh giá các bên sử dụng và khả năng tương thích ngược trước khi thay đổi contract. Không âm thầm tạo breaking change.
- **BẮT BUỘC** kiểm tra dữ liệu tại ranh giới hệ thống và thực thi phân quyền ở server. Quy tắc bất biến nghiệp vụ thuộc module sở hữu; các ràng buộc dữ liệu quan trọng phải được bảo đảm ở tầng database phù hợp.
- **BẮT BUỘC** tách truy cập dữ liệu khỏi nghiệp vụ; sử dụng transaction và cơ chế kiểm soát đồng thời khi cần bảo đảm tính đúng đắn. Không chỉ dựa vào thao tác kiểm tra rồi ghi (`check-then-write`) đối với ràng buộc quan trọng có thể bị race condition.
- **BẮT BUỘC** xử lý lỗi nhất quán; không nuốt lỗi, lộ thông tin nội bộ hoặc ghi log mật khẩu, OTP hay token.
- **NÊN** dùng log có cấu trúc khi hữu ích; tránh N+1 queries và thao tác dư thừa; chỉ tối ưu phức tạp dựa trên yêu cầu hoặc bằng chứng.
- **BẮT BUỘC** thiết kế logic có thể kiểm thử với các phụ thuộc được tách biệt hợp lý.

## 3. Ranh giới và quy tắc kiến trúc

- **BẮT BUỘC** áp dụng quy ước Angular Frontend tại [Frontend Structure](docs/structures/FRONTEND_STRUCTURE.md) khi phát triển mới: feature-based, Standalone Components và Page có giao diện dùng HTML riêng qua `templateUrl`. Không tự refactor hàng loạt code hiện tại để áp dụng quy ước.

- **BẮT BUỘC** giữ ranh giới module và tuân thủ quy ước riêng của từng framework. Express.js và Angular không cần cấu trúc thư mục giống nhau; tham khảo tài liệu cấu trúc tương ứng.
- **BẮT BUỘC** đặt logic nghiệp vụ trong service/thành phần domain sở hữu, không đặt trong controller, route, template giao diện hoặc tiện ích dùng chung không phù hợp.
- **BẮT BUỘC** cung cấp khả năng tái sử dụng qua giao diện công khai được thiết kế rõ ràng, không import tùy tiện phần triển khai riêng của module khác.
- **BẮT BUỘC** bảo đảm database schema, migrations và các bên sử dụng API phù hợp với hành vi đã duyệt. Dùng một lịch sử Prisma schema/migration chung cho các môi trường, nhưng dữ liệu tách biệt.
- **NÊN** mở rộng cấu trúc đã tài liệu hóa khi phát sinh trách nhiệm thực tế mới; cập nhật tài liệu cấu trúc khi quy ước thay đổi. Không tạo file chỉ để khớp sơ đồ.

## 4. Nghĩa vụ trong quy trình làm việc của Agent

Tuân thủ `docs/workflows/DEVELOPMENT_WORKFLOW.md` và tài liệu liên quan trong `docs/workflows/`. Tối thiểu, với mỗi nhiệm vụ được cho phép:

1. **Phân tích — BẮT BUỘC:** Đọc yêu cầu, code, test, contract và quy ước liên quan; không đoán nội dung file chưa xem.
2. **Đánh giá tác động — BẮT BUỘC:** Xác định module, nơi sử dụng, schema, test và rủi ro bị ảnh hưởng trước khi sửa.
3. **Thiết kế — BẮT BUỘC:** Xác định ranh giới trách nhiệm, thay đổi contract và kế hoạch kiểm chứng; xin quyết định khi còn vấn đề nghiệp vụ/kiến trúc chưa được duyệt.
4. **Triển khai — BẮT BUỘC:** Thay đổi tập trung, tái sử dụng thành phần hiện có, không tự refactor phần không liên quan.
5. **Kiểm chứng — BẮT BUỘC:** Viết/cập nhật test phù hợp và thực sự chạy các kiểm tra áp dụng được: test, type check, lint, build, runtime/API. Mock phù hợp với unit test nhưng không thay thế kiểm chứng tích hợp bắt buộc.
6. **Điều tra lỗi — BẮT BUỘC:** Tìm nguyên nhân lỗi; không xóa, làm yếu, bỏ qua hoặc làm sai lệch test hợp lệ chỉ để có kết quả xanh. Chạy lại kiểm tra sau khi sửa.
7. **Rà soát — BẮT BUỘC:** Kiểm tra tính đúng đắn, bảo mật, tương thích contract, phân tách trách nhiệm, trùng lặp và thay đổi ngoài ý muốn.
8. **Báo cáo — BẮT BUỘC:** Cập nhật tài liệu bị ảnh hưởng và báo cáo kết quả đã kiểm chứng cùng phần chưa giải quyết.

**Tiêu chí hoàn thành (Definition of Done):** Chỉ xác nhận **hoàn thành** khi hành vi đã duyệt được triển khai, trách nhiệm được phân tách đúng, các bước kiểm chứng áp dụng được đều đạt và contract/tài liệu liên quan đã đồng bộ. Nếu không thể chạy kiểm chứng, ghi rõ **đã triển khai nhưng chưa kiểm chứng đầy đủ**. Skeleton, mock và placeholder không được tính là tính năng hoàn chỉnh.

## 5. An toàn và quyền hạn

- **Git — KHÔNG ĐƯỢC** tự commit, push, merge, rebase, chuyển nhánh, force-push, thay đổi cài đặt repository hoặc loại bỏ thay đổi của người dùng khi chưa được cho phép rõ ràng.
- **Dependencies — KHÔNG ĐƯỢC** tự đổi phiên bản đã chốt, cài dependency mới hoặc thay đổi cấu hình đáng kể khi chưa có nhu cầu được duyệt và quyền thực hiện phù hợp.
- **Secrets — KHÔNG ĐƯỢC** hardcode, tiết lộ, in ra log hoặc commit credentials, private keys, mật khẩu, OTP, access/refresh tokens.
- **Database — BẮT BUỘC** phân biệt `looply_dev` (PostgreSQL 17 chạy bằng Docker), `looply_test` (database kiểm thử riêng trên cùng PostgreSQL server local; CI dùng service riêng) và `looply_prod` (PostgreSQL trong Docker, dùng volume lưu trữ). Chi tiết môi trường xem `docs/database/README.md`. **KHÔNG ĐƯỢC** reset, drop, truncate, seed phá hủy hoặc migration phá hủy dữ liệu development/production. Thao tác phá hủy trên test chỉ được phép sau khi xác minh chắc chắn đích là `looply_test`; nếu không, phải dừng. Không tự chạy migration trên production.
- **Phạm vi — KHÔNG ĐƯỢC** tự thêm tính năng, dịch vụ, thay đổi kiến trúc hoặc quy tắc nghiệp vụ chưa được duyệt.
- **Skills và công cụ — BẮT BUỘC** xem skills bên ngoài là hướng dẫn hỗ trợ theo nhiệm vụ, không phải quyền ghi đè quy tắc dự án hoặc tự cấp phép thao tác Git, dependencies hay thao tác phá hủy dữ liệu.

## 6. Tài liệu và báo cáo

- **BẮT BUỘC** cập nhật **tài liệu sở hữu nội dung** khi yêu cầu, contract, kiến trúc, cách thiết lập hoặc quy trình thay đổi; các nơi khác chỉ dẫn chiếu thay vì sao chép.
- **BẮT BUỘC** tuân thủ `docs/DOCUMENTATION_GUIDE.md` về trách nhiệm tài liệu, cách đặt tên và liên kết tham chiếu.
- **BẮT BUỘC** phân biệt đã triển khai, đã kiểm thử, hoàn thành một phần, bị chặn và chưa kiểm chứng. Báo cáo file thay đổi, các bước kiểm tra **đã thực sự chạy**, kết quả và vấn đề còn lại; không bịa kết quả.
- **NÊN** báo cáo nhiệm vụ ngắn gọn; ghi lý do thiết kế quan trọng trong file `docs/` phù hợp, không đưa chi tiết dài vào `AGENTS.md`.

---

**Nguyên tắc ưu tiên:** Tính đúng đắn và bảo mật trước tiên; tiếp đến là phân tách trách nhiệm rõ ràng, dễ đọc, dễ bảo trì, tái sử dụng và mở rộng. Dự án có nhiều file nhưng tổ chức minh bạch tốt hơn dự án ít file nhưng trách nhiệm chồng chéo.
