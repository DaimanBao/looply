# Database Integration Test — Looply Đồ án 1

## Listing Search, Feed và Follow — Phase 3 — 13/11/2026

Nền bắt đầu từ `develop` sau PR #20 đã merge (`352b1cf`), working tree sạch; nhánh `feat/listing-search-feed-follow`. Đã xác minh actual database `looply_test`, PostgreSQL 17.11 tại localhost:5435. Redis test riêng `/1` tại localhost:6380; fixture xác minh database trước ghi, cleanup chỉ graph UUID/namespace của mình. Không ghi/migrate/reset development/production, không thay schema/index/dependency hoặc Frontend.

`listing-discovery.test.ts` có **30 HTTP/PostgreSQL tests**: normalization tiếng Việt/NFD/đ/Đ/case, title-only và giữ title gốc; LIKE wildcard/backslash/SQL injection literal; compact suggestions ≤8; phối hợp type/Province/postedWithin/rental unit và Decimal 15 chữ số; bốn deterministic sort với equal-key tie-break; postedWithin/asOf giữ nguyên và bỏ bài tạo sau trang đầu; national seed/rank đúng PostgreSQL và không lặp/bỏ sót trên dữ liệu tĩnh; cursor sai query/viewer/scope; Guest chọn Province tường minh; public User Listings; HIDDEN/DELETED/owner lifecycle/Block hai chiều; candidate mất visibility trước hydrate.

Follow kiểm chứng duplicate/concurrent PUT, self/auth/account/Block, không sửa Listing version/outbox/Notification, chỉ xóa relation của viewer, hidden giữ quan hệ và xuất hiện lại sau reopen, unfollow invisible/deleted/missing, followed keyset. Các race follow với hide/delete/Block/pending chạy trên PostgreSQL thật. Ba test barrier giữ advisory User→Listing locks, đợi request qua middleware đến lock acquisition rồi mới commit revoke/hide/pending: request đọc lại state, trả 401/404 và không ghi Follow. Không dùng sleep để giả lập concurrency.

Unit schema/cursor thêm **22 tests**; HTTP response đối chiếu component schema OpenAPI; exact registered-route test bao gồm discovery router. Full regression gồm CRUD/Media readiness/atomic rollback, private image delivery (kể cả JPEG metadata/video coexistence), Auth/User/Avatar/account cleanup và constraints.

| Kiểm chứng thực sự đã chạy tại backend | Kết quả |
| --- | --- |
| `npm test` | **129/129 PASS**, 20 file. |
| `npm run test:integration -- --reporter=verbose --disableConsoleIntercept` | **479/479 PASS**, 28 file; gồm 30 test Phase 3. |
| `npm run test:api` | **23/23 PASS**; Listing HTTP/contract nằm trong PostgreSQL suite. |
| `npm run typecheck`, `npm exec -- tsc --project tests/tsconfig.json`, `npm run build` | PASS. |
| Prisma validate + migrate status với child process DATABASE_URL trỏ test đã xác minh | PASS; 5 migrations up to date, không deploy migration. |

Sau chỉnh controller để thu hẹp DTO từ `res.locals.validated`, đã chạy lại targeted PostgreSQL Phase 3 **30/30**, unit/contract Listing **32/32**, source/test typecheck và build: PASS. Không chạy lại full suite không cần thiết; CI kiểm tra toàn bộ commit bàn giao.

Đã đo câu SQL production bằng `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` trên 2.000 Listing test riêng: search literal chọn một hàng, khoảng 0,72 ms với `listings_status_createdAt_id_idx`; nearby trả 13 candidates khoảng 4,22 ms, dùng `listings_status_provinceId_createdAt_id_idx`; national RANDOM trả 13 khoảng 7,58 ms với top-N heapsort. Đây là phép đo local nhỏ, không phải benchmark production. Random vẫn tính rank/sort tập lọc ở PostgreSQL; không xử lý toàn bảng trong application memory, không thêm index dự phòng.

Rà soát thay đổi: parameter binding, strict DTO/query/cursor, latest visibility khi hydrate, phiên dưới lock, thứ tự User→Listing, unique relation, no-store và không xuất private storage key. Không phát hiện blocker đã biết trong phạm vi này. Dữ liệu biến động không có snapshot xuyên requests; client phải dedup/reset cursor. Chưa kiểm thử browser Angular Listing, live S3 hoặc video/Chat/Notification. CI được theo dõi trên commit PR và báo link bàn giao; không coi local PASS là CI PASS.

## Final review PR #20 — 13/11/2026

Review diff so với develop, contract/DTO, visibility/lifecycle, lock ordering, atomic manifest/rollback, cleanup/reference guards và regression Auth/User/Avatar. Không đổi schema/migration, dependencies, Frontend hoặc nghiệp vụ đã duyệt.

**Medium — đã sửa:** `listing-image.ts` nhận diện video từ `ftyp` tại offset 4 trước decode ảnh. JPEG hợp lệ có APP15 length/payload cùng bytes bị trả 503 MEDIA_VIDEO_UNAVAILABLE dù sharp xác nhận JPEG và decode được. Đã ưu tiên JPEG signature trước sniff BMFF; file vẫn phải qua kiểm tra format/decode/size/pixels như trước. Unit regression thất bại trước sửa (503), đạt sau sửa với WebP detail/thumbnail. HTTP/PostgreSQL regression upload JPEG đó, create/attach và delivery hai variant đạt 201/200. Bổ sung assertion ảnh vẫn trả 200 khi Listing đồng thời có VIDEO trả 503; không biến video stub thành inspector hoặc chấp nhận VIDEO TEMP.

Kiểm chứng review: targeted unit/contract **13/13 PASS**; `listing-crud.test.ts` **22/22 PASS** trên actual PostgreSQL 17.11 `looply_test`, Redis test riêng `/1`; source/test typecheck và build PASS. Không chạy lại toàn bộ suite local; bằng chứng đầy đủ trước review tại mục Phase 2 bên dưới, CI được kiểm tra trên commit bản sửa và báo trong kết luận. Không chạy migration hoặc test trên development/production. Live S3, video inspector/playback/Range và browser Listing E2E vẫn chưa kiểm chứng.

