# Hướng dẫn chạy test local Looply

Hướng dẫn thực hành trên Windows PowerShell, từ repository `E:\DO-AN\looply`. Không cần chỉnh sửa source code để chạy các lệnh này.

## 1. Phân biệt môi trường và loại test

| Môi trường | Database | Biến cấu hình | Mục đích |
| --- | --- | --- | --- |
| Development | `looply_dev` | `DATABASE_URL` | Chạy ứng dụng, giữ dữ liệu dùng thử của bạn |
| Test | `looply_test` | `TEST_DATABASE_URL` | Integration test tạo dữ liệu riêng rồi rollback hoặc cleanup dữ liệu của fixture |
| Production | `looply_prod` | `DATABASE_URL` tại production | Dữ liệu vận hành thật; không dùng để chạy test |

Hai database local có thể nằm trên cùng PostgreSQL server nhưng dữ liệu và trạng thái migration độc lập. Áp dụng migration cho `looply_dev` không cập nhật `looply_test`, và ngược lại.

| Lệnh, chạy tại thư mục tương ứng | Nhóm kiểm tra | Chuẩn bị chính |
| --- | --- | --- |
| Backend: `npm test` | Unit test `src/**/*.spec.ts` | Dependencies, Prisma Client; các test video thực cần công cụ video |
| Backend: `npm run test:api` | API test `tests/api/**/*.test.ts` | Dependencies và các fixture của API test |
| Backend: `npm run test:integration` | Integration test `tests/integration/**/*.test.ts` | PostgreSQL test đã migrate, Redis test riêng, công cụ video khi chạy test video |
| Frontend: `npm test -- --watch=false` | Angular unit/component test | Dependencies Frontend; không cần bật Backend cho các test dùng mock HTTP |
| Chrome E2E | Luồng UI với Backend và hạ tầng thật tại local | PostgreSQL/Redis test, Chrome, dependencies của cả hai phía |

Script test không tự bật Docker, tạo database hoặc áp dụng migration. Hướng dẫn bên dưới dùng entrypoint Vitest trực tiếp khi cần nạp cả `.env` và `video.env`.

## 2. Chuẩn bị lần đầu hoặc khi đổi máy

### 2.1. Kiểm tra công cụ và dependencies

```powershell
cd E:\DO-AN\looply
node --version
npm --version
docker --version
```

Dùng phiên bản đã chốt trong [Tech Stack](../TECH_STACK.md), gồm Node.js 24. Bật Docker Desktop trước các bước tiếp theo.

Nếu chưa có `node_modules`, hoặc lockfile vừa thay đổi, cài đúng dependencies đã khóa:

```powershell
cd E:\DO-AN\looply\backend
npm ci

cd E:\DO-AN\looply\frontend
npm ci
```

Không cần chạy `npm ci` trước mỗi lần test. Nếu lệnh thất bại, xử lý lỗi cài đặt trước khi tiếp tục.

### 2.2. Bật PostgreSQL và Redis

```powershell
cd E:\DO-AN\looply
docker compose up -d postgres redis
docker compose ps
```

Cả hai service phải chạy, chờ healthcheck báo healthy. Cổng mặc định của Compose hiện tại là PostgreSQL `5435` và Redis `6380`; nếu bạn đã đổi cấu hình thì dùng cổng thực tế.

Compose dùng volume PostgreSQL hiện có `looply-rebuild_postgres_data`. Nếu báo thiếu volume, xem [Database README](../database/README.md) để xử lý thiết lập; không xóa volume hay dùng `down -v` để thử chữa lỗi.

### 2.3. Kiểm tra cấu hình test

Trong `backend/.env`, bảo đảm:

- `DATABASE_URL` vẫn dành cho `looply_dev`.
- `TEST_DATABASE_URL` là PostgreSQL URL trỏ đến `/looply_test`, có đúng host, port và tài khoản được cấp quyền trên database này. Không dùng tham số `dbname` hoặc `database` để ghi đè đích kết nối.
- `TEST_REDIS_URL` dùng Redis database riêng khác `/0`; với cấu hình local mặc định có thể dùng `redis://127.0.0.1:6380/15`.

Database `looply_test` phải tồn tại. Nếu chưa có, dùng pgAdmin/DBeaver kết nối PostgreSQL local và tạo database trống tên `looply_test`, với owner phù hợp tài khoản test. Không cần tự thêm user, bài đăng hoặc hội thoại.

Không chia sẻ nội dung `.env`, URL có mật khẩu hoặc token khi gửi log lỗi. Biến đã export trong PowerShell có thể được ưu tiên hơn giá trị từ `--env-file`; dùng terminal mới nếu nghi còn cấu hình cũ.

### 2.4. Xác minh đích thật và áp dụng migration cho test

