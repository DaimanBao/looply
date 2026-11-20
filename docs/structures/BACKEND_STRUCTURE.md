# BACKEND STRUCTURE — Looply (Đồ án 1)

## Mục tiêu
Tổ chức Express.js + TypeScript theo **Modular Monolith**, phân tách trách nhiệm để dễ mở rộng, kiểm thử và bảo trì. Đây là cấu trúc định hướng; chỉ tạo file khi chức năng thực sự cần.

```text
backend/
├── prisma/
│   ├── schema.prisma             # Mô hình dữ liệu Prisma
│   ├── migrations/               # Migration có kiểm soát
│   └── seed.ts                   # Dữ liệu mẫu nếu cần
├── src/
│   ├── app.ts                    # Khởi tạo Express, middleware, mount routes
│   ├── server.ts                 # Khởi chạy HTTP và realtime, shutdown
│   ├── bootstrap.ts              # Ghép app, logger, Prisma và HTTP server
│   ├── features.ts               # Composition root ghép public services, providers, routers và cleanup
│   ├── runtime/                  # Lifecycle startup/shutdown, không đọc environment
│   ├── config/                   # Đọc và xác thực cấu hình môi trường
│   ├── development/              # Inspector fake OTP opt-in: config, read-only reader và listener riêng
│   ├── shared/
│   │   ├── database/             # Prisma client/adapter, quản lý kết nối
│   │   ├── errors/               # Lỗi ứng dụng và xử lý lỗi chung
│   │   ├── http/                 # Serialization Decimal và contract cursor chung
│   │   ├── middleware/           # Auth request, validation, error handling
│   │   ├── logger/               # Logging có kiểm soát dữ liệu nhạy cảm
│   │   ├── utils/                # Tiện ích thực sự dùng chung
│   │   └── types/                # Kiểu dùng chung
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── listing/
│   │   ├── media/
│   │   ├── chat/                 # Conversation, message, đề xuất giao dịch
│   │   ├── notification/
│   │   └── reminder/             # Chỉ tạo backend logic nếu thực sự cần
│   ├── realtime/                # Socket.IO setup, xác thực, kết nối
│   ├── jobs/                    # Hạ tầng outbox claim/lease/retry và vòng poll không chồng lấn
│   └── routes/                  # Router tổng hợp hoặc health endpoint
├── tests/                       # Integration/E2E và test helpers
│   ├── api/                     # HTTP integration với dependency test, không mở database
│   ├── integration/             # Database integration riêng trên looply_test
│   └── helpers/                 # App factory, fixture và connection guard cho test
├── scripts/inspect-otp.cjs       # CLI Development riêng; không thuộc build/API công khai
├── README.md                    # Cấu hình, chạy và kiểm chứng Backend Core
├── .env.example
├── package.json
├── tsconfig.json
├── vitest.config.ts             # Unit tests trong src/
├── vitest.api.config.ts         # HTTP integration trong tests/api/
└── vitest.integration.config.ts # Database integration trong tests/integration/
```

## Cấu trúc bên trong một module

Notification hiện có service quản lý, source service chọn recipient, repositories quản lý/outbox,
worker, presence và events; public composition tại `modules/notification/index.ts`.
Composition root nối presence với Chat producer và cùng Socket.IO gateway; Chat/Listing không
chứa logic lưu/quản lý Notification. Worker tái sử dụng vòng poll tại `jobs/`.

```text
modules/<module>/
├── <module>.routes.ts            # Khai báo endpoint, middleware
├── <module>.controller.ts        # Nhận request, trả response
├── <module>.service.ts           # Điều phối nghiệp vụ và quy tắc
├── <module>.repository.ts        # Truy cập dữ liệu khi cần
├── <module>.schema.ts            # Zod validation cho đầu vào
├── <module>.types.ts             # Kiểu dữ liệu của module
└── *.spec.ts                     # Unit test gần mã nguồn
```
Không bắt buộc mỗi module phải có đủ mọi file. Với module phức tạp, tách tiếp theo tính năng (`sessions/`, `otp/`, `conversations/`, `messages/`, `proposals/`...), giữ cùng nguyên tắc phân lớp; **không dồn toàn bộ module vào một file lớn**.

Auth hiện tách `identity/`, `sessions/`, `credentials/`, `otp/`, `redis/`, `security/`, `providers/` và `http/`; `auth.module.ts` chỉ ghép thành phần Auth. User có profile/relations, `deletion/`, avatar service và HTTP handlers; Media sở hữu processor, object store và lifecycle metadata cho avatar, Listing và Chat. Public interfaces nằm ở `modules/*/index.ts`; composition root được phép ghép repositories/providers riêng của từng module, service của module khác phải dùng public API. Username validation thuộc User, credential/OTP/session thuộc Auth. Shared chỉ có HTTP helpers, validated DTO access, middleware chung, principal shape và generic resource locking.

`modules/user/username.ts` là public entry riêng cho quy tắc username, không phụ thuộc service/HTTP/Auth. Auth nhập trực tiếp entry này để tránh vòng runtime `auth.schema -> user/index -> UserService -> auth/index -> auth.schema`; các nghiệp vụ User khác dùng `user/index.ts` như trước.