## Listing Backend CRUD — Phase 2 — 13/11/2026

Đã xác minh PR #19 merged và nhánh bắt đầu từ origin/develop `df9bd4f`, working tree sạch. PostgreSQL thực tế là `looply_test` 17.11 tại localhost:5435; Redis test riêng `/1` tại localhost:6380. Không chạy migration, seed, reset, truncate trên development/production; không thêm migration/schema/dependency hoặc sửa Frontend.

`listing-crud.test.ts` có **21 HTTP/PostgreSQL integration tests**: SALE/RENT/EXCHANGE, exact Decimal, text/searchTitle/Province/contact; authentication/IDOR/Block/account lifecycle/private delivery; create/edit batch rollback, unready/expired/foreign/duplicate IDs; 1–5 ảnh/cover/reorder/removal; concurrent create/update/cancel/cleanup; version 400/409/no-op/cycle; soft-delete terminal/tombstone retry; My Listings equal-timestamp keyset và cursor bindings; Conversation confirmation/type lock/reopen và giữ giá lịch sử. Upload dùng sharp thật, metadata/transactions/advisory locks/session PostgreSQL thật; chỉ storage/provider ở boundary được fake. Response upload/detail/page được kiểm tra với component schema OpenAPI. Fixture VIDEO ATTACHED chỉ chứng minh quản lý metadata/slot/removal, không chứng minh upload/inspector/playback video.

Rollback được kiểm chứng cả khi ảnh thứ hai chưa ready lẫn khi trigger PostgreSQL cố ý abort Listing UPDATE cuối, sau phase Media: ảnh cũ/cover phục hồi, ảnh mới TEMP, version/content không đổi, không cleanup outbox/file delete. Trigger/function tên UUID chỉ trên database test đã xác minh và được gỡ trong finally. Coordinator regression dùng gallery tạo qua HTTP mới, xác nhận xóa đúng tài khoản và giữ avatar/Media người khác. Existing suite giữ nguyên guard/history/lease/Avatar/Auth tests.

Test-first validator đã thất bại khi module chưa tồn tại; sau implementation đạt. Test phân trang phát hiện parse lại limit đã transform gây 500; đã tách schema raw query khỏi schema DTO đã validate và chạy lại đạt. Review bổ sung kiểm tra uploader khi delivery, final TEMP/expiry/session trước trả upload và so sánh thời gian cursor bằng Date thay vì thứ tự chuỗi ISO khác precision. Unit image fixture thật xác minh WebP 1600/400, đúng tỷ lệ và bỏ EXIF; MIME giả/GIF/truncated/video bị từ chối.

| Lệnh thực sự đã chạy ở backend | Kết quả |
| --- | --- |
| `npm test` | **106/106 PASS, 18 file**. |
| `npm run test:integration` với TEST_REDIS_URL riêng | **448/448 PASS, 27 file**. |
| `npm run test:api` | **23/23 PASS**; Listing HTTP/contract dùng database thuộc integration suite phía trên. |
| `npm run typecheck`, `npm exec -- tsc --project tests/tsconfig.json`, `npm run build` | PASS. |
| Prisma validate + migrate status, DATABASE_URL riêng child process trỏ test đã xác minh | PASS, 5 migration up to date, không deploy lại. |

Rà soát sau test: ownership/lifecycle/visibility, mass assignment, Decimal, lock hierarchy, attachment/reference/cover, rollback, outbox, error mapping và regression đã được đối chiếu. Không còn lỗi chặn đã biết trong phạm vi phase 2. Không chạy browser E2E/Angular Listing, live S3, video inspector hoặc Notification consumer. Checklist toàn sản phẩm không đánh dấu các chức năng chưa hoàn tất Frontend/video/Chat. CI được kiểm tra trên commit bàn giao và báo link tại PR; local PASS không thay thế CI thật.

## Final review PR #19 — 13/11/2026

Đã đọc toàn bộ diff so với develop, workflow, thiết kế Listing/Media, migration và các writer/cleanup/account coordinator liên quan. Review giữ nguyên nghiệp vụ, Prisma shape, migration lịch sử, Frontend và dependencies. Không chạy migration trên development/production.

**High — đã sửa:** `S3ObjectStore.put` trước review cho phép overwrite trong khi local dùng `wx`. Hai writer cùng đọc TEMP; writer chậm dừng trước PUT, writer khác ghi đủ rendition và attach; writer chậm tiếp tục sẽ thay bytes của asset ATTACHED trước khi finalize từ chối. Bản sửa dùng `IfNoneMatch: "*"`, không fallback overwrite, và truyền abort signal 30 giây cho các request S3. Regression `prevents a delayed S3 writer from replacing bytes after another writer attaches` trong `media-lifecycle.test.ts` thất bại trước sửa do detail bytes bị đổi, đạt sau sửa và xác nhận metadata vẫn ATTACHED. PostgreSQL/locks/transactions thật; S3 được fake tại SDK send để mô phỏng conditional PUT nguyên tử. Unit `uses immutable writes and bounded provider requests, propagating write conflicts` kiểm tra điều kiện, abort signal và lỗi provider được trả về. Chưa nghiệm thu provider/bucket S3 thật.

Kết quả chạy lại sau sửa: `npm test` **99/99**, `npm run test:integration` **427/427, 26 file**, `npm run test:api` **23/23**; source typecheck, test typecheck, build đều đạt. Đã xác minh actual `looply_test` PostgreSQL 17.11 trước ghi; Redis test `/1`. Prisma validate và migrate status chạy với DATABASE_URL của child process trỏ TEST_DATABASE_URL đã xác minh: schema hợp lệ, năm migration up to date; không cần deploy lại. `git diff --check` đạt. E2E 26 bước phía dưới là bằng chứng lần triển khai trước, không chạy lại trong final review chỉ sửa adapter S3. CI phải kiểm tra trên commit chứa bản sửa; kết quả và link được báo tại PR/final review.