Chạy nguyên khối dưới đây tại `backend`. Script đọc `.env`, kiểm tra URL và `SELECT current_database()` trước khi gọi Prisma. `DATABASE_URL` chỉ được đổi trong tiến trình Prisma con, không sửa file `.env` hoặc môi trường PowerShell.

```powershell
cd E:\DO-AN\looply\backend

@'
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');

// Xác minh database thực trước khi áp dụng migration kiểm thử.
async function main() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Missing TEST_DATABASE_URL');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.pathname !== '/looply_test' ||
      url.searchParams.has('dbname') || url.searchParams.has('database')) {
    throw new Error('Refusing a database URL outside looply_test');
  }
  const client = new Client({ connectionString: value, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query('SELECT current_database() AS name');
    if (result.rows[0]?.name !== 'looply_test') {
      throw new Error('Refusing migrations outside looply_test');
    }
  } finally {
    await client.end();
  }
  console.log('Verified database: looply_test');
  const result = spawnSync(process.execPath, [
    'node_modules/prisma/build/index.js', 'migrate', 'deploy',
    '--config', 'prisma7.config.ts'
  ], { env: { ...process.env, DATABASE_URL: value }, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error('Migration failed; do not start tests');
  }
}

// Báo lỗi an toàn, không in URL kết nối hoặc thông tin xác thực.
main().catch(() => {
  console.error('Test database preparation failed. Check connection and migration output.');
  process.exitCode = 1;
});
'@ | node --env-file=.env -
```

Chỉ tiếp tục khi lệnh thành công. `migrate deploy` áp dụng migration còn thiếu, không reset hoặc seed database. Khi checkout code có migration mới, chạy lại bước này. Không chạy nhiều integration suite hoặc migration test cùng lúc trên cùng `looply_test`.

### 2.5. Generate Prisma Client

```powershell
cd E:\DO-AN\looply\backend
npx prisma generate --config prisma7.config.ts
```

Chạy lại khi Prisma schema thay đổi hoặc sau khi cài dependencies nếu client chưa được generate. Lệnh generate không áp dụng migration.

### 2.6. Chuẩn bị FFmpeg/FFprobe

```powershell
cd E:\DO-AN\looply
node scripts/setup-video-tools.mjs
Test-Path .video-tools/video.env
```

