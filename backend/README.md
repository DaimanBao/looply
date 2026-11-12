# Looply Backend Core

Backend chạy Express 5, TypeScript và Prisma ORM 7.10.1; Node.js 24. Chỉ có endpoint production **`GET /api/health`**, giữ nguyên body `{ "status": "ok", "service": "looply-backend" }`. Auth, User, Listing, Media, Chat, Notification và Reminder chưa được triển khai.

## Cấu hình và chạy

Các lệnh dưới đây chạy từ `backend/`. Tạo `.env` cục bộ từ `.env.example`, tự điền cấu hình phù hợp; không commit hoặc in credentials. Tách biệt Development/Testing theo [`docs/database/README.md`](../docs/database/README.md). Server **không tự migrate hoặc seed** khi khởi động.

```powershell
npm ci
npm exec -- prisma generate --config prisma7.config.ts
npm run dev
```

Production build sử dụng `npm run build`, rồi `npm start`. `prisma:generate` được giữ nguyên để tương thích; khi cần config CLI, dùng lệnh generate có `--config prisma7.config.ts` như trên.

| Biến | Mặc định / quy tắc |
| --- | --- |
| `NODE_ENV` | `development`; chỉ chấp nhận `development`, `test`, `production`. |
| `DATABASE_URL` | Bắt buộc cho Development/Production; database tương ứng phải là `looply_dev`/`looply_prod`. |
| `TEST_DATABASE_URL` | Bắt buộc khi `NODE_ENV=test`; luôn được chọn thay vì fallback sang `DATABASE_URL`. Database phải là `looply_test`. |
| `PORT`, `HOST` | `3000`, `0.0.0.0`; port 1–65535. |
| `DATABASE_CONNECT_TIMEOUT_MS` | `5000`; giới hạn 1–60000 ms. |
| `SHUTDOWN_TIMEOUT_MS` | `10000`; giới hạn 1–120000 ms, áp dụng cả drain HTTP và disconnect database. |
| `LOG_LEVEL` | `info`; có thể dùng `silent` cho test. |
| `CORS_ORIGINS` | Rỗng; danh sách origin HTTP(S) phân tách bằng dấu phẩy, không wildcard/path/credentials. |
| `CORS_CREDENTIALS` | `false`; chỉ chấp nhận chuỗi `true`/`false`. Không quyết định token transport của Auth tương lai. |
| `JSON_BODY_LIMIT_BYTES` | `1048576`; giới hạn 1–10485760 byte. Chưa có upload multipart. |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | `60000`, `100`; window tối đa 2147483647 ms. Quota theo IP trực tiếp, process-local, áp dụng `/api`, kể cả health. |

Không tin proxy headers trong Core. Khi có triển khai reverse proxy thực tế, phải xác định cấu hình trust proxy phù hợp trước khi thay đổi. Mặc định CORS chặn các origin cross-site chưa khai báo; request không có Origin vẫn được xử lý.

## Phân tách trách nhiệm

| Thành phần | Trách nhiệm |
| --- | --- |
| `src/app.ts` | App factory nhận HTTP config, logger và các Router feature; không đọc environment hoặc tạo database client. |
| `src/bootstrap.ts` | Ghép dependencies thực tế: app, logger, Prisma và HTTP server. |
| `src/server.ts` | Load environment, khởi động runtime, nối SIGINT/SIGTERM. |
| `src/runtime/server-runtime.ts` | Connect trước listen; startup failure cleanup; drain request trước disconnect; shutdown idempotent và có deadline. |
| `src/config/` | Zod validation/normalization; kiểm tra database boundary; lỗi config chỉ có tên field, không chứa giá trị. |
| `src/shared/database/` | Factory PrismaPg/PrismaClient, không có singleton đọc environment lúc import. Service/repository tương lai nhận client hoặc `DatabaseTransaction`, dùng `$transaction` native. |
| `src/shared/errors/`, `middleware/` | Lỗi công khai, ánh xạ lỗi Prisma, request ID, logging, Helmet/CORS/rate limit/validation, 404/JSON errors. |
| `src/shared/http/` | Serialize Decimal hữu hạn thành chuỗi và helper cursor page; không tự serialize model database. |
| `src/routes/` | Health router chỉ nối handler được import; controller giữ response tương thích. |