Batch attachment kiểm tra toàn bộ tập khóa trước khi đổi trạng thái; test ảnh thứ hai chưa ready xác nhận ảnh đầu vẫn TEMP sau transaction rollback. Cleanup claim đọc lại reference dưới User/Media lock và commit DELETING trước I/O; retry, stale job, lease fencing và idempotency được đối chiếu với test PostgreSQL. Account preparation chỉ chọn uploader tương ứng, từ chối Listing khác owner, giữ CHAT/Message reference; regression account deletion và avatar nằm trong suite đã chạy. Không phát hiện thêm lỗi Critical/High/Medium/Low cần sửa trong phạm vi phase 1 sau bản sửa này. Giới hạn phase 1 và cấu hình storage riêng theo database vẫn áp dụng như dưới đây.

## Media & Database Preparation — 13/11/2026

Đã xác minh actual PostgreSQL 17.11 `looply_test` tại local port 5435 trước ghi, khác `looply_dev`; Redis test DB `/1` tại local port 6380 khác development `/0`. Không dùng production credentials, không migrate/reset/truncate/seed development. Chỉ thêm và deploy `0005_listing_media_preparation` lên test, không UPDATE/DELETE Media hiện hữu từ migration. Prisma shape và migration 0001–0004 giữ nguyên.

Test-first CHECK: ca LISTING DELETING không listingId thất bại đúng `ck_media_purpose`, 27 ca khác đạt trước migration. Sau deploy, các ca đã duyệt đạt; thêm PROFILE/CHAT ở TEMP/ATTACHED/DELETING, negative purpose/type/cover và lịch sử năm migration/checksum. Migration compatibility chạy trong schema rollback riêng, so sánh toàn bộ Media rows/FK/CHECK khác/index trước/sau; legacy data không tương thích bị chặn và không bị sửa.

`media-lifecycle.test.ts` dùng PostgreSQL transaction/advisory lock thật trên các connection, committed fixture riêng và Redis test. Bao phủ TTL/readiness, uploader/account/Listing ownership, double attach, batch rollback, attach thắng/cleanup thắng, attach/cancel, cancel/cleanup, stale job, Message reference, duplicate workers, deduplicate outbox và private HTTP. Storage I/O fake được điều khiển tại ranh giới: outage, partial variants/late writer, thiếu object và crash sau delete trước DB completion. Lỗi DB completion được fault-inject một lần, các claim/state/retry khác vẫn đi qua PostgreSQL thật. Không dùng mock lock để thay chứng cứ concurrency.

Local object-store unit tests đọc/ghi/xóa file thật, missing-delete idempotent, traversal/Windows key/symlink và inventory. Orphan tests kiểm tra safe-age, cursor lô 20, canonical key, absent-metadata recheck và phục hồi tombstone sau late write; phần recheck/recovery có PostgreSQL integration. Snapshot/Conversation/Message service mới không được triển khai; Message fixture chỉ kiểm tra reference đã có trong schema.

| Kiểm tra thực sự đã chạy tại backend | Kết quả |
| --- | --- |
| `npm exec -- prisma validate --config prisma7.config.ts` | PASS, Prisma 7.10.1. |
| `npm exec -- prisma generate --config prisma7.config.ts` | PASS. |
| `prisma migrate deploy --config prisma7.config.ts` với DATABASE_URL của riêng child process trỏ TEST_DATABASE_URL đã xác minh | PASS, chỉ áp dụng 0005 lên looply_test. |
| `prisma migrate status --config prisma7.config.ts` trên test | PASS, 5 migration, up to date. |
| `npm run test:integration` với TEST_REDIS_URL test riêng | **426/426 PASS, 26 file**; gồm Auth/User/Avatar/account deletion và toàn bộ constraint regression. |
| `npm test` | **98/98 PASS, 15 file**, gồm 5 OpenAPI contract regression và unit Media mới. |
| `npm run test:api` | **23/23 PASS, 1 file**. |
| `npm run typecheck` | PASS. |
| `npm exec -- tsc --project tests/tsconfig.json` | PASS. |
| `npm run build` | PASS. |
| `git diff --check` | PASS. |
| Chrome E2E `frontend/e2e/auth-user.cjs` | **26/26 bước PASS**, real API/PostgreSQL/Redis, gồm avatar upload/render/remove và account deletion/cancel. |

Sau review bổ sung guard cancel/attach với TEMP có reference, absent-metadata orphan recovery và kiểm tra type IMAGE ở writer, chạy lại 14/14 lifecycle integration cùng source/test typecheck/build đạt. Vitest vẫn có cảnh báo loader CommonJS/ESM cấu hình hiện có, không làm test thất bại. Backend chưa có lint script; không ghi nhận đã chạy lint. CI theo PR là bằng chứng riêng, không thay bằng kết quả local.

E2E chạy sau integration, dùng Chrome có sẵn và harness CDP hiện hành, không cài dependency hoặc sửa Frontend. Lệnh thực thi từ frontend: Node wrapper gọi `require('./e2e/auth-user.cjs')`, chỉ override kết quả parse cấu hình test để `MEDIA_LOCAL_DIRECTORY` là thư mục OS temp mới và `TEST_REDIS_URL` dùng `/1`; không sửa `.env` hoặc application adapters. Harness tự xác minh actual looply_test, giữ các tài khoản `ui_` và catalog tham chiếu trên test theo quy ước; không ghi development. Report/screenshot trong `frontend/tmp/e2e/` bị Git ignore; không đưa vào commit.

Giới hạn: không xác nhận Listing upload/delivery/CRUD hoặc video đã hoàn thành; chỉ primitive ảnh nội bộ nhận output processor tin cậy. Không migration development/production, không test S3 hoặc Chat snapshot/retention. Local storage root phải riêng theo database; E2E dùng root OS temp mới, không dùng `.local-media` development.

## Review Auth + User trước PR — 13/11/2026

