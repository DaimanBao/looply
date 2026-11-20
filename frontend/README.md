# Looply Frontend — Auth + User

Angular 21, TypeScript strict, SCSS, standalone components, Signals, Reactive Forms và HttpClient. Kết nối API thật, Socket.IO client cho Chat; giữ UI framework hiện có. Project client-rendered, không bật SSR.

## Reminder Module

Card trong shell nhắc phone/email chưa xác minh và tỉnh/thành phố, không nhắc avatar.
Đóng/“Để sau” hoặc chọn cập nhật không nhắc lại trong cùng AuthSession, kể cả reload/tab mới;
refresh token giữ lượt cũ. Phiên mới kiểm tra lại hồ sơ. Tài khoản khác không nhận response cũ.
Các liên kết chọn đúng form phone/email và focus tỉnh/thành phố; vẫn dùng re-auth/OTP hiện có.
[Thiết kế và giới hạn](../docs/api/REMINDER_DESIGN.md).

Kiểm chứng local 20/11/2026: 10 trường hợp Reminder Angular riêng biệt PASS qua các lượt targeted;
Auth session/App và ProfileStore/Notification regression PASS; Angular test typecheck/build PASS.
Chrome trên `looply_test` + Redis test PASS sáu nhóm: guest/login, đa tab, reload/điều hướng,
phiên mới và lưu tỉnh, email OTP/re-auth và “Để sau”, đổi tài khoản đã đủ hồ sơ.
Ảnh tại `tmp/listing-e2e/reminder-{1440,390}.png`, report `reminder-report.json` (không commit).

```powershell
# Trong frontend, dùng các dependency đã cài theo hướng dẫn setup.
npm test -- --watch=false --include='src/app/features/reminder/**/*.spec.ts'
# Từ repository root; chọn port trống để giữ nguyên Backend/Angular development đang chạy.
$env:LOOPLY_E2E_API_PORT='3001'
$env:LOOPLY_E2E_UI_PORT='4201'
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat --reminders
```

Harness xác minh `looply_test` và Redis test riêng, cleanup fixture UUID/namespace.
Sau tích hợp shell, chạy lại `--chat --notifications`: cả sáu nhóm Chrome Notification/Chat PASS,
gồm badge/toast, presence, proposal, tìm card cũ qua cursor, responsive và đổi tài khoản.
Harden harness để chờ đúng nút thông báo có dữ liệu thay vì chỉ chờ container rỗng.
Chưa chạy Safari/Firefox, bàn phím thiết bị thật hoặc CI của thay đổi chưa commit này.

## Phân tích và thiết kế


Phạm vi là tài khoản nội bộ theo [Auth](../docs/requirements/modules/AUTH_REQUIREMENTS.md), [User](../docs/requirements/modules/USER_REQUIREMENTS.md) và [OpenAPI](../docs/api/openapi.json). Không thay schema/migration hoặc Backend business logic. Backend chỉ bổ sung công cụ Development xem fake OTP đã được phê duyệt riêng và timer hết hạn bộ nhớ fake.

Core quản lý transport/session; feature API clients giữ HTTP và DTO; page điều phối Reactive Forms/hiển thị; Auth sở hữu controls OTP/re-auth dùng lại qua public entry; User sở hữu hồ sơ, avatar và quan hệ. Chi tiết thuộc [Frontend Structure](../docs/structures/FRONTEND_STRUCTURE.md).

Tiêu chí kiểm chứng: bảo vệ route, OTP không có đường tắt, tự đăng nhập, cookie reload/rotation/revocation, không lưu token vào browser storage, profile/contact/avatar đúng contract, cooldown username, quan hệ có xác nhận/phân trang, PENDING_DELETION và hủy tường minh. Unit dùng mock; kiểm chứng tích hợp dùng Chrome thật với API/adapter thật, PostgreSQL `looply_test` và Redis test riêng.

## Chạy Development

1. Chạy PostgreSQL/Redis theo [Backend README](../backend/README.md). Database local phải là `looply_dev`, có migration đã duyệt và catalog 34 tỉnh/thành. Frontend/server không tự migrate hoặc seed.
2. Cấu hình Backend `.env`: JWT secret/OTP pepper độc lập, `REDIS_URL` local, `AUTH_ALLOWED_ORIGINS=http://localhost:4200`, `CORS_ORIGINS=http://localhost:4200`, `CORS_CREDENTIALS=true`, `SMS_PROVIDER=fake`, `EMAIL_PROVIDER=fake`, `MEDIA_PROVIDER=local`. `GOOGLE_CLIENT_ID` vẫn bắt buộc ở Backend; khi chưa có ID thật, dùng giá trị Development riêng không thuộc client Google thực tế và không gọi các endpoint Google.
3. Muốn nhập OTP thủ công, bật [CLI inspector Development](../backend/src/development/README.md); lấy challengeId từ Network metadata rồi đọc mã bằng CLI riêng. Looply không hiển thị OTP, dùng mã cố định hoặc bỏ qua xác minh.
4. Chạy Backend ở cổng 3000. Tại `frontend/`, chạy `npm ci` khi cần cài dependencies, rồi `npm start`. Mở `http://localhost:4200`.