Signal shutdown được quản lý ngoài HTTP app. Trong deadline, runtime chờ request đang chạy rồi disconnect Prisma. Nếu quá hạn, đóng các HTTP connection còn lại; entrypoint kết thúc với exit code lỗi. Runtime có thể kiểm thử bằng database lifecycle fake, không cần database thật.

Module tương lai mount Router qua `featureRouters`; Router tự nối middleware xác thực được import khi Auth tồn tại. Không có auth placeholder cho phép bỏ qua xác thực, DI container, worker hoặc Socket.IO trong Core.

Hợp đồng HTTP thuộc [`docs/api/openapi.json`](../docs/api/openapi.json), quy ước lỗi/DTO/pagination thuộc [`docs/api/CONVENTIONS.md`](../docs/api/CONVENTIONS.md). Không thay đổi API công khai chỉ qua code. Log request chỉ chọn metadata an toàn, bỏ URL/query/body/headers; exception chỉ ghi mã lỗi và request ID. Logger còn redact các trường secret đã biết; caller vẫn không được đưa secret vào chuỗi message hoặc field tùy ý.

## Kiểm thử

```powershell
npm test
npm run test:api
npm run test:integration
npm run typecheck
npm exec -- tsc --project tests/tsconfig.json
npm exec -- prisma validate --config prisma7.config.ts
npm run build
```

- Unit tests ở `src/**/*.spec.ts`: config, lỗi Prisma, serialization, pagination, logging và lifecycle bằng dependency fake.
- API tests ở `tests/api/`: dùng app factory và Router synthetic; không load `.env`, tạo Prisma client hay kết nối database. Các route synthetic không được mount ở production hoặc đưa vào OpenAPI.
- Database regression ở `tests/integration/`: các constraint và migration compatibility test dùng helper xác minh `TEST_DATABASE_URL` và `SELECT current_database()` đúng `looply_test`; không fallback sang Development. Kết quả mới nhất sau chuẩn bị Auth/User thuộc [Database Integration Tests](../docs/database/INTEGRATION_TESTS.md).
- Transaction rollback của helper `pg` chỉ bao phủ connection đó. API use case tương lai chạy qua pool/connection khác cần transaction được inject đúng hoặc fixture có ID riêng và cleanup an toàn trên `looply_test`.
- CI được bổ sung bước `test:api`; giữ các bước test database/typecheck/validate/build. Chi tiết trigger và PostgreSQL service thuộc [`docs/workflows/CI.md`](../docs/workflows/CI.md).

## Kết quả kiểm chứng ngày 12/11/2026

| Kiểm tra đã chạy | Kết quả |
| --- | --- |
| Unit | **68/68 PASS**, 7 file. |
| API integration | **23/23 PASS**, 1 file. |
| Database integration | **337/337 PASS**, 16 file, sau khi xác minh database thực tế và ba migration trên `looply_test`. Không thay đổi test cũ. |
| Typecheck source và source/test | PASS. |
| Prisma validate 7.10.1 | PASS; không chạy migration. |
| Build | PASS. |
| Runtime đã build | Startup với `looply_test`, HTTP health, native Prisma transaction chỉ `SELECT current_database()`, graceful shutdown: PASS. |

Dependencies mới: Zod 4.6.7 (validation), Helmet 8.3.0 (headers), CORS 2.8.6, express-rate-limit 8.7.4, Pino 10.4.0 và pino-http 11.0.0 (structured access logging), cùng `@types/cors` 2.8.19 cho TypeScript. Chỉ các dependency mới được thêm; các dependency cũ tiếp tục dùng version trong lockfile.

Không triển khai chính sách OTP, Access/Refresh Token hoặc Google Login trong Core. Các câu hỏi nghiệp vụ/contract đã nhận diện ở giai đoạn phân tích vẫn cần giải quyết khi triển khai Auth/User. Cảnh báo Vitest/CommonJS hiện tại không làm kiểm tra thất bại. Workflow CI đã cập nhật nhưng chưa có GitHub Actions run cho thay đổi Core chưa commit này.