Nhánh `feat/auth-user-implementation` được tạo từ `develop` tại `48d5e2f`; đối chiếu trạng thái và SHA-256 xác nhận giữ nguyên đủ 99 file trước khi sửa. Review đối chiếu Auth/User requirements, OpenAPI, database, module boundaries, providers, session/OTP/concurrency, xóa tài khoản và giới hạn backup. Không chạy migration, seed hoặc thao tác ghi trên development/production trong đợt review này.

| Mức độ | Phát hiện có bằng chứng | Xử lý và kiểm chứng |
| --- | --- | --- |
| Cao | OTP LOGIN_PHONE/RESET_PASSWORD chỉ gắn destination. Sau khi verified contact chuyển sang User khác trong TTL, mã cũ đăng nhập/reset được tài khoản mới. Hai test hồi quy tái hiện HTTP 200/204 thay vì 401. | Gắn User ID lúc cấp mã, kiểm tra lại ownership và tiêu thụ OTP dưới khóa User trong transaction. Hai ca nay 401; happy paths vẫn đạt. Không thay public request/schema database. |
| Vừa | Runtime dependency cycle `auth.schema -> user/index -> UserService -> auth/index -> auth.schema`. | Auth dùng public entry username độc lập; không di chuyển logic hoặc thêm layer. Typecheck, build và startup thật đạt. |
| Vừa | OpenAPI thiếu các lỗi avatar/HTTP parser và một số giới hạn input/điều kiện re-auth so với runtime. | Đồng bộ error responses/default, giới hạn credential/contact/Province/password verification và mô tả các phương thức re-auth. Không thay đổi chính sách mật khẩu mới. |
| Thấp | Assertion tìm chuỗi OTP trong toàn bộ JSON có xác suất va chạm với chữ số trong digest; thiếu test JWT claims và re-auth phone/Google. | Assert đúng HMAC và không có field code plaintext; bổ sung JWT expired/nbf/audience/algorithm và phone/linked Google/subject mismatch. |

Kết quả cuối: **84/84 unit (12 file), 23/23 Core API (1 file), 405/405 PostgreSQL/Redis integration (23 file)**. Sau lần sửa assertion cuối chỉ ảnh hưởng test, chạy lại **12/12 Auth security integration** và typecheck source/tests đạt. Source/test typecheck, Prisma validate/generate 7.10.1, build, HTTP smoke từ `dist` (health 200, private profile 401, Province 200, Redis DB 15, shutdown) và `git diff --check` đều PASS. Lần chạy integration đầu tiên bị chặn do Docker Desktop chưa chạy; đã khởi động Docker local, tái hiện lỗi thực tế rồi sửa và chạy lại thành công.

Kiểm tra phạm vi: vẫn 99 file; không thay schema/migration lịch sử, không nâng phiên bản dependency cũ, không thêm dependency ngoài sáu thư viện đã duyệt, không sửa Angular. Test xác minh `looply_test` trước ghi, chỉ cleanup UUID/namespace fixture; hậu kiểm không còn User/Province/Outbox fixture. Không phát hiện vấn đề mức cao còn tồn tại trong phạm vi review. Provider thật và backup/restore infrastructure vẫn chưa nghiệm thu như giới hạn bên dưới; kết quả local không thay thế CI của PR.

## Triển khai Auth + User — 13/11/2026

Backend Auth/User đã triển khai và kiểm chứng local; contract đầy đủ tại [OpenAPI](../api/openapi.json). Các phần dưới lưu bằng chứng lịch sử Database Preparation/Core, không thay thế kết quả mới nhất tại đây.

| Kiểm tra đã thực sự chạy trên bản cuối | Kết quả |
| --- | --- |
| `npm test` | **83/83 PASS**, 12 file. |
| `npm run test:api` | **23/23 PASS**, 1 file Core HTTP regression. |
| `npm run test:integration` với PostgreSQL `looply_test` và Redis DB 15 | **402/402 PASS**, 23 file; gồm 374 regression sẵn có và 28 Auth/User/Province mới. |
| Auth security API/Redis | **10 PASS**: signup, refresh đồng thời, session revoke, Origin, pending restrictions, contact validation, OTP TTL/hash/limit/reuse/resend/brute force, proof binding/expiry và Redis outage. |
| Account management API/PostgreSQL | **13 PASS**: contact verification/crossed claims, password/reset, Google signup/link, username race, profile privacy, Follow/Block, pagination/session ownership, avatar decode/cleanup. |
| Account deletion API/worker | **4 PASS**: grace/cancel, lease fencing, storage failure/retry, cleanup replay sau dữ liệu khôi phục, giữ Chat/tệp/người gửi lịch sử và identifier reuse. |
| Province safe seed | **1 PASS**: 34 mã duy nhất, upsert lặp giữ nguyên UUID, rollback test. |
| `npm run typecheck`, `npm exec -- tsc --project tests/tsconfig.json` | PASS, gồm source, tests và seed. |
| Prisma validate/generate | PASS, Prisma Client **7.10.1**, không thay schema/migrations. |
| `npm run build` | PASS. |
| HTTP runtime từ `dist` | PASS: xác minh `looply_test`, Redis DB 15, startup, health 200, private profile 401, Province 200, graceful shutdown. |
| An toàn dữ liệu và diff cuối | PASS: `looply_test` không còn User/Province/Outbox fixture hoặc schema tạm; `looply_dev` có bốn migration và 34 Province. `git diff --check` đạt; schema/migrations không đổi; mọi dependency cũ giữ nguyên version lockfile. |

Auth/User integration tests dùng PostgreSQL và Redis thật, ID/namespace riêng, ghi qua pool thực và chỉ cleanup dữ liệu fixture. Helper xác minh tên database trên connection trước ghi; Redis yêu cầu DB khác 0 và đối chiếu `CLIENT INFO`, không FLUSHDB. Các test schema cũ tiếp tục transaction rollback. Google/SMS/email/password-screen/object storage được fake ở ranh giới ngoài hệ thống; unit test riêng kiểm tra Argon2id, JOSE JWT, chữ ký RSA qua Google SDK, HIBP prefix/padding/fail-closed, HTTP gateway và filesystem private storage. Ảnh avatar dùng Sharp thật.

