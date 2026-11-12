# Database Integration Test — Looply Đồ án 1

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
| Toàn schema | 23 CHECK có assertion; 36 FK có ca orphan và đối chiếu catalog; 19 UNIQUE thường, 6 partial UNIQUE, 17 primary key; 132 cột NOT NULL; cả giới hạn đúng và overflow của 17 cột VARCHAR. Kiểm tra RESTRICT trên các bảng cha có lịch sử và CASCADE cập nhật Province; inventory test xác nhận đủ 3 cột numeric(15,0). |

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