`proxy.conf.json` chuyển `/api/**` tới Backend local, giữ Origin của browser, không rewrite cookie hoặc bỏ CSRF. Nếu đổi cổng Backend, sửa proxy tương ứng. Injection token `API_BASE` mặc định `/api`. Production cần reverse proxy cùng site cho `/api`, fallback route về `index.html`, TLS và cấu hình cookie/CORS/Origin đúng Backend; không dùng Angular dev proxy làm production hosting.

## Chức năng và API

Mọi path dưới đây có prefix `/api`.

| Luồng UI                     | API tích hợp                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| Đăng ký, tự đăng nhập        | `POST /auth/otp/request`, `POST /auth/register`, `GET /provinces`                              |
| Username/password, phone OTP | `POST /auth/login/password`, `POST /auth/login/phone`                                          |
| Khôi phục, re-auth           | `POST /auth/password/reset`, `POST /auth/reauthenticate`; password hoặc OTP phone đã xác minh  |
| Session                      | `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/sessions`, `DELETE /auth/sessions/{id}`  |
| Owner profile / username     | `GET/PATCH /users/me`, `PATCH /users/me/username`                                              |
| Thông tin xác thực           | `PATCH /users/me/email`, `/phone`, `/password` với OTP/re-auth đúng purpose                    |
| Avatar                       | `PUT/DELETE /users/me/avatar`, `GET /users/{id}/avatar`; raw bytes JPEG/PNG/WebP tối đa 10 MiB |
| Profile công khai            | `GET /users/{id}`, `/followers`, `/following`                                                  |
| Follow/Block                 | `PUT/DELETE /users/{id}/follow`, `/block`, `GET /users/me/blocked`; cursor do server cấp       |
| Xóa/hủy xóa                  | `POST/DELETE /users/me/deletion`                                                               |

Không gọi Google hoặc giả nút Google hoạt động. PublicProfile chưa có viewer relationship flags hay lookup username; UI cung cấp Follow/Unfollow tường minh, không suy đoán trạng thái hoặc thêm endpoint. Profile được mở từ liên kết ID trong profile/list. Listing CRUD/Follow, Chat và tìm kiếm người dùng chưa có UI.

## Listing public discovery — Phase 5A

Trang `/` lazy-load Listing discovery; `/listings/:listingId` mở chi tiết, giữ `publicGuard` của Auth cho guest và lifecycle tài khoản. `features/listing/` tách pages/components, API decoding/query parameters, models/constraints và page-scoped pagination store. Không thay Backend, contract, dependencies hoặc cấu hình SSR.

- Nearby yêu cầu chọn Province từ catalog User; không suy đoán GPS hoặc tỉnh. National mặc định RANDOM, không gửi Province; chuyển Nearby để lọc tỉnh. Query có từ khóa chuyển sang NEWEST; hỗ trợ newest/oldest hoặc giá hợp lệ.
- Tìm theo title và suggestions debounce 300 ms; giữ nguyên tiếng Việt cho Backend chuẩn hóa. Đổi input/tab/filter/sort hủy request cũ ngay, xóa dữ liệu/cursor trước debounce. National giữ nguyên seed trong cursor Backend cấp, không tạo tham số seed ngoài contract.
- Giá nguyên VNĐ giữ dạng chuỗi; chỉ so sánh SALE hoặc RENT với DAY/MONTH đã chọn. EXCHANGE không có giá. Đổi loại không còn so sánh được sẽ bỏ giá/sort giá; min/max sai hiển thị lỗi, không gửi request.
- Cursor tải 12 bài/lượt, chặn tải đồng thời, loại trùng theo ID; có loading/empty/error/retry/end state, nút tải thêm và IntersectionObserver được dọn khi rời trang. Lỗi trang sau giữ dữ liệu/cursor để thử lại.
- Detail hiển thị mô tả, giá/đơn vị, Province, ngày đăng/cập nhật, owner công khai và contactPhone xuất bản riêng trên Listing; không suy ra phone/email từ owner. Server quyết định quyền: guest xem ACTIVE, owner có thể xem HIDDEN kèm thông báo, 403/404 có trạng thái không khả dụng.
- Media tải qua HttpClient/Bearer và API delivery hiện hành, kiểm tra MIME rồi tạo Blob URL; không đưa token vào URL hoặc dùng storage URL. Gallery chỉ tải asset đang chọn, native video có controls/playsinline, không autoplay; dọn subscription/URL khi đổi asset, identity hoặc rời trang. Rotation cùng identity không tải lại video. Có loading/error/retry cho HTTP và browser decoding.
- Video tải trọn tệp trước khi phát, seek trên Blob đã tải; chưa streaming Range trực tiếp trong browser. Deadline media mặc định 120 giây qua `LISTING_MEDIA_TIMEOUT_MS`, override bằng DI. Chưa đo bộ nhớ/độ trễ với video 100 MiB; codec phát được phụ thuộc trình duyệt. SSR chưa bật và chưa nghiệm thu hydration.

Kiểm chứng Phase 5A (13/11/2026): targeted tests cho query constraints, HTTP params/decoder/error, cursor reset/dedup/retry, debounce/stale cancellation, route guest/identity, gallery/video và observer lifecycle. Angular/source/test typecheck và production build đã đạt. CI theo commit/PR là nguồn kết quả full frontend suite; không chạy full suite local mặc định.