Trong triển khai này, `0004_auth_user_preparation` có sẵn đã được áp dụng lên **`looply_dev` theo quyền đã duyệt** sau preflight xác minh tên database, lịch sử/checksum ba migration trước và dữ liệu tương thích. Seed an toàn tạo catalog 34 Province bằng upsert; không reset/xóa dữ liệu development. Không thêm migration, không sửa lịch sử, không kết nối production. Các dependencies cũ giữ nguyên phiên bản lockfile; chỉ thêm sáu thư viện đã được cho phép.

Giới hạn: chưa kiểm thử live Google client của dự án, SMS/email gateway và S3/R2 thật; cần cấu hình và nghiệm thu trước production. Worker có thể chạy lại an toàn nhưng nguồn đối soát xóa độc lập với backup, mã hóa/retention tự động 30 ngày và quy trình restore vận hành **chưa có hạ tầng**; tài liệu chính sách không được tính là chức năng đã triển khai. Angular và đầy đủ Chat/Listing/Notification nằm ngoài nhiệm vụ; đã cung cấp public visibility/interaction/history projection để các module đó tích hợp. CI được cập nhật Redis nhưng chưa có run cho thay đổi chưa commit/push. Repository không có lint script riêng; không báo cáo lint PASS. Cảnh báo Vitest/CommonJS hiện tại không làm test thất bại.

## Chuẩn bị Auth + User — 13/11/2026

Đã áp dụng riêng `0004_auth_user_preparation` trên **`looply_test`**, sau khi xác minh URL, `current_database()`, ba migration trước đó và dữ liệu tương thích. Không kết nối Production, không áp dụng migration lên Development, không reset/seed hoặc chỉnh sửa dữ liệu User hiện có. Ba file migration cũ giữ nguyên; checksum test khớp nội dung sau xét LF/CRLF.

| Kiểm tra thực sự đã chạy | Kết quả |
| --- | --- |
| `prisma validate --config prisma7.config.ts` | PASS, Prisma 7.10.1. |
| `prisma generate --config prisma7.config.ts` | PASS, không bật preview feature. |
| `vitest run --config vitest.integration.config.ts tests/integration/auth-user-migration.test.ts -t existing` trước deploy | 3 PASS; một ca kiểm tra lịch sử sau deploy không được chọn bởi filter. |
| `prisma migrate deploy --config prisma7.config.ts` qua tiến trình gán `DATABASE_URL=TEST_DATABASE_URL` đã xác minh | PASS, chỉ áp dụng `0004_auth_user_preparation` vào `looply_test`. |
| `prisma migrate status --config prisma7.config.ts` với URL test đã xác minh | PASS, đủ bốn migration và database up to date. |
| `npm run test:integration` sau deploy và bổ sung regression lifecycle | **374/374 PASS, 19 file**, không skip/todo/only. |
| `npm test` | **68/68 PASS, 7 file**. |
| `npm run test:api` | **23/23 PASS, 1 file**. |
| `npm run typecheck` và `tsc --project tests/tsconfig.json` | PASS. |
| `npm run build` | PASS. |
| `git diff --check`, đối chiếu ba migration cũ/dependencies và schema logic/thực thi | PASS; không đổi migration cũ/dependencies, hai schema đồng nhất về mô hình dữ liệu. |

Phạm vi mới: email unverified được lưu/trùng, verified ownership được bảo vệ ở INSERT/UPDATE, case/ASCII/Unicode trim whitespace thống nhất với chuẩn hóa đã duyệt, không gộp dấu chấm/`+suffix`; username toàn `_` hợp lệ; timestamp đổi username nullable; lifecycle/default/tổ hợp timestamp, giữ unique username/email/phone qua cả bốn trạng thái cho đến cleanup tường minh; Display Name Unicode 1–60 (kể cả ký tự ngoài BMP), empty/overflow bị từ chối. Hai kỳ vọng cũ đã lỗi thời được thay đúng yêu cầu: cấm username toàn `_` và global email unique; các ca bảo vệ verified email vẫn được kiểm thử riêng.

Migration compatibility test tái tạo ba migration cũ trong schema ngẫu nhiên trên cùng `looply_test`, tạo User có sẵn rồi thực thi SQL mới. Chỉ bỏ transaction envelope khi test để helper sở hữu transaction rollback; không sửa file migration. Xác minh giữ nguyên toàn bộ field cũ/verified ownership, gán ACTIVE/NULL cho field mới, dừng trước thay đổi khi normalized email trùng hoặc Display Name cũ rỗng. Schema/fixture được rollback; catalog test kiểm tra đủ bốn migration và checksum.

Tổng persistence contract sau `0004`: vẫn 17 model, 36 FK RESTRICT/CASCADE, 17 PK ứng dụng và 17 cột VARCHAR; thêm hai CHECK (tổng 25), thay global email unique bằng partial expression index (18 unique thường và 7 partial unique), thêm một cột NOT NULL (106 lên 107). Đã đếm lại bằng catalog và replay schema cũ; con số 132 ghi trước đây trong tài liệu là sai. Các quan hệ và bảng OTP giữ nguyên. Sau test không còn fixture User/Province hoặc schema replay tồn dư.

Giới hạn: chưa triển khai hoặc kiểm thử service cooldown 30 ngày, chuyển trạng thái theo thời gian, worker/ẩn danh hóa, atomic invalidation email, OTP/re-auth Redis, SMS/email provider hay Auth/User API. Test ràng buộc unique không thay thế kiểm thử concurrency của service tương lai. Cảnh báo Vitest/CommonJS hiện có vẫn xuất hiện nhưng không làm các kiểm tra thất bại. Bằng chứng các đợt trước được giữ dưới đây theo thời điểm, không phải kết quả mới nhất.

## Trạng thái ngày 12/11/2026

