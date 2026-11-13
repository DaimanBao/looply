# Backend CI — GitHub Actions

## Phạm vi và trigger

Workflow [`backend-ci.yml`](../../.github/workflows/backend-ci.yml) chạy một job `Backend checks` khi có Pull Request nhắm vào `develop`/`main`, hoặc push lên hai nhánh này. Không lọc theo đường dẫn, không dùng matrix hoặc cache. Frontend chưa nằm trong workflow này.

Job dùng Ubuntu, Node.js 24, PostgreSQL 17 và Redis 7.4 riêng cho từng lần chạy. Token chỉ có quyền `contents: read`; checkout không lưu credentials cho các bước tiếp theo. Job có timeout 15 phút.

## Database và an toàn

- PostgreSQL service tạo mới database `looply_test`; health check dùng `pg_isready`, có timeout và retry.
- `DATABASE_URL` và `TEST_DATABASE_URL` cùng trỏ tới service trên runner. User/password trong YAML là giá trị tạm công khai chỉ phục vụ container CI, không phải secrets hoặc thông tin database trên máy phát triển.
- Sau `npm ci`, workflow dùng lại [`getTestDatabaseUrl` và `verifyTestDatabase`](../../backend/tests/helpers/test-database.ts): yêu cầu URL PostgreSQL có tên database chính xác, hai URL khớp nhau và `SELECT current_database()` trả về `looply_test` trước khi chạy migration.
- Migration chỉ chạy qua `prisma migrate deploy --config prisma7.config.ts`; không reset, db push, seed hoặc truy cập dev/prod.
- Các integration test giữ nguyên helper và fixture hiện có: xác minh database trên connection thực tế, dùng transaction và rollback. Không nới lỏng schema, migration hoặc kỳ vọng test cho CI.
- Container CI không có volume dữ liệu lâu dài; mỗi job bắt đầu bằng database mới.
- Auth/User integration tests dùng `TEST_REDIS_URL` trỏ Redis service riêng, database `/15`; helper xác minh database thực tế qua CLIENT INFO, mỗi fixture có namespace UUID, chỉ SCAN/DEL namespace của mình và không FLUSHDB. Không cần Google/SMS/email/S3 credentials thật trong CI; fake chỉ tại provider boundary, Google SDK vẫn có test chữ ký RSA/claims.

## Trình tự kiểm tra

Mọi lệnh `run` có working directory là `backend/`:

1. `npm ci` cài đúng dependencies từ `backend/package-lock.json`.
   Provision FFprobe/FFmpeg bằng `node ../scripts/setup-video-tools.mjs ../.video-tools`: tải artifact Windows/Linux x64 được pin theo source build, xác minh SHA-256 trước extraction, xác minh version và xuất đường dẫn qua `GITHUB_ENV`. Unit/integration video dùng executable thật, không skip khi thiếu công cụ.
2. Kiểm tra Prisma CLI, `@prisma/client`, `@prisma/adapter-pg` thực tế đều là `7.10.1`, rồi hiển thị `prisma --version`.
3. `npm exec -- prisma validate --config prisma7.config.ts`.
4. `npm exec -- prisma generate --config prisma7.config.ts` sinh client bị Git ignore, cần cho typecheck, build và Prisma integration test trên checkout mới.
5. Xác minh database CI như trên.
6. `npm exec -- prisma migrate deploy --config prisma7.config.ts` áp dụng toàn bộ lịch sử migration vào database mới.
7. `npm test`, `npm run test:api` và `npm run test:integration`.
8. `npm run typecheck` và `npm exec -- tsc --project tests/tsconfig.json`.
9. `npm run build`.

Backend Core thêm script `test:api`, config `vitest.api.config.ts` và bước API integration riêng vào workflow. Cấu hình Prisma, config unit/database test và database helpers được giữ nguyên. Workflow truyền environment riêng và chỉ rõ tên config Prisma thực tế. CI dừng tại bước thất bại, không bỏ qua hoặc tự sửa test.

## Kiểm chứng workflow

Kết quả local giai đoạn thiết lập CI ngày 12/11/2026, trước Backend Core: đã replay nguyên 11 bước `run` trong YAML trên container Linux `node:24-bookworm` (Node.js 24.22.3) cùng PostgreSQL 17 tạo mới. Backend được lấy từ Git, không sao chép `.env`, `node_modules` hoặc generated client từ máy phát triển. Workflow hiện có thêm bước API test; kết quả kiểm chứng Backend Core thuộc [`backend/README.md`](../../backend/README.md).

| Kiểm tra đã thực sự chạy | Kết quả |
| --- | --- |
| `actionlint` trên workflow | PASS. |
| `npm ci` và kiểm tra ba package Prisma | PASS; tất cả đúng `7.10.1`. |
| Prisma validate / generate | PASS trên Linux. |
| Guard database trước migration | PASS; URL test và database thực tế đều là `looply_test`. Hai ca URL không khớp hoặc cùng nhắm `looply_dev` giả lập đều bị từ chối trước migration. |
| Migrate deploy trên PostgreSQL container mới | PASS; áp dụng đủ `0001_init`, `0002_fix_media_duration`, `0003_reject_nan_prices`. |
| Unit / Database Integration Test | PASS: 1/1 unit và 337/337 integration test, 16 file integration. |
| Typecheck source / source và test / build | Tất cả PASS. |

- Dùng `actionlint` để kiểm tra cú pháp và ngữ nghĩa GitHub Actions, bao gồm action inputs và shell script trong YAML.
- Có thể thử các lệnh backend trên Node.js 24 và PostgreSQL 17 tạm, với cả hai URL được đặt cho `looply_test`. Không sao chép URL CI để chạy trên database local hiện hữu.
- Local rehearsal không thay thế một run trên GitHub: trigger PR/push, tải actions, môi trường Ubuntu runner, quyền token, pull service image và check hiển thị trên PR chỉ được xác nhận khi GitHub Actions chạy thực tế.
- Workflow không tự thiết lập branch protection hoặc required status checks. Sau khi có run thành công, việc bắt buộc check `Backend checks` trước merge cần cấu hình repository riêng nếu được phê duyệt.
- Cảnh báo Vitest về ESM syntax trong config CommonJS vẫn xuất hiện, nhưng không làm test thất bại; chưa thay cấu hình Vitest ngoài phạm vi này.

Tham khảo nguồn chính thức: [PostgreSQL service trên GitHub Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [setup-node v6 và tùy chọn tắt cache](https://github.com/actions/setup-node/tree/v6), [actionlint](https://github.com/rhysd/actionlint).