Chạy targeted tests từ `frontend/`:

```powershell
npm test -- --watch=false --include="src/app/features/listing/**/*.spec.ts" --include="src/app/core/auth/auth.guards.spec.ts"
```

Chrome integration harness chạy từ root (cần binary đã provision theo [Backend README](../backend/README.md#provision-ffprobeffmpeg)):

```powershell
node --env-file=.video-tools/video.env --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs
```

Harness tái sử dụng Backend fixture với PostgreSQL `looply_test` đã có schema và Redis test nonzero; xác minh database thực trước ghi, tạo owner/Province và 14 Listing qua API với ảnh/video tổng hợp. Dọn đúng graph/namespace do fixture sở hữu, không reset/migrate hoặc ghi development. Local media/staging và Chrome profile trong OS temp riêng; cổng 3000/4200/9230 phải trống. Report/screenshots tại `frontend/tmp/listing-e2e/` (Git ignore). Auth provider là fake tại ranh giới fixture; Listing HTTP, PostgreSQL, Redis, storage, video validation và Chrome là thật. Không coi đây là nghiệm thu đăng ký/OTP production.

Đã kiểm chứng local: guest search/suggestions tiếng Việt, 12→14 bài bằng cuộn/cursor không trùng, chọn Province, RENT DAY controls, detail/gallery, MP4 playback, HIDDEN/DELETED bị từ chối, responsive desktop/mobile. E2E chưa chạy CI; chưa nghiệm thu WebM, Safari/Firefox hoặc video dung lượng lớn. Final Review thực hiện riêng; Phase 5A không có Listing mutations/upload/Follow UI, Chat, Admin hoặc Payment.

## Listing management và media — Phase 5B

- `/account/listings`: bài ACTIVE/HIDDEN của chính người dùng, filter trạng thái, cursor 12 bài/lượt, loading/empty/error/retry và loại trùng. Header có liên kết quản lý khi tài khoản ACTIVE.
- `/listings/new`, `/listings/:listingId/edit`: tạo/sửa SALE, RENT (DAY/MONTH), EXCHANGE; gợi ý địa điểm/số điện thoại từ hồ sơ nhưng cho sửa độc lập và thông báo số sẽ được công khai. Validation text theo Unicode code point/btrim ASCII; giá chuỗi nguyên dương tối đa 15 chữ số, không mất chính xác.
- Editor kiểm tra chủ bằng `/users/me` và detail; Backend vẫn quyết định quyền. Mọi sửa/trạng thái/xóa dùng `expectedVersion`. Xác nhận sửa bài có Conversation, khóa loại giao dịch, mở lại HIDDEN đã có ACCEPTED trước khi sửa và xác nhận xóa mềm. Không tự retry mutation khi timeout/mất kết nối hoặc không rõ kết quả; yêu cầu kiểm tra danh sách/tải lại để tránh tạo trùng.
- Upload byte thô qua Auth interceptor: 1–5 ảnh JPEG/PNG/WebP tối đa 10 MiB/ảnh, tối đa 1 MP4/WebM 100 MiB/180 giây. Preview dùng Blob URL cục bộ, sơ kiểm MIME/size/duration khi browser đọc metadata; server kiểm tra nội dung thật. Trạng thái từng tệp cho biết đang tải/xử lý, sẵn sàng hoặc lỗi; retry tường minh, hủy upload khi bỏ tệp. Không hiển thị phần trăm byte vì transport hiện tại không cung cấp tiến độ upload.
- Đổi thứ tự ảnh, chọn cover độc lập và bỏ/thay ảnh/video trong bản nháp. Chỉ gửi manifest có đủ media sẵn sàng/còn hạn trong một mutation Listing; lưu thất bại/hủy không ảnh hưởng media cũ. Thay tệp tại giới hạn số lượng bằng cách bỏ tệp cũ khỏi bản nháp rồi chọn tệp mới; tệp cũ vẫn ATTACHED tới khi lưu thành công.
- Rời editor xác nhận bỏ thay đổi; không rời khi commit đang chạy. Cleanup best effort hủy TEMP biết ID, thu hồi URL/subscription. Nếu upload bị ngắt trước nhận ID hoặc mất phiên, server TTL/orphan cleanup chịu trách nhiệm dọn; không tự nhận đã hủy vật lý thành công. Media ATTACHED tiếp tục dùng delivery có xác thực hiện có.

Kiểm chứng local 13/11/2026: targeted form/HTTP decoder/editor/media/page tests; kiểm tra Angular template/source/test types và production build. Chrome + API/PostgreSQL `looply_test`/Redis test/local object store thật đã kiểm tra đăng nhập → upload ảnh/video → tạo bài → sửa → ẩn/hiện → xóa mềm, kèm responsive 1440/390 px. Auth provider fixture vẫn fake tại ranh giới OTP/email; không thay thế nghiệm thu production. Không chạy full suite local; full frontend và backend checks theo CI trên commit PR.

Chạy test tập trung từ `frontend/`:

```powershell
npm test -- --watch=false --include="src/app/features/listing/models/listing-form.spec.ts" --include="src/app/features/listing/state/listing-editor.spec.ts" --include="src/app/features/listing/data-access/listing-management.api.spec.ts" --include="src/app/features/listing/pages/editor.page.spec.ts" --include="src/app/features/listing/pages/my-listings.page.spec.ts" --include="src/app/features/media/**/*.spec.ts"
```

Harness dùng lại setup/cleanup an toàn của discovery, chỉ chạy một luồng quản lý khi có flag từ root:

```powershell
node --env-file=.video-tools/video.env --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --management
```

`video.env` phải trỏ đúng executable đã provision trong workspace hiện tại; có thể override `MEDIA_FFPROBE_PATH`/`MEDIA_FFMPEG_PATH` trong process nếu workspace đã chuyển vị trí. Report/screenshot trong `frontend/tmp/listing-e2e/management-*` (Git ignore); harness dọn đúng graph/namespace fixture, không migrate/reset hoặc ghi development. E2E này chưa đưa vào CI.

Giới hạn Phase 5B: chưa nghiệm thu Safari/Firefox, WebM trong browser hoặc tệp 100 MiB; delivery video vẫn tải Blob đầy đủ như Phase 5A. Tại Phase 5B chưa có consumer thông báo participant; phần này đã được bổ sung trong [Notification Module](#notification-module). Phase 5B không bao gồm Follow, Chat hoặc Admin; checklist tổng không được đánh dấu hoàn tất chỉ từ phạm vi Phase 5B.

## Follow Listing và tích hợp — Phase 5C

- Discovery card và Detail dùng cùng Follow control/state. Guest nhận lời mời đăng nhập với `returnUrl` đến detail, không tự Follow sau đăng nhập. Tài khoản ACTIVE có thể Follow/Unfollow; khóa thao tác theo Listing trong lúc request đang chạy. Chủ bài thấy liên kết quản lý thay vì tự Follow; quyền chủ lấy một lần từ `/users/me` cho mỗi danh tính, có retry nếu đọc quyền lỗi.
- `/account/followed-listings` được bảo vệ bằng active guard, dùng cùng card/media và cơ chế cursor 12 bài/dedup/retry của Discovery. Chỉ hiển thị ACTIVE mà server cho phép; HIDDEN giữ quan hệ nhưng không xuất hiện, có thể trở lại sau reopen. Unfollow thành công bỏ hàng khỏi UI; cursor vẫn dùng nguyên giá trị server. Có loading/empty/error/tải lại/tải thêm.
- Header, My Listings và Detail có liên kết giữa khám phá/quản lý/theo dõi. UI không tạo Chat, Notification hoặc endpoint mới; PUT/DELETE Follow không gửi version Listing hoặc tự phát notification.
- Cache Follow chung trong RAM được xóa khi đổi danh tính; rotation cùng phiên giữ cache và media. Mỗi GET đóng dấu thời điểm bắt đầu, không ghi đè mutation đã hoàn tất hoặc GET mới hơn. Request/payload cũ không cập nhật Follow, lỗi/quyền hoặc danh sách của tài khoản mới. Mutation chỉ cập nhật UI sau 204; retry là thao tác tường minh, dùng cùng PUT/DELETE idempotent.
- Dữ liệu server được đọc lại khi điều hướng/tải lại; không thêm realtime hoặc tự đồng bộ giữa các tab. Listing ẩn/xóa/Block không có trong danh sách theo dõi theo contract; UI không tạo màn hình để quản lý các quan hệ đã bị ẩn dù Backend vẫn cho Unfollow bằng ID.

Kiểm chứng local 13/11/2026: targeted tests cho shared Follow/identity/version, owner/guest control, HTTP decoder và followed pagination/dedup/retry; regression Discovery/search/filter/detail/token rotation/Auth guards. Chrome + API/PostgreSQL `looply_test`/Redis test thật đã PASS guest → login → Follow → danh sách → Discovery → Unfollow → đổi tài khoản → chủ quản lý, không phát thêm outbox event. Fixture chỉ tạo/xóa đúng graph của nó sau xác minh database, dùng local media/fake Auth provider tại ranh giới OTP/email. Không ghi development hoặc đổi schema/dependencies/contract.

```powershell
# Từ frontend/: kiểm thử tập trung
npm test -- --watch=false --include="src/app/features/listing/**/*follow*.spec.ts"
# Từ root: luồng trình duyệt nhỏ, dùng lại setup/cleanup của Listing harness
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --follow
```

Report local Git ignore: `frontend/tmp/listing-e2e/follow-report.json`. E2E chưa đưa vào CI; chưa nghiệm thu browser ngoài Chrome hoặc đồng bộ realtime giữa thiết bị. Kết quả toàn bộ tests/typecheck/build theo CI ở commit cuối PR; không chạy full suite local.

## Session và bảo mật

- Access Token chỉ trong RAM. Refresh HttpOnly Cookie do Backend quản lý: `SameSite=Strict; Path=/api/auth`, dùng `withCredentials` khi cần trao đổi cookie. Không đọc cookie bằng JS, không localStorage/sessionStorage token.
- Khôi phục cookie trước guard khi reload. Trong một Angular instance, các request chia sẻ một refresh. GET bị 401 thử lại tối đa một lần; dùng token đã refresh nếu request khác thắng trước đó. Không tự gửi lại mutation chứa OTP/proof vì 401 cũng có thể là xác minh sai. Khi mutation trả 401, kiểm tra authority bằng GET owner qua transport riêng; chỉ xóa phiên khi server xác nhận 401. Request đến muộn sau logout/login khác không được refresh hoặc ghi cache hồ sơ cũ.
- API có timeout mặc định 15 giây qua `API_TIMEOUT_MS`, gồm anonymous/session endpoints; không treo form vô hạn khi mạng không trả lời.
- Chủ động refresh khi token còn dưới 30 giây trước khi gửi mutation. Logout chờ rotation đang chạy rồi revoke cookie mới; chặn rotation mới trong lúc logout. Refresh cũ không được ghi đè login mới hoặc khôi phục authority đã clear.
- PENDING_DELETION chỉ dùng trang trạng thái/hủy xóa và logout; login không tự hủy. Yêu cầu xóa thu hồi phiên và về login; DELETING/DELETED không có thao tác khôi phục. Frontend không chạy worker.
- Validator dùng Unicode code point cho password/display name/bio, E.164 phone, lowercase username; Backend vẫn quyết định quyền, OTP replay/TTL/attempts, unique/cooldown và lifecycle.
- Avatar đọc protected bytes thành Blob URL tạm và giải phóng khi không hiển thị. Dùng text binding, không innerHTML hoặc storage URL do client tự khai báo.
- Có loading/error/empty states, retry, labels, keyboard forms, focus outline, skip link, role alert/status, responsive desktop/mobile. Thu hồi phiên rời trang riêng tư; lỗi logout được báo để thử lại.
- Single-flight trong một instance; nhiều tab vẫn chịu CAS/revocation Backend, không chia sẻ token qua storage. Tab thua rotation cần khôi phục/đăng nhập lại, không tái sử dụng refresh cũ.

## Kiểm thử

Từ `frontend/`:

```powershell
npm test -- --watch=false
npm exec -- ngc --project tsconfig.app.json --noEmit
npm exec -- tsc --project tsconfig.spec.json --noEmit
npm run build -- --configuration production
node e2e/auth-user.cjs
```

E2E dùng Chromium DevTools Protocol/WebSocket của Node 24, không cài thêm Playwright/dependency. Mặc định Chrome trên Windows; đặt `CHROMIUM_PATH` để chọn Chromium khác. Cần dependencies của hai project, Chrome, PostgreSQL và Redis local; các cổng 3000/3101/4200/9229 phải trống.

Harness đọc `TEST_DATABASE_URL`, kiểm tra URL và `SELECT current_database()` đúng local `looply_test` trước mọi ghi dữ liệu; Redis phải dùng database riêng khác `/0` (mặc định local `/15`, hoặc `TEST_REDIS_URL`). `e2e/backend.cjs` dùng composition Backend thật với config database test, upsert catalog 34 tỉnh chính thức chỉ trên test và chạy API/inspector bằng process Development cô lập; không thay quy tắc environment/database của server thông thường. Dùng khóa ngẫu nhiên trong RAM, không sửa `.env`, migrate/reset/truncate hoặc ghi/xóa dữ liệu Development. Password breach vẫn dùng HIBP thực tế và fail closed khi dịch vụ lỗi. Tạo tài khoản tiền tố `ui_` bằng API, giữ lại trên `looply_test`; password/code/token không ghi report/log. Fixture không dành cho đăng nhập thủ công. Không chạy song song harness với integration suite dùng cùng database/Redis. Các lượt cũ trước review từng tạo tài khoản `ui_` trên Development; review không xóa hay chỉnh sửa chúng.

Report/screenshot local tại `frontend/tmp/e2e/` được Git ignore; Chromium profile ở OS temp riêng. Browser và process do harness tạo được dừng khi hoàn tất. Không dừng process người dùng. Cần giữ profile temp trong phạm vi truy cập riêng của người phát triển vì Chromium có cookie phiên.

### Frontend CI

Workflow [`frontend-ci.yml`](../.github/workflows/frontend-ci.yml) chạy trên mọi PR vào `develop`/`main` và push tới hai nhánh này, tương ứng với phạm vi nhánh của Backend CI. Không lọc theo đường dẫn để check `Frontend checks` luôn có kết quả khi được chọn làm required check. Workflow chỉ tạo kết quả kiểm tra; việc bắt buộc check trước merge cần cấu hình branch protection/ruleset riêng, không được tự thay đổi trong nhiệm vụ này.

Job dùng Node.js 24, `npm ci` với `frontend/package-lock.json`, Angular compiler `ngc --noEmit` kiểm tra source/template, `tsc --noEmit` kiểm tra tests, Angular CLI/Vitest chạy unit/component không watch và build production bằng các lệnh phía trên. Không cài Backend dependencies, dùng production secrets, khởi động PostgreSQL/Redis hoặc chạy migration. Backend CI hiện hữu tiếp tục chạy độc lập.

Chưa bật formatting gate: `package.json` chưa có script formatting phù hợp. Kiểm tra local `npm exec -- prettier --check "src/**/*.{ts,html,scss}"` ngày 13/11/2026 phát hiện 55 file có lỗi định dạng sẵn có; cần xử lý riêng trước khi áp dụng gate toàn Frontend. Không thay mã nghiệp vụ hoặc dependency để làm CI đạt.

Chrome E2E **chưa được đưa vào CI và chưa được kiểm chứng trên GitHub Actions**. Harness CDP có thể dùng Chrome headless trên Linux qua `CHROMIUM_PATH`, nhưng cần một job tích hợp riêng: dependencies cả hai project, Prisma client đã generate, PostgreSQL 17 `looply_test` đã có schema/migration phù hợp, Redis 7.4 test riêng, `backend/.env` test tạm và các cổng nêu trên. Job tương lai phải xác minh database thực tế trước khi chuẩn bị schema/dữ liệu, giữ fake SMS/email và local media trong môi trường cô lập, chờ cooldown thật và cho phép kết nối HIBP. Không dùng file `.env` hoặc credentials production. Harness hiện upsert catalog và tạo tài khoản trên test, không tự migrate; không thể chỉ thêm lệnh E2E vào job Frontend hiện tại. Thiết lập hạ tầng và chạy thành công E2E trên Actions thuộc nhiệm vụ riêng.

### Bằng chứng local 13/11/2026

- Frontend unit/component: **35/35 PASS**, 14 file, gồm concurrency/revocation/stale refresh/logout race, interceptor, guard lifecycle, registration, re-auth phone, avatar fetch loop, native submit, pagination, reused route và cache riêng tư sau logout/chuyển tài khoản.
- Chrome E2E: **26 bước PASS**, toàn kịch bản thoát 0; API/PostgreSQL `looply_test`/Redis test thật, fake SMS/email và local media. Có OTP sai bị từ chối, register/auto-login, storage/cookie, reload/refresh, profile/avatar, email/phone, Follow/Unfollow/Block/Unblock, username cooldown, session revoke, đổi password với phone OTP re-auth, reset password, deletion/cancel, responsive 1440/390px và tab khác phát hiện logout khi gửi request tiếp theo.
- Chờ cooldown Redis thật, không sửa counter/clock Redis. Ca token hết hạn chỉ dịch đồng hồ JS trong tab để kích hoạt refresh; cookie rotation và kiểm tra phiên vẫn là Backend thật.
- Backend regression: **89/89 unit**, **23/23 API**, **406/406 PostgreSQL/Redis integration PASS**, chỉ dùng `looply_test` và Redis `/15` riêng.
- Production build, typecheck Angular/source/tests, Backend typecheck/build và `git diff --check` chạy khi chốt thay đổi. Không bật SSR, không báo SSR PASS. Scaffold không có lint script; không báo đã chạy ESLint.
- Runtime smoke với cấu hình `.env` local đã bổ sung: startup trên cổng tạm, database thực tế `looply_dev`, health 200, catalog 34 dòng, owner API thiếu Bearer trả 401, inspector mặc định tắt và graceful shutdown đều PASS.

Lỗi avatar Signal tự fetch lặp, native form submit và late response khi đổi profile đã được sửa, có regression test. E2E chưa nghiệm thu pagination nhiều trang với tập dữ liệu lớn, rotation đồng thời giữa nhiều tab hoặc browser ngoài Chrome; các nhánh có unit và/hoặc Backend integration tương ứng không được ghi là browser E2E PASS.

## Kết quả review trước PR — 13/11/2026

- **Cao, cache riêng tư phía client:** phản hồi owner đến muộn có thể ghi lại hồ sơ sau logout hoặc chuyển tài khoản. Đã kiểm tra identity version cho read/update/avatar/username trước khi ghi cache; regression test tái hiện lỗi rồi đạt sau sửa. Không thay đổi quyền truy cập Backend.
- **Trung bình, phiên:** request 401 đến sau logout có thể khởi động refresh; request đã dùng token mới nhưng tiếp tục bị 401 vẫn giữ UI đăng nhập. Đã chặn qua ranh giới identity, xóa authority sau xác nhận server và phân biệt OTP sai với session bị thu hồi. Probe của token cũ không được xóa token vừa rotate.
- **Trung bình, mạng:** request chưa có deadline có thể giữ loading vô hạn. Đã thêm timeout cấu hình được, kiểm thử lỗi mạng không phát sinh rotation ngoài ý muốn.
- **Trung bình, môi trường kiểm thử:** E2E trước review ghi Development. Đã chuyển sang actual-target guard `looply_test` và Redis test riêng; không nới quy tắc cấu hình server Production/Development.
- Fixture unit của deletion/username trước đây thiếu phiên đăng nhập tương ứng guard; đã thiết lập phiên rõ ràng để kiểm thử đúng điều kiện thực tế. Không giảm assertion hoặc bỏ test hợp lệ.
- Không phát hiện sai lệch contract cần sửa OpenAPI. Không thay dependency, schema/migration, quy tắc OTP hoặc nghiệp vụ đã duyệt. Không còn phát hiện nghiêm trọng chưa xử lý trong phạm vi tài khoản nội bộ.

## Giới hạn nghiệm thu

Google, SMS/email gateway, S3 thật chưa được tích hợp/nghiệm thu. Fake OTP và local media chỉ Development. Backup retention 30 ngày, restore và nguồn trạng thái xóa độc lập vẫn là yêu cầu vận hành chưa có hạ tầng. Không nghiệm thu worker sau 30 ngày bằng E2E frontend; Backend regression giữ trách nhiệm Chat history/Chat Media và cleanup.

Nhánh `feat/auth-user-frontend` tạo từ `develop` sau khi PR #14 merge; PR #15 đã được merge vào `develop`. Bằng chứng Chrome E2E phía trên là kết quả local của nhiệm vụ Auth/User, không phải kết quả E2E trên GitHub Actions. Phạm vi Frontend CI hiện tại xem mục riêng phía trên.

Đã bổ sung các biến Auth/Redis/CORS còn thiếu vào `backend/.env` cục bộ đã Git ignore, sinh khóa riêng ngẫu nhiên và giữ nguyên mọi giá trị cũ không rỗng. Inspector ở cấu hình local vẫn tắt mặc định; muốn dùng thủ công cần bật flag theo hướng dẫn. Các lượt E2E tự opt-in riêng trong môi trường process, không sửa file này.

Tham chiếu framework: [Angular functional interceptors](https://angular.dev/guide/http/interceptors), [route guards](https://angular.dev/guide/routing/route-guards), [provideAppInitializer](https://angular.dev/api/core/provideAppInitializer).
## Chat Module

- `/chat`: Inbox nhóm Listing → người liên hệ và DIRECT riêng; phân trang, hide có xác nhận, tự khôi phục khi có nội dung mới.
- `/chat/:conversationId`: lịch sử cursor 30 tin, cuộn lên/tải thêm, text/emoji, preview một ảnh ≤10 MiB, card giá niêm yết/thương lượng/trao đổi và accept/reject có xác nhận. Snapshot text độc lập Listing; ảnh hết hạn có placeholder.
- Listing Detail và Profile có điểm mở Chat; guest được mời đăng nhập, không tự gửi card. Session/route generation loại response cũ, retry giữ requestId và upload thành công; reconnect bị lỡ nhiều hơn một trang khởi tạo cursor mới, không ghép lỗ lịch sử.
- Socket.IO client 4.8.1 gắn token hiện tại, xoay credential/reconnect theo Auth; Blob private qua HttpClient. Development proxy thêm `/socket.io/**` với WebSocket; production reverse proxy cần chuyển tiếp cả `/api` và `/socket.io`, giữ Origin và WebSocket upgrade. Notification/Reminder không thuộc thay đổi này.

```powershell
npm run test -- --watch=false --include='src/app/features/chat/**/*.spec.ts'
npm run build
```

Chrome integration hai tài khoản độc lập (từ root, cùng điều kiện PostgreSQL/Redis/Chrome của harness Listing):

```powershell
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat
```

Harness dùng hai Chrome profile, cổng 3000/4200/9230/9231 phải trống. Dữ liệu/media tổng hợp thuộc fixture `looply_test`; Auth login/session/HTTP/Socket.IO/database/local storage thật, SMS/email vẫn fake ở ranh giới provider. Report `frontend/tmp/listing-e2e/chat-report.json`, ảnh `chat-1440.png`/`chat-390.png` là artifact local Git ignore. Chưa chạy browser này trong CI, chưa nghiệm thu Safari/Firefox/live S3 hoặc p95.
## Notification Module

Trang `/account/notifications`, chuông/badge và toast dùng cùng Auth/HTTP/Socket.IO hiện có.
Không hiển thị nội dung tin nhắn xem trước. Read/delete không sửa Chat unread; toast tự đóng sau
6 giây hoặc đóng thủ công đều không đánh dấu đọc. List có loading/empty/error, keyset, đọc riêng,
đọc tất cả theo biên server và xác nhận xóa mềm. Đích không khả dụng báo lỗi tại trang thông báo.
Conversation/card cũ tải thêm trang history và highlight đúng Message; heartbeat chỉ khi tab visible.
State loại phản hồi/pagination cũ khi đổi tài khoản và resync khi reconnect/focus.

Tại `frontend/`:

```powershell
npm test -- --watch=false --include="src/app/features/notification/**/*.spec.ts" --include="src/app/features/chat/**/*.spec.ts" --include="src/app/app.spec.ts"
npx tsc --project tsconfig.spec.json --noEmit
npm run build
```

Chrome smoke, từ root, sau khi chuẩn bị PostgreSQL/Redis `looply_test` theo
[hướng dẫn test](../docs/testing/LOCAL_TEST_GUIDE.md); dừng các test/harness khác dùng chung test DB:

```powershell
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat --notifications
```

Harness giữ port 3000/4200/9230/9231 riêng, không dừng dev server của người dùng; cần port trống.
Dùng hai browser profile tạm và form login thật, chỉ fake provider SMS/email tại fixture boundary.
Artifact không chứa credential: `tmp/listing-e2e/notification-report.json`,
`notification-1440.png`, `notification-390.png` (ignored).
Ngày 20/11/2026: 22 unit/regression tests PASS; Chrome 6 nhóm PASS (realtime/grouping/no-preview,
presence/target/read, read-all/delete, proposal accept, card cũ hơn 30 tin, reload/responsive/đổi account).
Chưa nghiệm thu Safari/Firefox, p95 hoặc nhiều Backend process.
Contract: [Notification design](../docs/api/NOTIFICATION_DESIGN.md).
## Chat & Inbox UI redesign — 20/11/2026

Nhánh `feat/chat-ui-redesign` tạo từ HEAD `261db04` có Chat, giữ nguyên toàn bộ thay đổi
Notification chưa commit từ nhiệm vụ trước. Nhiệm vụ này chỉ chỉnh Frontend, harness và tài liệu;
không sửa Backend, Prisma, API contract, dependencies, dữ liệu development hoặc lịch sử Git.

- `/chat` là workspace hai panel; `/chat/:conversationId` là child route cùng workspace,
  có `activeGuard` cho cả parent/child. Desktop/tablet giữ sidebar, mobile <=720px chuyển màn
  Inbox/Conversation và có nút quay lại. Chiều cao theo `100dvh`, cuộn riêng danh sách/lịch sử,
  header/context/composer nằm trong khung; CSS shell chỉ áp khi có Chat workspace.
- `InboxState` cấp workspace quản lý nhóm Listing→contact và DIRECT, search trong dữ liệu đã tải,
  pagination, refresh không xóa trắng list, hide/confirmation và ranh giới identity/revision.
  Deep link tự chọn đúng nhóm. API chưa có avatar/last-message preview/search toàn Inbox:
  hiển thị chữ cái từ display name, thời gian và unread thật; không tạo preview hoặc gọi history từng row.
- Message history có bubbles xanh/trung tính, nhóm sender/ngày và date separator theo timezone
  địa phương. Mở vào tin gần nhất, giữ cuối qua resize/ảnh tải muộn; khi đọc tin cũ không bị kéo xuống,
  có nút tin mới; prepend giữ anchor DOM. Card Notification cũ vẫn được seek/highlight.
- Composer gọn, textarea 44–112px, Enter gửi, Shift+Enter xuống dòng, không gửi giữa IME;
  validation 5000 Unicode code points/ảnh 10 MiB, preview/bỏ ảnh, giữ draft/retry khi lỗi.
  Proposal nằm trong tray thu gọn; card snapshot, accept/reject và các xác nhận giữ nguyên service.
- Chat realtime chỉ refresh Conversation đang liên quan hoặc khi reconnect, mỗi lần tải trang mới
  nhất chứ không tải toàn lịch sử. User ID được dùng lại trong cùng state/danh tính.

### Kiểm chứng và review

- 34 ca Angular khác nhau PASS qua targeted runs: 32 ban đầu; 8 ca Inbox/composer sau fix có
  7 ca trùng; 1 regression scroll/resize mới. Bao gồm Chat, Notification và App; không cộng thành 41.
- Typecheck test sources (`tsc --project tsconfig.spec.json --noEmit`) và production build PASS.
- Chrome hai profile, PostgreSQL/Redis `looply_test` và API/storage thật: Chat/UI 11 nhóm PASS;
  Notification regression 6 nhóm PASS. Không full suite Backend hoặc frontend; không có lint script.
- UI Review đã xem screenshot 1440/900/390px: alignment, overflow, independent scroll, composer
  trong viewport, menu/back và các touch target chính. Final Review kiểm tra state/account race,
  child-route guard, mutation retry, pagination, presence và phạm vi diff. Đã sửa loader chiếm
  thêm khoảng trống khi history sẵn sàng, scrollbar textarea rỗng, hide response cũ điều hướng nhầm
  tài khoản và scroll do geometry thay đổi. Mỗi lỗi state/scroll có targeted regression.

Chạy tại `frontend/`:

```powershell
npm test -- --watch=false --include="src/app/features/chat/**/*.spec.ts" --include="src/app/features/notification/**/*.spec.ts" --include="src/app/app.spec.ts"
npx tsc --project tsconfig.spec.json --noEmit
npm run build
```

Từ root, sau khi chuẩn bị test DB/Redis theo [hướng dẫn](../docs/testing/LOCAL_TEST_GUIDE.md),
dùng cổng riêng nếu dev server đang chạy. Chạy hai harness tuần tự vì cùng test DB/outbox:

```powershell
$env:LOOPLY_E2E_API_PORT='3001'
$env:LOOPLY_E2E_UI_PORT='4201'
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat --chat-ui
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat --notifications
```

Harness tạo proxy test riêng trong OS temp, chỉ thêm origin vào config fixture; không đổi `.env`,
proxy production/dev, không dừng server dev. Browser dùng cổng 9230/9231 và profile tạm.
Artifacts ignored: `tmp/listing-e2e/chat-report.json`, `chat-ui-conversation-{1440,900,390}.png`,
`chat-ui-direct-390.png`, `chat-ui-inbox-390.png`. Screenshot failure là bằng chứng debug cũ,
không thay thế report của lượt PASS cuối.

Giới hạn: chưa nghiệm thu Safari/Firefox hoặc bàn phím trên thiết bị mobile thật. Không bổ sung
last-message preview/avatar API, trạng thái online/typing hay mở ảnh lớn. CI chưa chạy vì nhiệm vụ
cấm commit/push/PR; kết quả local không phải CI. Không còn blocker đã biết trong phạm vi redesign.
