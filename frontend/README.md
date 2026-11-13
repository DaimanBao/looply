# Looply Frontend — Auth + User

Angular 21, TypeScript strict, SCSS, standalone components, Signals, Reactive Forms và HttpClient. Kết nối API thật; không thêm dependency/UI framework. Project client-rendered, không bật SSR.

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
