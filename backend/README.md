# Looply Backend

Backend chạy Express 5, TypeScript, Prisma ORM 7.10.1 và Redis; Node.js 24. Có Core, Auth/User, avatar, Listing CRUD/management, Search/Feed/Follow, upload/delivery ảnh và worker dọn tài khoản/media. `GET /api/health` giữ nguyên body `{ "status": "ok", "service": "looply-backend" }`. Video, Chat và Notification chưa triển khai. Trạng thái chức năng toàn sản phẩm thuộc [checklist](../docs/requirements/FUNCTIONAL_REQUIREMENTS.md).

## Cấu hình và chạy

Các lệnh dưới đây chạy từ `backend/`. Tạo `.env` cục bộ từ `.env.example`, tự điền cấu hình phù hợp; không commit hoặc in credentials. Tách biệt Development/Testing theo [`docs/database/README.md`](../docs/database/README.md). Server **không tự migrate hoặc seed** khi khởi động.

```powershell
npm ci
npm exec -- prisma generate --config prisma7.config.ts
npm run seed:provinces
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
| `CORS_CREDENTIALS` | Core mặc định `false`; khi chạy Auth phải đặt `true` và cho phép các `AUTH_ALLOWED_ORIGINS` trong `CORS_ORIGINS`. |
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

Feature mount Router qua `featureRouters`. `features.ts` ghép Auth/User/Media và worker ở composition root; không dùng auth placeholder, DI container hoặc Socket.IO. Runtime connect Redis trước khi listen, dừng worker rồi đóng Redis/Prisma trong deadline shutdown.

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
- Transaction rollback của helper `pg` chỉ bao phủ connection đó. Auth/User API tests chạy qua pool riêng dùng fixture có ID riêng và cleanup có giới hạn trên `looply_test`.
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

Các kết quả ở mục ngày 12/11/2026 là lịch sử Backend Core. Triển khai Auth/User và bằng chứng mới được mô tả dưới đây. Cảnh báo Vitest/CommonJS hiện tại không làm kiểm tra thất bại.

## Chạy Auth + User

Từ root chạy `docker compose up -d postgres redis`; Redis local cổng 6380, không bật persistence OTP. Trước khi chạy app, database phải có migration `0004` đã duyệt. Server không tự migrate, reset hoặc seed. Seed Province chỉ upsert catalog theo code, giữ UUID; script từ chối production và xác minh database thực tế. Chi tiết [database](../docs/database/README.md).

Điền `.env` từ `.env.example`:

- `AUTH_JWT_SECRET` và `AUTH_OTP_PEPPER`: hai giá trị độc lập, tối thiểu 48 ký tự. Có thể sinh bằng `node:crypto` với `randomBytes(48).toString('base64url')`; lưu vào môi trường riêng, không commit/log.
- `GOOGLE_CLIENT_ID`: audience của ứng dụng Google thực tế. `AUTH_ISSUER` mặc định `looply`.
- `AUTH_ALLOWED_ORIGINS`: origin chính xác của Angular; chúng phải nằm trong `CORS_ORIGINS`, với `CORS_CREDENTIALS=true`. Production yêu cầu HTTPS.
- `REDIS_URL`: Redis runtime; `TEST_REDIS_URL`: database Redis test riêng, ví dụ local `/15`. Không dùng database `/0` cho test; helper xác minh DB Redis thực tế và chỉ dọn namespace UUID của test, không FLUSHDB.
- `SMS_PROVIDER`/`EMAIL_PROVIDER`: `fake` hoặc `http`. Adapter `http` gửi POST JSON `{destination, code, expiresIn}` qua HTTPS và Bearer key riêng; gateway thật phải tương thích contract này hoặc được thay bằng adapter nhà cung cấp. Fake giữ mã tạm trong process, tự loại khỏi bộ nhớ sau tối đa 5 phút; không có endpoint xem mã trong API Auth/User hoặc log. Công cụ CLI Development tách riêng được mô tả dưới đây; không phải SMS/email thật.
- `MEDIA_PROVIDER=local`: private directory `.local-media` cho dev/test; không phục vụ trực tiếp thư mục. Production bắt buộc `s3` cùng endpoint HTTPS, bucket, region, access key và secret key trong môi trường. Backend đọc ảnh qua route có kiểm tra quyền; không công khai storage key.

Production từ chối fake message providers/local storage. Redis chưa sẵn sàng thì startup thất bại; Redis mất kết nối khi đang chạy thì thao tác xác thực cần Redis trả 503, không fallback. Client Redis không lưu offline queue; cần khởi động lại backend sau khi mất kết nối Redis. Mặc định login password có shared limit 10 lần/15 phút theo username, Auth có 60 request/phút/IP, re-auth 5 lần/15 phút/session; có thể cấu hình qua `AUTH_PASSWORD_LIMIT/WINDOW_SECONDS`, `AUTH_IP_LIMIT/WINDOW_SECONDS` và `AUTH_REAUTH_LIMIT/WINDOW_SECONDS` như `.env.example`. Quota OTP tuân thủ yêu cầu đã duyệt. Không tin proxy headers; cấu hình proxy triển khai phải được duyệt riêng.

Công cụ CLI xem fake OTP chỉ Development, opt-in mặc định tắt, listener loopback và key riêng: xem [hướng dẫn inspector](src/development/README.md). Không dùng API công khai hoặc log để lấy mã.

Password mới được kiểm tra bằng [Have I Been Pwned Pwned Passwords](https://haveibeenpwned.com/API/v3#PwnedPasswords), chỉ gửi SHA-1 prefix 5 ký tự với response padding; không gửi plaintext hoặc full hash. Lỗi/malformed response từ provider thì từ chối tạo/đổi password. Hash lưu bằng Argon2id 64 MiB, 3 lượt, parallelism 1. Không cần API key HIBP cho range endpoint.

## Tích hợp Angular

Giao diện tài khoản nội bộ và bằng chứng kiểm thử browser thật thuộc [Frontend README](../frontend/README.md). Google và các gateway thật chưa được nghiệm thu.

Contract và danh sách endpoint đầy đủ thuộc [OpenAPI](../docs/api/openapi.json); hướng dẫn transport thuộc [API conventions](../docs/api/CONVENTIONS.md).

1. Login/register trả `{accessToken, expiresIn:900, status}`. Giữ Access Token trong memory; gửi Bearer cho endpoint bảo vệ. Dùng `withCredentials:true` khi nhận/gửi refresh cookie.
2. Cookie `looply_refresh`: HttpOnly, SameSite=Strict, Path=/api/auth, Secure ở production. Angular/API phải cùng site; khai báo chính xác origin cho CORS. Browser tự gửi Origin; client ngoài browser phải gửi Origin hợp lệ khi refresh/logout. Không dùng cookie để thay Bearer ở các endpoint khác.
3. Refresh xoay token bằng compare-and-swap, hạn phiên tuyệt đối 7 ngày. Frontend phải gộp refresh đồng thời thành một request; token cũ chỉ có một lần thắng. Logout/thu hồi/đổi/reset password được kiểm tra lại qua AuthSession trên mỗi request, không đợi JWT hết 15 phút.
4. OTP: POST `/api/auth/otp/request`, sau đó gửi challengeId/code trong thao tác tương ứng. Các purpose bảo vệ cần Bearer. Challenge gắn destination/purpose/actor/session; LOGIN_PHONE/RESET_PASSWORD gắn thêm User ID sở hữu verified contact lúc cấp, không dùng mã cũ cho chủ mới sau khi contact đổi chủ. Resend không xóa attempts. Chỉ verified contact được dùng reset/linking; email unverified không giữ quyền sở hữu.
5. Re-auth: POST `/api/auth/reauthenticate` với operation và đúng một phương thức password, phone OTP hoặc linked Google. Proof có hạn 5 phút, một lần, chỉ đúng operation/session. Thao tác DB thất bại sau khi tiêu thụ proof/code cần chứng minh mới, không được tái dùng giá trị cũ.
6. Google: xin `/api/auth/google/challenge` **không Bearer khi login**, có Bearer khi linking/re-auth. Gửi `nonce` vào Google OIDC, gửi credential/challengeId về Backend. Trùng verified email trả 409 để đăng nhập tài khoản hiện có rồi link sau re-auth; không auto-merge.
7. Avatar: PUT raw bytes `application/octet-stream`, tối đa 10 MiB, JPEG/PNG/WebP thực tế. Backend decode, giới hạn pixel, bỏ metadata và tạo WebP tối đa 512px. Không gửi storage key hoặc User ID khác trong body.
8. Yêu cầu xóa trả 202 và thu hồi mọi phiên; Frontend xóa Access Token khỏi memory. Login trong thời gian chờ trả PENDING_DELETION, chỉ được GET `/users/me` và DELETE `/users/me/deletion`; không tự khôi phục. Người gửi lịch sử đã DELETED phải dùng public projection “Tài khoản đã xóa”, không đọc trực tiếp field User cũ.

## Worker và giới hạn vận hành

Worker poll 5 giây, tối đa 10 event/lượt, claim bằng SKIP LOCKED, lease 2 phút và retry backoff tối đa 1 giờ. Request xóa giữ nguyên Listing/Media suốt 30 ngày. Sau đó chuyển DELETING không đảo ngược, dọn private media bằng thao tác storage idempotent, xóa credential/profile/Follow/Block/Notification và scrub payload kỹ thuật thuộc tài nguyên đã xóa trước DELETED. Giữ User UUID, Message/Conversation/participant/proposal và Chat Media; không quét PII trong nội dung Chat. Detached avatar/TEMP hết hạn cũng được cleanup, không xóa object trước khi pointer được gỡ.

### Media preparation nội bộ

Migration `0005_listing_media_preparation` cho phép LISTING DELETING không có listingId, giữ nguyên các invariant còn lại. Chỉ đã áp dụng lên `looply_test`; không tự migrate development/production. Trước áp dụng ở môi trường khác phải preflight và đánh giá table lock theo [database review](../docs/database/SCHEMA_REVIEW.md#chuẩn-bị-listingmedia).

`ListingMediaService` cung cấp reserve/write/attach-batch/cancel; Phase 2 tích hợp HTTP và final manifest qua `ListingManifestService`. Primitive nhận bytes đã xử lý tin cậy, không thay thế kiểm tra MIME/dung lượng file đầu vào. Quy ước transaction, readiness và trách nhiệm caller thuộc [thiết kế](../docs/api/LISTING_MEDIA_DESIGN.md#3-media-lifecycle).

### Listing CRUD và ảnh — Phase 2

Contract nguồn tại [OpenAPI](../docs/api/openapi.json): POST `/api/listings`; GET/PATCH/DELETE `/api/listings/{listingId}`; PATCH `/api/listings/{listingId}/visibility`; GET `/api/users/me/listings`; POST `/api/media/listing-uploads`; DELETE `/api/media/listing-uploads/{mediaId}`; GET `/api/listings/{listingId}/media/{mediaId}`. Search/Feed/Follow và public User Listings được bổ sung ở phase 3 bên dưới. Upload raw `application/octet-stream`; ảnh thực JPEG/PNG/WebP tối đa 10 MiB, không GIF/animation, decode tối đa 40 triệu pixel. Cấu hình `listing-image.ts` tạo WebP quality 85, detail tối đa 1600 và thumbnail 400 pixels mỗi chiều, giữ tỷ lệ, không phóng lớn, bỏ metadata. Mỗi rendition có processing timeout 15 giây. Video upload/delivery trả 503 `MEDIA_VIDEO_UNAVAILABLE`; chưa probe/transcode hoặc hỗ trợ Range video.

Client upload trước, sau 201 dùng ID TEMP trong manifest, TTL 15 phút; không gửi storage key. Create và PATCH media là transaction nguyên tử. PATCH không có media giữ nguyên; có media thay toàn bộ membership/order, `videoId:null` bỏ video, cover giữ ảnh cũ nếu còn hoặc fallback ảnh đầu. Ảnh bị gỡ chuyển DELETING và queue cleanup cùng transaction; không xóa file trước commit. Video metadata ATTACHED hợp lệ có sẵn có thể giữ/bỏ, không coi fixture metadata là bằng chứng upload/playback video thật.

PATCH nội dung/visibility và DELETE bắt buộc `expectedVersion`: thiếu/sai 400, stale 409 `LISTING_VERSION_CONFLICT`. Version tăng đúng một lần; visibility cùng trạng thái không tăng, reopen tăng activeCycle; DELETED terminal và retry DELETE chỉ thành công với version tombstone hiện tại. Owner/session được kiểm tra lại dưới User→Listing→Media locks; public read và ảnh áp owner ACTIVE/Block hai chiều, owner đọc HIDDEN, DELETED trả 404. Tiền giữ chuỗi Decimal, không serialize key/email/phone riêng tư. `listing.updated` chỉ lưu identifier/version vào outbox cùng content update; consumer Chat/Notification chưa có, không phát thông báo giả.

Khi worker không có job đến hạn, reconciliation enqueue tối đa 20 TEMP hết hạn/DELETING chưa xóa, tránh trùng pending/failed/processing event. File chỉ bị xóa sau committed claim; sau lỗi I/O hoặc lỗi DB completion, outbox retry với key bất biến. Account preparation detach private assets trước xóa qua cùng guard. File thiếu được coi xóa thành công.

Local storage từ chối traversal, empty/dot segment, Windows separators và symlink trong media path; tạo directory mode 0700/file mode 0600 trên hệ điều hành hỗ trợ, quyền Windows theo ACL thư mục private. Read/write file có deadline 30 giây. Giữ private root dưới quyền tài khoản chạy app; không mount bằng static server. Mỗi database/môi trường phải dùng `MEDIA_LOCAL_DIRECTORY` riêng; đặc biệt test/E2E không dùng chung root với development vì inventory đối chiếu metadata của database hiện tại. Local inventory stream theo lô 20 file, chỉ UUID generated namespace, safe-age 17 phút và recheck database trước xóa. Không quét namespace CHAT; adapter S3 hiện có không được bổ sung inventory trong nhiệm vụ này.

S3 dùng conditional PUT `If-None-Match: *` để giữ key bất biến như local `wx`; provider phải hỗ trợ conditional write và lỗi conflict phải được giữ nguyên để lifecycle xử lý. PUT/GET/DELETE truyền abort signal 30 giây cho SDK. Không fallback sang overwrite khi provider từ chối điều kiện. Kiểm thử adapter dùng fake provider; khả năng tương thích bucket/provider thật cần nghiệm thu trước production.

`UserService.requireInteraction(tx, from, to)` là public gate cho Chat/Listing tương lai: caller phải xác thực phiên và giữ transaction/khóa cho đến khi ghi tương tác. Public User visibility/projection thuộc `modules/user/index.ts`; không import private repositories. Không tuyên bố Chat/Listing đầy đủ đã được tích hợp khi các module đó chưa triển khai.

Backup/restore, mã hóa backup, tự dọn retention và nguồn trạng thái xóa độc lập **chưa có hạ tầng**. Chính sách 30 ngày và quy trình fail-closed thuộc [User requirements](../docs/requirements/modules/USER_REQUIREMENTS.md#backup-và-khôi-phục); outbox/receipt trong cùng database không phải nguồn độc lập với backup. Chỉ mở dịch vụ sau khi đối soát trạng thái xóa từ nguồn độc lập và chạy lại cleanup thành công. Không xây hệ thống backup mới trong nhiệm vụ này.

## Listing Search, Feed và Follow — Phase 3

GET `/api/listings` hỗ trợ title search, filters, sorting và feed `search|nearby|national`; GET `/api/listings/suggestions` trả tối đa 8 `{id,title}`; GET `/api/users/{userId}/listings` trả bài công khai của User. Guest được truy cập; Bearer sai trả 401. Mọi trang lọc ACTIVE/owner ACTIVE/Block hai chiều, không trả storage key hoặc private contact.

GET `/api/users/me/followed-listings` và PUT/DELETE `/api/listings/{listingId}/follow` yêu cầu phiên ACTIVE. Follow mới chỉ cho bài ACTIVE của người khác, không Block; PUT hợp lệ lặp lại trả 204. HIDDEN giữ quan hệ nhưng không hiện trong list; DELETE luôn chỉ xóa quan hệ của viewer và trả 204 kể cả tài nguyên không tồn tại/không công khai. Không có Notification hoặc thay đổi version Listing.

Ví dụ: `/api/listings?feed=nearby&provinceCode=79&limit=12`; `/api/listings?q=do%20dac&type=SALE&minPrice=100&sort=PRICE_ASC`; `/api/listings?feed=national`. Nearby yêu cầu Province chọn tường minh; national cấm provinceCode. Price filter/sort phải chọn SALE hoặc RENT; RENT bắt buộc DAY/MONTH. Không đổi tiền sang JS Number.

Client gửi nguyên filters/sort/limit và `after=nextCursor` để tải tiếp. Mặc định 12, tối đa 48; national RANDOM giữ seed trong cursor, không nhận seed riêng. Khi đổi query/viewer/địa điểm cần reset cursor. Dữ liệu biến động không có snapshot xuyên requests; client dedup ID và bỏ response cũ. Ngữ nghĩa đầy đủ thuộc [thiết kế](../docs/api/LISTING_MEDIA_DESIGN.md#4-search-filter-feed-và-cursor), không triển khai debounce ở server.

## Kiểm chứng Auth/User local

Các integration test mới dùng PostgreSQL `looply_test`, Redis test riêng, namespace/UUID fixture riêng và cleanup có giới hạn; test schema cũ vẫn rollback. Provider ngoài hệ thống được fake ở ranh giới; Google adapter còn được test bằng chữ ký RSA và bộ kiểm chứng thật của Google SDK. Không gửi SMS/email thật hoặc dùng Google credential/R2 production trong test.

```powershell
$env:TEST_REDIS_URL = 'redis://127.0.0.1:6380/15'
npm test
npm run test:api
npm run test:integration
npm run typecheck
npm exec -- tsc --project tests/tsconfig.json
npm run build
```

Kết quả cuối và giới hạn được ghi tại [Database Integration Tests](../docs/database/INTEGRATION_TESTS.md). Không coi fake provider hoặc tài liệu backup là tích hợp production hoàn tất; cần Google client ID, gateway SMS/email và S3 thực tế trước vận hành.

## Video Backend — Phase 4

Backend nhận MP4/WebM thực, tối đa 100 MiB và thời lượng thực >0 đến 180 giây. Giữ nguyên bytes video; không chuyển mã, tạo thumbnail video hoặc CDN. Upload vẫn raw `application/octet-stream`; client không gửi MIME/extension/duration để quyết định loại Media. Ảnh dùng pipeline sharp hiện có. Mỗi manifest Listing có 1–5 ảnh và tối đa một video; thay toàn bộ manifest và version trong cùng transaction.

### Provision FFprobe/FFmpeg

Từ root repository, Windows x64 hoặc Linux x64 có Node.js 24 và `tar`:

```text
node scripts/setup-video-tools.mjs
```

Script tải build BtbN được trang download FFmpeg dẫn chiếu, release cố định `autobuild-2026-11-12-15-40`, version `n8.1.3-35-gf1acb0a266`. Windows ZIP SHA-256 `688d6d2d33ff3b91ae15eb8be5660e7ccaec7d3170fb25f091c4972dcb447d9d`; Linux TAR.XZ SHA-256 `320c1f97653ad0740343f87abe2303656b85eb119c3f06abcb639837e9beaed3`. Chỉ extract/chạy sau khi hash khớp; xác minh version của cả hai executable. Đây là build trên nhánh release 8.1 tại source commit đã pin, không tự cập nhật theo URL `latest`. Muốn nâng binary phải review lại artifact/hash và fixtures. Không thêm npm dependency, không tải công cụ trong runtime.

Output mặc định `.video-tools/` (Git ignore), file `.video-tools/video.env` chứa đường dẫn tuyệt đối của máy đang setup. Có thể truyền thư mục đích làm argument; không commit file env hoặc binary. Bộ build giữ license/source metadata đi kèm; khi đóng gói image, giữ các thông tin phân phối của build. Linux runtime cần môi trường tương thích binary (glibc, không dùng Alpine/musl trực tiếp). Setup CI dùng cùng script và ghi đường dẫn qua `GITHUB_ENV`.

Từ `backend/`, chạy bằng cấu hình local và binary đã provision:

```text
node --env-file=.env --env-file=../.video-tools/video.env --import=tsx --watch src/server.ts
node --env-file=.env --env-file=../.video-tools/video.env node_modules/vitest/vitest.mjs run src/modules/media
node --env-file=.env --env-file=../.video-tools/video.env node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts listing-video.test.ts
```

Gọi trực tiếp entrypoint để env file được áp dụng; [Node.js 24 CLI](https://nodejs.org/download/release/v24.20.0/docs/api/cli.html#--run) không truyền biến từ `--env-file` vào command của `--run`. Với `npm run`, cần export các biến vào môi trường shell trước.

Integration chỉ được dùng `TEST_DATABASE_URL` trỏ tới `looply_test` và Redis test nonzero đã xác minh; `.env` phải cấu hình hai giá trị này riêng. Helper kiểm tra database thực trước ghi và chỉ dọn graph/namespace do test tạo. Không chạy migration hoặc test trên `looply_dev`/production.

Trong image/runtime Backend, provision vào thư mục read-only dành cho tools ở bước build, rồi truyền `MEDIA_FFPROBE_PATH`, `MEDIA_FFMPEG_PATH`, `MEDIA_VIDEO_BINARY_VERSION` theo `video.env`. Chạy Backend bằng user không đặc quyền; staging là thư mục private có quyền ghi riêng, storage private và không có static mount. Binary thiếu, sai version, crash/hết timeout đều từ chối video có kiểm soát; không bỏ qua validation. Ảnh vẫn upload/delivery bình thường khi thiếu binary video.

### Giới hạn và lỗi vận hành

`MEDIA_STAGING_DIRECTORY` mặc định là `looply-private-staging` trong OS temp; thư mục 0700, file 0600 ở hệ thống hỗ trợ POSIX. Windows cần ACL của thư mục tài khoản chạy Backend không cho user khác đọc. Không đặt staging trong web root/shared public directory. Upload stream tối đa 100 MiB; mặc định hai upload/instance, vượt capacity trả 503 `MEDIA_UPLOAD_BUSY`; không xếp hàng vô hạn. Mỗi request có tối đa 120 giây nhận bytes; probe/decode mỗi process tối đa 60 giây; cấu hình giới hạn trong `.env.example`. Process dùng một decode/filter thread, max allocation 64 MiB/lần, stdout tối đa 128 KiB và stderr tối đa 64 KiB. Chỉ protocol file và demuxer MOV/Matroska; không shell, không đường dẫn/command lấy từ client. Đây là giới hạn ứng dụng, không phải sandbox hay hard RSS quota của OS; khi deploy cần CPU/memory/disk quota phù hợp cho instance.

Chấp nhận một video stream, tối đa một audio stream; từ chối stream attachment/data hoặc metadata không xác minh được. MP4 major brands: isom, iso2–iso6, mp41/mp42, avc1, dash; WebM phải có DocType webm trong EBML header thật, video VP8/VP9/AV1 và audio Vorbis/Opus; không nhận generic MOV/Matroska. Giới hạn decode 40 triệu pixel/frame. Kiểm tra duration container/stream và thời gian decode thực (sai lệch >1 giây bị từ chối); lưu ceil của thời lượng lớn nhất đã xác minh. File quá 180 giây bị 400 `VALIDATION_ERROR`; giả mạo/hỏng/truncated/không decode được bị 415 `UNSUPPORTED_MEDIA`. Binary thiếu/sai version/timeout/output quá giới hạn bị 503 `MEDIA_VIDEO_UNAVAILABLE`. Không trả stderr, executable path, storage key hoặc metadata nội bộ trong lỗi.

Staging được xóa trước 201 hoặc khi lỗi/ngắt kết nối. Mỗi upload quét tối đa 100 entry, chỉ xóa thư mục upload server quá một giờ (lớn hơn tổng deadline cấu hình). Crash-left staging được thu hồi khi có upload tiếp theo; nếu instance không nhận upload thì cần dọn temp định kỳ khi bảo trì. Sau validation mới reserve TEMP TTL15 phút; original + completion marker được ghi immutable. Lỗi sau reserve chuyển DELETING và queue cleanup; attach dùng marker + bounded metadata check dưới khóa, không đọc lại toàn bộ video. Outbox/worker xóa cả file và marker, retry idempotent; local inventory nhận diện video mồ côi, S3 vẫn dùng reconciliation TEMP/DELETING hiện có, chưa có bucket inventory.

Delivery dùng route hiện tại và kiểm tra Listing visibility/Block/lifecycle trên mỗi request. Video hỗ trợ full 200 và single byte Range 206; suffix/open-ended/clamp end đúng tổng bytes, invalid/multiple/unsatisfiable trả 416 cùng `Content-Range: bytes */total`. Có `Content-Type`, `Content-Length`, `Accept-Ranges: bytes`, `Cache-Control: no-store`; If-Range không khớp validator trả full 200. Ảnh giữ WebP detail/thumbnail và không phục vụ Range. Mở stream trong authorization transaction nhưng đọc body sau commit, đóng khi client ngắt hoặc deadline delivery 120 giây. Quyền được quyết định tại lúc mở, không thu hồi bytes đã cấp giữa một response đang truyền; request mới phải kiểm tra lại. Không cấp URL storage công khai.

Fixtures MP4 H.264/WebM VP9 tổng hợp nằm tại `tests/fixtures/video/`, có hướng dẫn tạo lại. Kiểm thử decode và HTTP bytes không thay thế nghiệm thu browser playback thực; chưa tuyên bố mọi codec trong MP4/WebM phát được trên mọi trình duyệt. Live S3 và browser video chưa được nghiệm thu trong phase này; adapter S3 có contract test MIME/HEAD/Range/immutability.