**Đã sửa lỗi thời lượng video và NaN ở toàn bộ trường giá; kiểm chứng đạt toàn bộ Database Integration Test.** Sau khi áp dụng `0002_fix_media_duration`, `0003_reject_nan_prices` riêng trên `looply_test` theo phê duyệt của người dùng, lần chạy cuối có **337 PASS / 337 test**, thuộc 16 file. Không có test bị skip, todo hoặc only. Không đánh dấu hoàn thành chức năng trong checklist nghiệp vụ.

Nguồn đối chiếu: [schema thực thi](../../backend/prisma/schema.prisma), [migration 0001_init](../../backend/prisma/migrations/0001_init/migration.sql), [migration 0002_fix_media_duration](../../backend/prisma/migrations/0002_fix_media_duration/migration.sql), [migration 0003_reject_nan_prices](../../backend/prisma/migrations/0003_reject_nan_prices/migration.sql), yêu cầu [Media](../requirements/modules/MEDIA_REQUIREMENTS.md), [Chat](../requirements/modules/CHAT_REQUIREMENTS.md), [User](../requirements/modules/USER_REQUIREMENTS.md), [Auth](../requirements/modules/AUTH_REQUIREMENTS.md), [Listing](../requirements/modules/LISTING_REQUIREMENTS.md) và [Notification](../requirements/modules/NOTIFICATION_REQUIREMENTS.md).

## Cách chạy an toàn

Chạy từ thư mục `backend`, với `TEST_DATABASE_URL` được cấu hình riêng trong môi trường hoặc `.env` cục bộ. Không đưa credentials vào tài liệu hoặc log.

```powershell
npm run test:integration
npm test
npm run typecheck
npm exec -- tsc --project tests/tsconfig.json
npm run build
```

- [`test-database.ts`](../../backend/tests/helpers/test-database.ts) yêu cầu URL PostgreSQL có database chính xác `/looply_test`; không fallback sang `DATABASE_URL` và từ chối tham số ghi đè tên database.
- Trước khi mở transaction ghi, helper chạy `SELECT current_database()` trên **chính connection đó** và yêu cầu kết quả là `looply_test`. Mọi fixture, assertion ghi và cleanup dùng connection đã xác minh này; không chuyển database hoặc dùng connection ghi khác.
- Mỗi test dùng transaction riêng và `ROLLBACK` trong `finally`, kể cả khi CHECK làm transaction bị abort. Luôn đóng connection. Không commit, seed, truncate, reset hoặc migration.
- Test NOT NULL/VARCHAR dùng savepoint riêng cho từng cột. Test an toàn kiểm tra rollback sau cả thành công và exception bằng connection tiếp theo.
- Test Prisma sẵn có trong `database.test.ts` chỉ đọc tên database. Unit test mặc định chỉ chọn `src/**/*.spec.ts`; integration test chạy bằng cấu hình riêng, tuần tự giữa các file.
- `tests/tsconfig.json` kiểm tra cả test và source vì `npm run typecheck` hiện chỉ bao gồm `src/`. Không thay đổi cấu hình runtime hoặc phiên bản dependency.

## Phạm vi đã kiểm thử

| Nhóm | Ràng buộc / tình huống |
| --- | --- |
| User, Province | Username hợp lệ/không hợp lệ, độ dài 3–30; cặp email/phone với thời điểm xác minh; NULL tùy chọn; username/email/phone/avatar/code UNIQUE. |
| Auth | Token version >= 1; OTP attempts 0–5 và ngoài biên; OTP trước đăng ký chưa có user; UNIQUE refresh hash và Google user/subject. |
| Follow, Block, ListingFollow | Không tự follow/block; không trùng cặp; cặp đảo chiều độc lập; khóa ngoại. |
| Listing | SALE/EXCHANGE/RENT với giá và đơn vị thuê; giá 1 và giới hạn Decimal(15,0), zero/âm/overflow; title 10–150, description 20–5000; cycle/version; trạng thái xóa và deletedAt; enum không hỗ trợ. Giữ lại toàn bộ ca test ban đầu. |
| Media | Size dương; image không có duration; video 1–180 giây, zero/âm/181/NULL; PROFILE/LISTING/CHAT; TEMP/ATTACHED/DELETING; cover chỉ là ảnh listing attached chưa xóa; UNIQUE storage key, tối đa một cover/video chưa xóa trên cùng listing; thay cover, video đã xóa và listing khác. |
| Conversation, Participant | Shape LISTING/DIRECT; thứ tự UUID low/high; initiator thuộc cặp; self/missing/mixed fields; UNIQUE listing/contact, direct pair, conversation/user; FK read cursor. |
| Message | Text/emoji/ảnh/ảnh kèm text/card; độ dài text 1 và 5000, rỗng/space/5001; card không trộn text hoặc ảnh; FK image/proposal; UNIQUE proposal, image và conversation/sender/requestId; requestId cùng giá trị ở scope khác. |
| TransactionProposal | SALE/RENT/EXCHANGE và proposalKind, giá, rentalUnit; Decimal biên/overflow; PENDING/REJECTED/ACCEPTED đi cùng acceptedCycle/resolvedAt; createdCycle dương và acceptance cùng/later cycle; một PENDING mỗi conversation kể cả khác cycle; lịch sử terminal không giữ pending slot; một acceptance SALE/EXCHANGE mỗi listing/cycle; RENT nhiều acceptance; cycle khác được phép. |
| Notification | isRead/readAt; một MESSAGE chưa đọc/chưa xóa mỗi recipient/conversation; read/deleted/type/recipient khác; eventKey không trùng theo recipient, vẫn bảo vệ sau khi xóa; NULL eventKey được phép. |
| Outbox, ProcessedEvent | Attempts không âm; enum; JSON payload và giá trị mặc định; receipt UNIQUE consumer/event, consumer khác được phép. |
| Tất cả trường giá | `Listing.price`, `TransactionProposal.proposedPrice`, `TransactionProposal.listedPriceSnapshot`: NaN bị từ chối ở INSERT và UPDATE; kiểm tra SALE/RENT, LISTED_PRICE/NEGOTIATED_PRICE, snapshot EXCHANGE và các trạng thái proposal; Infinity/-Infinity bị kiểu numeric(15,0) từ chối; giá trị hữu hạn 1/max, snapshot NULL, EXCHANGE không có giá vẫn hợp lệ. |
| Toàn schema | 23 CHECK có assertion; 36 FK có ca orphan và đối chiếu catalog; 19 UNIQUE thường, 6 partial UNIQUE, 17 primary key; 106 cột NOT NULL (đã sửa số đếm tài liệu theo replay schema cũ); cả giới hạn đúng và overflow của 17 cột VARCHAR. Kiểm tra RESTRICT trên các bảng cha có lịch sử và CASCADE cập nhật Province; inventory test xác nhận đủ 3 cột numeric(15,0). |