Cleanup coordinator thuộc `user/deletion/deletion.worker.ts`, không sửa/xóa Chat Message hoặc Chat Media; nó gọi public Auth/Media cleanup services, cùng transaction khi hoàn tất lifecycle User. Media sở hữu storage/asset cleanup; `jobs/` chỉ sở hữu hạ tầng outbox/lease/poll. Side effect storage ở ngoài transaction, ghi nhận bằng media state/outbox để retry. Runtime nhận lifecycle hook riêng cho Redis/worker, không đọc environment; `server.ts` là nơi đọc/xác thực cấu hình. Tests HTTP có database thật đặt trong `tests/integration/`; `tests/api/` tiếp tục chỉ chứa Core HTTP tests không mở database.

Media có `listing-media.service/repository.ts` cho primitive ảnh, `listing-manifest.service.ts` sở hữu final membership/cover/detach/delivery, `listing-image.ts` decode/tạo rendition, và `listing-upload.*` cho HTTP upload/cancel. `media-cleanup-event.ts` deduplicate outbox, `media-object-keys.ts` định nghĩa rendition versioned và `media-orphan-recovery.service.ts` đối chiếu local inventory với metadata. Public services export qua `media/index.ts`; `features.ts` ghép dependencies. `chat-media.service/repository.ts` tái sử dụng processor/storage, sở hữu upload CHAT, scope Conversation và cleanup TEMP; không tạo pipeline xử lý ảnh thứ hai.

Chat có `conversation.service.ts`, `message.service.ts`, `proposal.service.ts`; `chat-access.ts` cung cấp cổng membership/session dùng chung. `chat.repository.ts` chứa query, `chat.dto.ts` projection an toàn, `chat-policy.ts` cursor/retention thuần, `chat-retention.service.ts` thu hồi snapshot và điều phối cleanup. `chat.routes/controller/validation/schema.ts` tách HTTP; `realtime/chat.gateway.ts` dùng chính các service REST, kiểm tra lại quyền mỗi lần phát. `chat.module.ts` ghép nội bộ và `chat/index.ts` là public entry. Listing cung cấp `acceptListingTransaction` qua `listing/index.ts` để sở hữu chuyển trạng thái khi Chat accept. Bootstrap gắn Socket.IO, vòng cleanup Chat và consumer Notification; runtime đóng websocket trước khi đợi HTTP shutdown. Reminder chưa có runtime.

Listing có `listing.routes/controller/validation/schema.ts` cho CRUD/management; `listing.service.ts` quản lý quyền, version, trạng thái và transaction; `listing.repository.ts` truy cập Listing/Province, facts Conversation/Proposal và outbox. `listing.dto.ts` serialize public fields, `listing-cursor.ts` quản lý keyset My Listings, `listing-search.ts` chuẩn hóa searchTitle dùng chung với discovery. Phase 3 thêm `listing-discovery.*` tách schema/validation/controller/routes/service/repository, `listing-discovery-cursor.ts` gắn query/viewer/scope/asOf/seed, và `listing-follow.service/repository.ts` cho quan hệ unique hiện có. Discovery dùng public User predicates cho SQL/Prisma, query bounded ở database rồi hydrate DTO. Follow tái sử dụng User→Listing locks và session gate. Listing gọi public `ListingManifestService` thay vì storage trực tiếp. Unit tests gần module; HTTP/PostgreSQL tests ở `tests/integration/listing-crud.test.ts` và `listing-discovery.test.ts`.

`development/` không được mount vào Express app hoặc Auth/User routes. `server.ts` chỉ tạo listener loopback khi config Development opt-in hợp lệ; reader chỉ đọc Redis và đối chiếu fake delivery, không sửa OTP flow. Config/listener từ chối Production; CLI không được sao chép vào `dist`. Chi tiết và hướng dẫn thuộc [OTP inspector](../../backend/src/development/README.md).

## Quy tắc sở hữu và phụ thuộc
- `routes → controller → service → repository`; controller mỏng, nghiệp vụ ở service, repository không chứa quy tắc HTTP.
- Module sở hữu dữ liệu và nghiệp vụ của mình; tương tác module khác qua public service/interface, không truy cập tùy tiện repository nội bộ.
- Auth sở hữu OTP/credential/session; User sở hữu hồ sơ/follow/block; Listing sở hữu bài đăng/trạng thái; Chat sở hữu hội thoại/tin nhắn/đề xuất; Media sở hữu xử lý tệp; Notification sở hữu thông báo.
- `shared/` chỉ chứa thành phần dùng chung thật sự, không trở thành nơi chứa nghiệp vụ của mọi module.
- Middleware xác thực không thay thế kiểm tra quyền sở hữu tài nguyên ở service.
- Tách side effect (SMS, email, storage, socket) sau interface phù hợp để dễ mock/test; không ghi log mật khẩu, OTP, token.
- API, database schema và cấu trúc thực tế phải khớp yêu cầu đã duyệt; thay đổi migration phải an toàn cho dữ liệu.
- Unit test đặt cạnh module; integration test sử dụng database **riêng** và không chạy thao tác phá hủy trên database dev/prod.