Kết quả kiểm tra file phải là `True`. Script provision công cụ theo bản/hash đã chốt và tạo đường dẫn dành riêng cho máy hiện tại. Nếu đã chuẩn bị và công cụ vẫn hoạt động thì không cần tải lại. Chi tiết thuộc [Backend README](../../backend/README.md#provision-ffprobeffmpeg).

## 3. Chạy test Backend

Các lệnh trong mục này chạy tại `E:\DO-AN\looply\backend`. Không cần chạy sẵn `npm run dev` hoặc Frontend.

### Unit test

```powershell
node --env-file=.env --env-file=../.video-tools/video.env node_modules/vitest/vitest.mjs run
```

Lệnh này chạy cùng nhóm test với `npm test`, đồng thời nạp rõ cấu hình công cụ video. Chỉ kiểm tra Chat policy khi sửa logic Chat:

```powershell
node --env-file=.env node_modules/vitest/vitest.mjs run src/modules/chat/chat-policy.spec.ts
```

### API test

```powershell
npm run test:api
```

### Integration test

Chỉ chạy Chat khi cần kiểm chứng Chat:

```powershell
node --env-file=.env --env-file=../.video-tools/video.env node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts chat-module.test.ts chat-realtime.test.ts
```

Khi cần chạy toàn bộ integration suite:

```powershell
node --env-file=.env --env-file=../.video-tools/video.env node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts
```

Lệnh cuối tương đương nhóm của `npm run test:integration`, nhưng nạp thêm hai env file. Không mặc định chạy toàn bộ suite sau mọi thay đổi nhỏ; chọn file hoặc module bị ảnh hưởng theo [Testing workflow](../workflows/TESTING.md).

Test tạo dữ liệu qua fixture, rollback hoặc cleanup dữ liệu của mình. Không cần dùng tài khoản thật hoặc seed dữ liệu development để giúp test PASS. Không dùng `FLUSHDB`, `migrate reset`, drop hoặc truncate database để chữa lỗi hàng loạt.

## 4. Chạy test Frontend

```powershell
cd E:\DO-AN\looply\frontend
npm test -- --watch=false
```

Chỉ chạy test Chat:

```powershell
npm test -- --watch=false --include="src/app/features/chat/**/*.spec.ts"
```

Để làm việc ở chế độ theo dõi thay đổi, dùng `npm test`. Các unit/component test hiện tại không phải luồng đăng nhập và gọi database thật bằng trình duyệt.

## 5. Kiểm tra kiểu dữ liệu và build

Chạy khi thay đổi source hoặc cần kiểm chứng trước bàn giao; đây là các kiểm tra bổ sung, không thay thế test hành vi.

```powershell
cd E:\DO-AN\looply\backend
npm run typecheck
npm exec -- tsc --project tests/tsconfig.json
npm run build

cd E:\DO-AN\looply\frontend
npx ngc -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.spec.json
npm run build
```

Chạy từng lệnh và kiểm tra kết quả trước khi chuyển bước. Chỉ thay đổi Markdown thì kiểm tra nội dung, liên kết và `git diff --check`, không cần build hoặc chạy test ứng dụng.

## 6. Chrome E2E — tùy phạm vi cần kiểm chứng

Đây là kiểm tra UI với PostgreSQL/Redis test thật, không phải unit test. Xem điều kiện và giới hạn tại [Frontend README](../../frontend/README.md) và [kết quả kiểm chứng](../database/INTEGRATION_TESTS.md).

Chuẩn bị dependencies hai phía, migration test và công cụ video theo mục 2, đồng thời cài Chrome. Dừng các tiến trình local đang chiếm cổng `3000`, `4200`, `9230`; chế độ Chat còn cần `9231`. Harness tự khởi động Backend/Frontend và trình duyệt test, không dùng Backend dev đang mở.

Từ thư mục gốc, chạy luồng Listing hoặc Chat theo phần cần kiểm tra:

```powershell
cd E:\DO-AN\looply
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs
```

```powershell
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat
```

Artifacts của harness ở `frontend/tmp/listing-e2e/`. Fixture dùng provider SMS/email giả tại ranh giới; kết quả không xác nhận provider production, live S3 hoặc các trình duyệt khác.

## 7. Khi test fail hàng loạt

Đọc lỗi đầu tiên và phần setup/beforeAll trước tổng số FAIL. Một lỗi hạ tầng dùng chung có thể làm nhiều test cùng thất bại; chưa thể kết luận tất cả là lỗi code hoặc lỗi môi trường nếu chưa xem log.

| Dấu hiệu | Kiểm tra tiếp theo |
| --- | --- |
| `TEST_DATABASE_URL is required` hoặc `Missing TEST_DATABASE_URL` | Biến trong `backend/.env`, thư mục hiện tại và cách nạp env |
| `must use looply_test`, `Unsafe ... database`, `Refusing ...` | Đích URL và tên database thực; giữ nguyên chốt an toàn, không chuyển test sang dev |
| `ECONNREFUSED`, connection timeout | Docker/service, host/port, firewall; xác định lỗi đến từ PostgreSQL hay Redis |
| Authentication failed hoặc database does not exist | Tài khoản/quyền kết nối và sự tồn tại của `looply_test` |
| `P2021`, `P2022`, table/column does not exist | Migration của chính database test và Prisma Client sau generate |
| `TEST_REDIS_URL must select a dedicated nonzero Redis database` | Cấu hình Redis test riêng, ví dụ `/15`, không phải `/0` |
| `video.env: not found` | Chạy setup video tools từ root; từ `backend` đường dẫn là `../.video-tools/video.env` |
| `MEDIA_VIDEO_UNAVAILABLE`, lỗi probe/FFmpeg | Công cụ đã provision, env đã nạp và đường dẫn binary còn hợp lệ |
| Module/generated client not found | Dependencies đúng lockfile và bước Prisma generate |
| Assertion sai dữ liệu hoặc HTTP status sau khi setup đã thành công | Xem test cụ thể và log đã che thông tin nhạy cảm; có thể là regression thực tế |
| E2E báo port đang dùng | Dừng tiến trình của bạn đang giữ cổng cần thiết rồi chạy lại harness |

Sau khi xử lý nguyên nhân, chạy lại file test thất bại trước. Test bị loại bởi bộ lọc targeted không được tính là đã chạy PASS. Khi báo lỗi, gửi lệnh đã chạy, thư mục thực thi và phần lỗi đầu tiên đã che secrets.

## 8. Checklist cho lần chạy tiếp theo

- [ ] Chọn đúng nhóm và phạm vi test.
- [ ] Dependencies/Prisma Client phù hợp code hiện tại.
- [ ] Nếu chạy integration/E2E: PostgreSQL và Redis đang hoạt động.
- [ ] Nếu chạy integration/E2E: URL và database thực là `looply_test`; migration test đã cập nhật; Redis test dùng database riêng khác `/0`.
- [ ] Nếu chạy test video: `video.env` và FFmpeg/FFprobe đã sẵn sàng, env được nạp.
- [ ] Không chạy hai suite cùng ghi vào một database test đồng thời.
- [ ] Đọc kết quả/exit code và lỗi đầu tiên; không chỉ nhìn tổng số test fail.

Hướng dẫn này mô tả thao tác chạy test, không xác nhận một lần chạy mới đã PASS. Cấu hình Backend và môi trường thuộc [Backend README](../../backend/README.md), [Database README](../database/README.md); chính sách chọn test thuộc [Testing workflow](../workflows/TESTING.md).