FK `Conversation.initiatorId` và `contactUserId` bị ràng buộc bằng nhau trong shape LISTING: ca orphan phải thay cả hai để không bị CHECK chặn trước; PostgreSQL báo FK initiator trước. Catalog test kiểm tra riêng sự tồn tại và RESTRICT/CASCADE của cả hai FK, không tuyên bố đã cô lập lỗi runtime riêng cho FK contact.

Helper/fixture dùng chung nằm tại [`backend/tests/helpers/`](../../backend/tests/helpers/). Các bộ test nằm tại [`backend/tests/integration/`](../../backend/tests/integration/). User/Listing đã chuyển sang helper xác minh database thực tế trước ghi; không thay đổi các kỳ vọng hợp lệ ban đầu. Kiểu `ListingInput` đã bỏ giá trị `COMPLETED` không thuộc schema; có ca riêng xác minh database từ chối trạng thái này.

## Kết quả thực tế

| Lệnh / bước | Kết quả |
| --- | --- |
| `npm run test:integration` lần đầu, sau khi viết các bộ test | 277 PASS, 1 FAIL / 278; lỗi duy nhất là video thiếu duration. |
| Kiểm tra TypeScript của test | Ban đầu phát hiện lỗi inference union/object trong test mới; đã sửa kiểu tường minh. Không sửa schema hoặc mã ứng dụng. |
| `npm run test:integration` sau rà soát và bổ sung kiểm tra toàn bộ VARCHAR/defaults | **279 PASS, 1 FAIL / 280**, 14 file đạt, 1 file thất bại. Cùng lỗi video thiếu duration. |
| Prisma `migrate deploy --config prisma7.config.ts` qua tiến trình đã xác minh và ghi đè URL bằng `TEST_DATABASE_URL` | PASS; chỉ áp dụng `0002_fix_media_duration` trên `looply_test`. |
| `npm run test:integration` sau migration `0002_fix_media_duration` | **280 PASS / 280**, toàn bộ 15 file PASS; giữ nguyên ca hồi quy và toàn bộ kỳ vọng test. |
| Bộ hồi quy mới `price-special-values.test.ts` trước migration `0003` | 57 test: 31 PASS, **26 FAIL** tái hiện database chấp nhận NaN ở cả INSERT và UPDATE; dữ liệu rollback. |
| Prisma `migrate deploy --config prisma7.config.ts` qua tiến trình đã xác minh URL test, sau khi thêm `migration_lock.toml` | PASS; chỉ áp dụng `0003_reject_nan_prices` trên `looply_test`. |
| `npm run test:integration` sau migration `0003_reject_nan_prices` | **337 PASS / 337**, toàn bộ 16 file PASS; gồm 280 test cũ và 57 test mới, không làm yếu test. |
| `npm test` | PASS, 1 unit test / 1 file. |
| `npm run typecheck` | PASS. |
| `npm exec -- tsc --project tests/tsconfig.json` | PASS, bao gồm test mới. |
| `prisma validate --config prisma7.config.ts` qua CLI cài trong project | PASS. |
| `npm run build` | PASS. |
| `git diff --check` và rà soát whitespace của test mới | PASS. |

Vitest cảnh báo cấu hình `.ts` dùng ESM syntax trong package CommonJS khi loader native trở thành mặc định ở phiên bản tương lai. Cảnh báo không làm kiểm tra hiện tại thất bại; chưa thay cấu hình ngoài phạm vi test.

## Lỗi đã sửa và bằng chứng migration

**Lỗi trước sửa:** `ck_media_duration` cho phép `VIDEO` có `durationSeconds = NULL`. Test hồi quy `rejects video without duration` tại [`media-constraints.test.ts`](../../backend/tests/integration/media-constraints.test.ts) kỳ vọng CHECK từ chối, nhưng UPDATE thành công. Dữ liệu của ca thất bại đã rollback.

Nhánh video trong [migration ban đầu](../../backend/prisma/migrations/0001_init/migration.sql) kiểm tra `durationSeconds BETWEEN 1 AND 180` nhưng không yêu cầu `IS NOT NULL`. PostgreSQL chấp nhận CHECK khi kết quả là NULL, nên cần migration bổ sung để bảo đảm video có thời lượng hợp lệ.

**Quy tắc đã xác nhận:** VIDEO bắt buộc có số giây nguyên từ **1 đến 180**, bao gồm hai biên; IMAGE bắt buộc có `durationSeconds = NULL`. `MediaType` chỉ có IMAGE và VIDEO. Giới hạn tối đa 3 phút thuộc yêu cầu Media; giữ nguyên cận dưới 1 giây từ thiết kế/migration hiện hành. Prisma tiếp tục dùng `durationSeconds Int?` vì cột phải cho phép NULL đối với ảnh; không đổi cột thành NOT NULL toàn cục.

**Cách sửa:** migration [`0002_fix_media_duration`](../../backend/prisma/migrations/0002_fix_media_duration/migration.sql) thay `ck_media_duration`, giữ nhánh IMAGE và thêm `"durationSeconds" IS NOT NULL` vào nhánh VIDEO. DROP/ADD nằm trong một ALTER TABLE, bọc transaction; PostgreSQL kiểm tra dữ liệu hiện hữu trước commit. Nếu kiểm tra thất bại, thay đổi constraint rollback. Không cập nhật/xóa bản ghi Media.

