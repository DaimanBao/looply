# Looply — Tech Stack (Đồ án 1)

> Nguồn tham chiếu công nghệ dành cho AI Agent. Chỉ mô tả công nghệ, vai trò và ràng buộc; **không chứa hướng dẫn cài đặt**. Trạng thái “đã chọn” không đồng nghĩa đã triển khai hoặc kiểm thử thành công.

## Kiến trúc và nền tảng

- **Kiến trúc:** Modular Monolith; một sản phẩm, Backend Express.js và Frontend Angular tách biệt.
- **Runtime / quản lý gói:** Node.js 24, npm; lưu và tôn trọng `package-lock.json`.
- **Ngôn ngữ:** TypeScript cho cả Backend và Frontend.
- **Database:** PostgreSQL **17**, development chạy bằng Docker; Prisma **7.10.1**. `looply_dev`, `looply_test`, `looply_prod` phải tách biệt; production dùng PostgreSQL Docker volume bền vững. Chi tiết môi trường xem [`database/README.md`](database/README.md).
- **Triển khai:** Docker / Docker Compose; GitHub Actions cho CI.

## Backend

| Chức năng | Công nghệ |
|---|---|
| HTTP / REST API | Express.js 5 (`5.3.0` ở cấu hình cũ) |
| ORM / PostgreSQL | Prisma 7.10.1, `@prisma/client`, `@prisma/adapter-pg`, `pg` |
| Auth / Security | `argon2`, `jose`, `google-auth-library`, `express-rate-limit`, `helmet`, `cors` |
| Validation | `zod` |
| Upload / xử lý ảnh | `multer`, `sharp` |
| Realtime chat / notification | `socket.io` |
| Logging / config | `pino`, `pino-http`, `dotenv` |
| API contract / tài liệu | OpenAPI 3.1, `@scalar/express-api-reference` |
| Object storage client | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| Background jobs | PostgreSQL outbox + Node.js worker |
| OTP / re-authentication tạm thời | Redis đã được duyệt cho triển khai tương lai; chưa cài client, cấu hình dịch vụ hoặc thay bảng OTP hiện có |
| Tests | Vitest, `@vitest/coverage-v8`, Supertest |
| Development / code quality | `tsx`, ESLint, `typescript-eslint`, Prettier |

## Frontend

| Chức năng | Công nghệ |
|---|---|
| Framework | Angular 21, TypeScript |
| Routing / API | Angular Router, HttpClient |
| State / forms | Angular Signals, Reactive Forms, RxJS |
| UI / styles | Angular Material, Angular CDK, SCSS |
| Realtime | `socket.io-client` |
| Icons | `lucide-angular` |
| API types | `openapi-typescript` (sinh từ OpenAPI contract) |
| Unit / component tests | Angular TestBed và test runner tương thích Angular 21 (ưu tiên cấu hình CLI) |
| E2E | Playwright |
| Code quality | Angular ESLint, Prettier |

## Tích hợp chưa chốt nhà cung cấp

- **SMS OTP:** dùng interface/adapter `SmsProvider`; chưa chọn dịch vụ SMS tại Việt Nam. Mock/fake chỉ dùng cho test hoặc demo có ghi rõ, không giả định là xác minh SMS thật.
- **Media storage:** ưu tiên Cloudflare R2, giao thức S3-compatible; chưa chốt tài khoản, bucket, chính sách và chi phí.
- **SSR/SSG:** chưa chốt; ưu tiên Angular client-rendered khi khởi tạo, xem xét lại nếu cần SEO bài đăng.

## Quy tắc cho Agent

- Phạm vi chỉ **Đồ án 1**: Auth, User, Listing, Media, Chat, Transaction Proposal, Notification, Reminder; không triển khai Admin Java/Spring Boot của Đồ án 2.
- Không tự thêm/thay thế framework, thư viện lớn, nhà cung cấp dịch vụ hoặc nâng major version khi chưa được duyệt.
- Không dùng NgRx, RabbitMQ hay microservices nếu chưa có yêu cầu mới. Redis chỉ được duyệt cho OTP, re-authentication và giới hạn tần suất dùng chung; việc tích hợp thuộc nhiệm vụ sau.
- Giữ REST API contract đồng bộ giữa Backend/Frontend; kiểm tra build, test và tích hợp thực tế, không coi việc cài dependency là hoàn thành chức năng.
- Quy tắc nghiệp vụ xem trong `requirements/`; cấu trúc code xem trong `structures/`; quy trình xem trong `workflows/DEVELOPMENT_WORKFLOW.md`.