**Trước áp dụng:** helper xác minh URL và `SELECT current_database()` cho kết quả `looply_test`; đọc constraint thực tế bằng `pg_get_constraintdef`; truy vấn kiểm tra có **0 bản ghi không tương thích**. Xác minh `_prisma_migrations` chỉ có `0001_init` đã hoàn tất và thư mục migration chỉ chứa `0001_init`, `0002_fix_media_duration`.

**Áp dụng:** dùng Prisma CLI đã cài trong project với `migrate deploy --config prisma7.config.ts`. Tiến trình cha gán `DATABASE_URL` của riêng tiến trình Prisma bằng giá trị `TEST_DATABASE_URL` đã kiểm tra; không sửa `.env`, không dùng URL development mặc định của config. Output Prisma xác nhận datasource là `looply_test` và chỉ áp dụng `0002_fix_media_duration`.

**Sau áp dụng:** truy vấn lại PostgreSQL xác nhận CHECK chứa `IS NOT NULL`, `convalidated = true`; lịch sử có đủ hai migration thành công, checksum từng file khớp `_prisma_migrations`. SHA-256 của `0001_init` và `backend/prisma/schema.prisma` trước/sau giống nhau. Chạy lại toàn bộ integration test, unit test, typecheck source/test và build: tất cả PASS. Không sửa hoặc làm yếu test hồi quy. Không còn lỗi thời lượng video trong phạm vi kiểm thử hiện tại.

## Sửa NaN và hoàn tất các vấn đề review

Rà soát cả schema và `information_schema.columns` xác nhận có đúng ba cột Decimal/Numeric, đều là `numeric(15,0)`:

| Model / trường | Ràng buộc sau sửa |
| --- | --- |
| `Listing.price` | `ck_listing_price_type`: thêm loại NaN cho SALE/RENT, giữ nguyên giá > 0, bắt buộc giá, quy tắc rentalUnit và EXCHANGE không có giá. |
| `TransactionProposal.proposedPrice` | `ck_proposal_kind`: thêm loại NaN cho SALE/RENT, giữ nguyên proposalKind, giá > 0, rentalUnit và EXCHANGE_CONTACT. |
| `TransactionProposal.listedPriceSnapshot` | CHECK mới `ck_proposal_snapshot_not_nan`: NULL hoặc giá trị khác NaN. Không tự bổ sung yêu cầu bắt buộc hoặc quy tắc dấu mới cho snapshot. |

PostgreSQL coi NaN lớn hơn số hữu hạn nên `> 0` không đủ. Migration [`0003_reject_nan_prices`](../../backend/prisma/migrations/0003_reject_nan_prices/migration.sql) thay hai CHECK giá và thêm CHECK snapshot trong cùng transaction; không cập nhật/xóa dữ liệu, không thay CHECK trạng thái/chu kỳ, partial index hoặc kiểu cột. Đã đối chiếu biểu thức SQL: sau khi bỏ đúng các điều kiện `<> 'NaN'::numeric` mới thêm, hai CHECK thay thế khớp toàn bộ biểu thức cũ, bỏ qua whitespace. `0001_init` và `0002_fix_media_duration` giữ nguyên SHA-256 trước/sau.

[`price-special-values.test.ts`](../../backend/tests/integration/price-special-values.test.ts) bổ sung 57 test. Trước migration, 26 ca NaN thất bại như dự kiến và 31 ca còn lại đạt. Sau migration, cả 57 test mới cùng 280 test cũ đạt; INSERT proposal sử dụng fixture riêng và giải phóng pending slot hợp lệ để lỗi UNIQUE không che lỗi NaN. Các trường hợp snapshot bao gồm PENDING/ACCEPTED/REJECTED và EXCHANGE. Các fixture và cả ca thất bại đều rollback.

Ngay trước deployment, xác minh lại `TEST_DATABASE_URL`, `current_database() = 'looply_test'`, lịch sử và checksum hai migration cũ; số bản ghi NaN ở mỗi cột đều **0**. Prisma CLI nhận URL test qua environment riêng của tiến trình con và chỉ áp dụng `0003_reject_nan_prices`. Không sửa `.env`. Sau deployment, cả ba migration hoàn tất, không rolled back và checksum khớp file; ba CHECK giá cùng CHECK duration đều `convalidated = true`, tổng số CHECK là 23.

Đã thêm [`migration_lock.toml`](../../backend/prisma/migrations/migration_lock.toml) theo định dạng Prisma Migrate với `provider = "postgresql"`. Comment của schema thực thi và bản thiết kế logic đã phân biệt đúng vai trò; `SCHEMA_REVIEW.md` dùng đúng tên `prisma7.config.ts`, cập nhật kết quả đã chạy và tiếp tục phân biệt SQL tham khảo với migration thực thi. Prisma validate, unit test, typecheck source/test và build đã chạy lại và PASS.

## Giới hạn kiểm chứng

Đây là kiểm thử ràng buộc database, chưa phải kiểm thử module/API hoặc concurrency của ứng dụng. Chưa kiểm chứng quy tắc xuyên bảng/side effect chưa được database tự bảo vệ: 1–5 ảnh và bắt buộc đúng một cover; kiểm tra nội dung MIME/dung lượng tối đa và storage; ownership của avatar/media/message; đúng hai participant; cùng conversation của card/read cursor/proposal; chống block/send race; bảo toàn snapshot; chuyển trạng thái Listing khi chấp nhận; worker retry/locking và realtime. Chi tiết theo [SCHEMA_REVIEW.md](SCHEMA_REVIEW.md). Các test UNIQUE tuần tự không thay thế kiểm thử các luồng race của service.

Chỉ thêm và áp dụng migration bổ sung đã được phê duyệt trên `looply_test`. Giữ nguyên `0001_init`, `0002_fix_media_duration` và định nghĩa model Prisma (chỉ cập nhật comment); không ghi `looply_dev`/`looply_prod`, không dùng migrate reset/db push, không thêm module/backend/frontend/dependency và không thực hiện thao tác Git thay đổi lịch sử hoặc tạo PR.
