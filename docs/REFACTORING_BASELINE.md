# Looply Phase 00 Refactoring Baseline

## 1. Executive Summary

Phase 00 is **PARTIAL**. The working branch starts at the audited application state. The approved Guidelines corrections and [Refactoring Plan](REFACTORING_PLAN.md) are in place. On 26 November 2026, fresh local integration passed all 584 tests after PostgreSQL and Redis isolation was verified. The browser harness now runs, with five scenarios passing and Listing Follow and Auth/User still failing. The [audit](CODEBASE_AUDIT.md) remains the historical record of the original findings and environment blockers.

## 2. Repository and Branch State

| Item | Evidence |
| --- | --- |
| Initial checkout | `develop`; local `develop`, cached `origin/develop`, and HEAD all pointed to `d2f64caf769efd0612ef26012370b2176484ebc2`. |
| Working branch | `git switch -c refactor/codebase-cleanup develop` created the authorized branch at the same commit after checking local/remote-tracking refs and worktrees. |
| Pre-existing work | `docs/CODEBASE_AUDIT.md` and `docs/ENGINEERING_GUIDELINES.md` were untracked. Audit SHA-256 is unchanged. A pre-edit snapshot was compared to the Guidelines after the approved edits. |
| Phase 00 changes | Guidelines corrections plus this report and the plan. Git continues to show all four documents as untracked. No commit, push, merge, or pull request. |

## 3. Audited Checkpoint Comparison

`git diff d2f64caf769efd0612ef26012370b2176484ebc2` found no tracked differences. The application, dependencies, workflows, schemas, and tests are identical, so exact-commit evidence still applies within its original scope. The new branch adds no source delta requiring a targeted re-audit. F14's Guidelines conflict and F04's misleading revocation wording were corrected during preparation. The F04 numeric policy question, formatting findings and other audit findings remain applicable. Fresh integration and browser results supersede the audit's local execution blockers only to the extent recorded here. F03 remains an open operational requirement.

## 4. Owner-Approved Decisions

- Execute internal Group A work before dedicated Group B fixes. Track investigations and operational work in Group C.
- Treat F01 as a dedicated behavior fix with a meaningful regression test and F02 as a dedicated recovery task preserving fail-closed operation.
- Defer account-deletion-aware backup and restore (F03) to operations with the underlying requirement still open.
- Resolve F04 through authoritative Auth requirements and explicit owner decisions. Preserve current runtime security and current-session checks.
- Preserve the current stack, contracts, architecture, behavior, UI/UX, and test tooling. Limit formatting to files in scope.

## 5. Engineering Guidelines Changes

RULE-02 now points to the [formatting standard](standards/CODE_FORMATTING.md) for UTF-8, two spaces, English identifiers, Vietnamese project-owned comments/JSDoc/TSDoc, 100-character print width, double quotes in Backend, and single quotes in Frontend. Existing Prettier, Angular, and TypeScript conventions apply. Comments remain proportionate, with meaningful explanations of rules and concurrency. Preserve generated comments, identifiers, API names, error codes, licenses and directives. The existing constraints on arbitrary length limits and unnecessary abstractions remain in force.

RULE-05 now follows the [Auth requirements](requirements/modules/AUTH_REQUIREMENTS.md) for token lifetime, rotation, and current-session revocation. It points to the distinct throttling boundaries without selecting thresholds. The targeted four-line replacement preserves the substance of all seven rules and existing line endings.

## 6. Auth Policy Comparison

Source and existing tests were reviewed for each boundary. Runtime values below are repository defaults and distinct from owner-approved product requirements. All integration tests cited in this table passed in the fresh suite. Source references include [Auth configuration](../backend/src/config/auth-config.ts), [Auth routes](../backend/src/modules/auth/auth.routes.ts), [Redis limiter](../backend/src/modules/auth/redis/ephemeral-auth.ts), [HTTP authentication](../backend/src/modules/auth/http/auth.middleware.ts), [session service](../backend/src/modules/auth/sessions/session.service.ts), and [Socket.IO gateway](../backend/src/modules/chat/realtime/chat.gateway.ts).

| Operation | Authoritative requirement | Current implementation | Existing test evidence | Original Guidelines, conflict, and clarification | Owner decision |
| --- | --- | --- | --- | --- | --- |
| Password login | AUTH-003 uses username and password hash. It defines no numerical throttle. | Fixed window, default 10 requests reaching password verification per normalized username per 900 s. It counts attempts before checking the password. Auth IP middleware applies independently. The [Backend README](../backend/README.md#chạy-auth--user) describes the defaults. | Successful password login in `auth-security.test.ts`. Shared limiter concurrency uses 3/60 s and establishes atomic counting. No exact default threshold/expiry assertion identified for this route. | “Login rate limit 5 per 15 minutes” conflicts with the current default when interpreted as password login. Document threshold, key, window and attempt-counting semantics after approval. | Yes. Confirm whether to adopt 10/900 or approve another explicit policy. |
| Auth IP traffic | AUTH requirements do not specify an IP quota. | Redis fixed window with default 60 requests per 60 s per request IP across `/auth`, including refresh and logout. | Core API 429/header tests validate the separate Express limiter. The Auth integration helper tests the Redis primitive. No exact Auth IP boundary assertion identified. | The old login statement did not describe this broader guard. Distinguish it from the credentials and OTP counters. | Yes if adopting or changing an exact product threshold. |
| Re-authentication | AUTH-015 allows password, verified phone OTP or linked Google. Proof is one-use, bound to action and session, with a five-minute lifetime. No numerical request quota is specified. | Default 5 attempts per 900 s per current session across re-auth methods, before credential verification. Proof lifetime is 300 s. | `account-management.test.ts` covers phone and Google re-auth and one-use change-password proof. `auth-security.test.ts` covers proof scope, expiry, replay and Redis outage. No exact attempt/window threshold assertion identified. | The five-attempt value matches this runtime default numerically. Its scope is a current session rather than a password login identity. Keep the quota distinct from the proof lifetime. | Yes if adopting or changing the attempt quota. The proof policy is already specified. |
| OTP login and destination budgets | AUTH-004 and common OTP rules specify five verification attempts for SMS, expiration, cooldown, send quota, lockout, purpose and ownership binding. | Redis Lua tracks destination quota/attempts across sends and checks binding on consume. Phone login also has the Auth IP guard. | Auth security integration covers shared attempts, send/cooldown/expiry, atomic use and ownership changes. | Five OTP verification attempts belong to the OTP policy. The old generic login wording could misapply this number to password login. | No for retaining the specified OTP policy. |
| Access Token and HTTP validation | AUTH-006/008/011 and the token rules require a 15-minute JWT and a current, unexpired, unrevoked server-side session. | JWT claims are verified before checking the session, subject/user match and account state. Protected mutations recheck current session under the relevant transaction/lock. | JWT claims unit tests and Auth integration for immediate 401 after revocation, pending deletion restrictions, and rejected older sessions. | Residual access after logout contradicts AUTH-008. A token can remain cryptographically valid while authentication rejects its revoked session. RULE-05 now follows the approved requirement. | No for retaining current checks and correcting wording. |
| Refresh rotation | AUTH-007 requires a valid refresh token, rotation on every use, denial of reuse, HttpOnly cookie and absolute seven-day lifetime. | Allowed Origin, hashed refresh secret, User lock and atomic compare-and-swap on the old hash and active expiry. Access JWT gets a fresh 15-minute lifetime. | Auth security integration checks one refresh winner. Browser Auth/User covers session restoration and rotation within its recorded results. | Existing rotation and expiry language aligns once tied to the authoritative requirements. | No for retaining approved behavior. |
| Logout and session revocation | AUTH-008 revokes the current session and refresh token and rejects later Access Token authentication. AUTH-012/013/016 define other-device, reset and owned-session revocation. | Origin-validated cookie logout marks the matching session revoked if present and clears the cookie. Device revoke scopes to the authenticated owner. Password change keeps the current session, reset revokes all. | Account management integration checks 401 for a subsequent access request, revocation ownership, password change, and reset. Auth security integration checks refusal of already-revoked sessions. | The former refresh-only/residual-access wording conflicts with requirements and runtime. Current server-side session revocation satisfies the required rejection. | No for preserving AUTH-008 and related requirements. |
| Socket.IO authentication and authorization | [Chat design](api/CHAT_DESIGN.md) calls for handshake, event, and emit revalidation, participant authorization and authenticated reconnect. | Gateway calls the session service at handshake, for handled events, and before delivery. Resource services enforce participation and current session where required. A stale connection is rejected on revalidation. | Five `chat-realtime.test.ts` cases include invalid handshake, per-event revocation, participant-only delivery, and reconnect. | No separate conflict under the current design. Use the same current-session policy across HTTP and realtime. | No for retaining approved behavior. |

The numeric defaults address different boundaries. The unresolved decision is the exact password-login policy, with separate decisions if the owner wants to formalize or alter IP and re-authentication defaults. A change should identify scope, what counts as an attempt, the window, and threshold/window tests. No runtime policy changed in Phase 00.

## 7. Test Environment Status

| Item | Fresh result |
| --- | --- |
| Node.js and npm | `node -v` → 24.22.2. `npm -v` → 11.19.1. Audit npm was 11.12.0. |
| Installed packages | `npm ls --depth=0 --json` showed 30 Backend and 16 Frontend direct packages and zero reported problems. Installed Prisma client and local test/formatting tools were available. |
| Docker and Compose | Docker Desktop installed. Engine initially absent. `docker desktop start --detach` restored Docker 29.9.1 with Compose 5.6.0. `docker compose config --quiet` accepted the existing config. |
| Stack | `docker volume inspect` confirmed the required external volume. `docker compose up -d postgres redis` reconciled the two Compose containers and reused the existing PostgreSQL volume. A mismatched legacy volume was flagged by Compose and left untouched. `docker compose ps` showed both services healthy. PostgreSQL 17.11 and Redis 7.4.12 were reported by the existing images. |
| Test config | Ignored `backend/.env` provided both test targets with no conflicting inherited overrides. Prisma test runtime uses `TEST_DATABASE_URL`. The CLI config uses `DATABASE_URL`, which must explicitly point at the verified isolated target for any future migration. The migration inventory already matched. |
| Browser setup | Chrome 159.0.8154.34 was installed at the existing harness default. CDP scripts are present and use separate Chrome profiles. A listener check found the documented browser ports available before execution. |

## 8. PostgreSQL and Redis Isolation Evidence

- **PostgreSQL — PASS, fresh read-only check.** `docker compose port postgres 5432` resolved to loopback port 5435. The effective test config selected `looply_test`, while the development config named `looply_dev`. Only the expected public-schema option was present and no database-selector override. A `pg` client using the actual test configuration queried `SELECT current_database()` and `inet_server_port()`. It confirmed `looply_test` on the Compose server and excluded both development and production databases. Reading `_prisma_migrations` verified all seven finished migrations and matching hashes through `0007_chat_reservation_version`. An initial preflight rejected all query options and stopped before connecting. The successful check allowed the known `schema=public` setting after inspection.
- **Redis — PASS, fresh read-only check.** `docker compose port redis 6379` resolved to loopback port 6380. A client using the actual configured test target issued `CLIENT INFO` and verified DB 15. The development configuration uses DB 0. The [Redis store](../backend/src/modules/auth/redis/redis-store.ts) independently checks the selected DB on connection and keeps the offline queue disabled.
- **Fixture scope.** [Database helpers](../backend/tests/helpers/test-database.ts) require the test URL/actual database and use rollback. [Migration fixtures](../backend/tests/helpers/migration-fixtures.ts) replay historical DDL in transaction-scoped schemas. [Feature fixtures](../backend/tests/helpers/auth-fixture.ts) validate the PostgreSQL identity and Redis database before writes, then clean owned UUIDs and Redis namespaces. No live migration deploy, reset or volume deletion was needed.
- **Browser scope.** The [Listing harness](../frontend/e2e/listing.cjs) uses the shared fixture with temporary storage. The [Auth/User harness](../frontend/e2e/auth-user.cjs) verifies the actual database before startup, uses fake SMS/email, and is documented to retain synthetic accounts and upsert the Province catalog on the test database. It used a process-local temporary storage root and kept the verified Redis DB. Browser runs were serialized with the integration suite and each other.

## 9. Video Tool Configuration Status

Both saved executable paths in ignored `.video-tools/video.env` failed path resolution. The existing `ffmpeg -version` and `ffprobe -version` commands reported the pinned `n8.1.3-35-gf1acb0a266-20261112` build. Tests used process-only `MEDIA_FFMPEG_PATH` and `MEDIA_FFPROBE_PATH` overrides to the verified executables. No ignored or tracked config was edited and no download was needed. The old saved paths remain stale. F12 belongs in Phase 04.

## 10. Baseline Build and Test Results

All rows apply to `d2f64caf769efd0612ef26012370b2176484ebc2` with no application changes. Package commands run from the corresponding package directory unless marked root. Historical local results are from [audit §4](CODEBASE_AUDIT.md#4-baseline-build-and-testing-results). Same-commit CI corroborates the covered checks. Phase 00 concentrated fresh runtime execution on previously unavailable evidence.

| Check | Command | Status | Evidence and limits |
| --- | --- | --- | --- |
| Backend source types | `npm run typecheck` | PASS | Reused audit and same-commit CI. |
| Backend test types | `node_modules/.bin/tsc --project tests/tsconfig.json` | PASS | Reused audit and same-commit CI equivalent. |
| Backend build | `npm run build` | PASS | Reused audit and same-commit CI. |
| Backend unit and V8 coverage | `npm run test:coverage` | PASS | Reused 166 tests in 25 files with working video overrides. The historical uncorrected environment failed six video cases. |
| Core API | `npm run test:api` | PASS | Reused audit, 23 cases in one file, and same-commit CI. |
| PostgreSQL/Redis integration | `npm run test:integration -- --reporter=dot` | PASS | Fresh, 584/584 in 34 files, 138.08 s. Process-only video overrides. Vitest config-loader and `pg` client-query deprecation warnings. |
| Prisma validation | `node_modules/.bin/prisma validate --config prisma7.config.ts` | PASS | Reused audit CLI validation with a process-local placeholder datasource. Fresh read-only migration identity/hash verification is separate. |
| Angular source and templates | `node_modules/.bin/ngc --project tsconfig.app.json --noEmit` | PASS | Reused audit and same-commit CI equivalent. |
| Angular test types | `node_modules/.bin/tsc --project tsconfig.spec.json --noEmit` | PASS | Reused audit and same-commit CI equivalent. |
| Angular production build | `npm run build -- --configuration production` | PASS | Reused audit and same-commit CI. Audit bundle 365.31 kB raw and 103.36 kB estimated transfer. |
| Angular unit/component | `npm test -- --watch=false` | PASS | Reused audit, 129 tests in 44 files, and same-commit CI. |
| Backend / Frontend lint | No configured command | NOT RUN | No existing lint script or configured ESLint check. |
| Source formatting | Root Prettier commands below | FAIL | Fresh 230 Backend/tests/scripts and 171 Frontend/E2E warnings. EOL-neutral diagnostic also FAIL, 3 Backend and 1 Frontend. |
| Backend dependency audit | `npm audit --json`; `npm audit --omit=dev --json` | FAIL | Fresh, three high entries in each scope, matching audit. |
| Frontend dependency audit | `npm audit --json`; `npm audit --omit=dev --json` | FAIL / PASS | Fresh, 16 moderate entries in full audit. The explicit production-only invocation returned zero. |
| Backend exact-commit CI | Existing Backend push workflow | PASS | Reused 20 Nov 2026 evidence covering isolated migration, unit, API, integration, types and build. [Backend CI run](https://github.com/DaimanBao/looply/actions/runs/44764420854) |
| Frontend exact-commit CI | Existing Frontend push workflow | PASS | Reused 20 Nov 2026 evidence covering templates/types, unit/component and build. [Frontend CI run](https://github.com/DaimanBao/looply/actions/runs/44764420471) |
| Git/Markdown checks | `git diff --check`, no-index checks and local link validation | PASS | Fresh, covers the tracked tree and the three deliverable documents. |

Formatting commands from the repository root. For the EOL-neutral diagnostic use `--end-of-line auto` in place of Backend `lf` and append it for Frontend.

```powershell
node frontend/node_modules/prettier/bin/prettier.cjs --check --print-width 100 --end-of-line lf 'backend/src/**/*.ts' 'backend/tests/**/*.ts' 'scripts/**/*.mjs' '!backend/src/generated/**'
node frontend/node_modules/prettier/bin/prettier.cjs --check 'frontend/src/**/*.{ts,html,scss,css}' 'frontend/e2e/**/*.cjs'
```

### Fresh browser evidence

The root command prefix for the Listing harness is `node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs`. The video variables were set in the executing process. The Auth/User harness used `node -` to invoke `require('./frontend/e2e/auth-user.cjs')` after injecting isolated temporary media and staging paths into the harness's in-memory dotenv parse result. Harness source, assertions, and saved env files remained intact. Results below count reported checks, which can group multiple assertions.

| Scenario | Command suffix or entry point | Status | Fresh local result |
| --- | --- | --- | --- |
| Listing discovery/detail | No arguments | PASS | 9 checks. Paging, search, responsive detail, and real media playback. |
| Listing management | `--management` | PASS | 7 checks. Image/video upload, create/edit, hide/reopen, delete. |
| Listing Follow | `--follow` | FAIL | 1 check before failure on both runs. The harness cannot click `Theo dõi bài đăng` after returning from login. |
| Chat and Inbox UI | `--chat --chat-ui` | FAIL (initial), PASS (repeat) | 9 checks before the first run exited 1 after reconnect. Targeted repeat passed all 11, including DIRECT hide/restore and account isolation. |
| Notification | `--chat --notifications` | PASS | 6 checks. Recipient-only realtime, card navigation, unread lifecycle and account isolation. |
| Reminder | `--chat --reminders` | PASS | 6 checks. Multi-tab and account isolation, reload/reconnect and real OTP/re-auth fixture flows. |
| Auth/User | `node -` with the Auth/User entry point and isolation wrapper above | FAIL | Three attempts each passed 14 checks before timing out on `/account/blocked`. Includes cookie rotation, expired Access Token refresh, avatar/contact and User Follow. The diagnostic repeat captured HTTP 429 for the blocked-list request. Later checks were not reached. |

## 11. Existing Failures and Limitations

- **Listing Follow harness mismatch.** The [CDP helper](../frontend/e2e/cdp.cjs) searches by exact `aria-label` when present. The [Follow button](../frontend/src/app/features/listing/components/listing-follow.html) has a title-specific label, while the [scenario](../frontend/e2e/listing-follow.cjs) passes the visible text. Login and return to detail passed. This failure leaves the Listing Follow browser flow unverified.
- **Auth/User browser throttling.** The [scenario](../frontend/e2e/auth-user.cjs) observed Block success feedback and then timed out waiting for a row after navigation. The repeat with read-only CDP diagnostics recorded refresh HTTP 200 followed by `GET /api/users/me/blocked` HTTP 429. The blocked-list route is outside the Auth-specific Redis IP gate and is covered by the [shared Core API limiter](../backend/src/shared/middleware/rate-limit.ts). Backend account and relationship integration passed. Keep the existing policy while investigating the harness request budget or sequencing.
- **Chat browser repeatability.** The first Chat/Inbox run failed after nine checks. The sanitized output did not retain the specific assertion. The same command passed all 11 on repeat. Treat the initial failure as unresolved intermittent evidence.
- Formatter failures reproduced the audit. `core.autocrlf=true` remains in effect. With `--end-of-line auto`, the reported files were `account-management.test.ts`, `auth-security.test.ts`, `price-special-values.test.ts`, and `media-draft.ts`. No formatter write was run.
- Backend Effect and Frontend development advisory counts match F10. Registry reports identify affected packages and dependency paths. Application reachability remains unverified and dependency changes are outside Phase 00.
- The Vitest loader warning is historical. The local integration run also emitted a `pg` warning about overlapping `client.query()` calls and future pg 9 behavior. It did not fail the suite. Establish the call site before a future driver upgrade.
- F01 remains an open dedicated behavior bug. Routine Chat smoke coverage does not reproduce the interleaved-invalidation defect. F02 remains a dedicated recovery design and test task.

## 12. Applicable Quality Metrics

Reuse the [audit measurement method and original metrics](CODEBASE_AUDIT.md#18-baseline-quality-metrics). Git-tracked physical line counts include blank/comment lines and exclude generated/dependency/build output. Backend app TypeScript is 161 files and 10,651 lines. Frontend non-spec TypeScript is 91 files and 6,149 lines, including one fixture. Frontend HTML/styles are 57 files and 4,061 lines. Direct runtime/dev declarations are 18/12 Backend and 9/7 Frontend. The audit's relative runtime import graph found zero cycles in either package. Historical Backend V8 unit coverage was 22.47% statements, 25.91% branches, 19.26% functions and 22.59% lines. Fresh integration is 584 tests across 34 files. No source change required recounting.

F07 and F09 need like-for-like measurements during their implementation phases, as specified in the [plan](REFACTORING_PLAN.md). Query counts will use actual Prisma/adapter executions on isolated PostgreSQL. Request counts will use Angular HTTP test instrumentation and browser CDP for profile GETs across the same Inbox sequence. No Phase 00 before/after counts or code-size targets were established.

## 13. Refactoring Readiness

Readiness refers to separately authorized implementation tasks. Future changes require fresh regression evidence appropriate to their risks.

| Phase and work | Readiness | Evidence and acceptance limits |
| --- | --- | --- |
| 01 · F06 Media upload | READY | Isolated integration and Chrome Listing management passed with pinned video tools. Characterize both upload paths and the revocation, expiry, and cleanup race boundaries before consolidating. |
| 02 · F07 Manifest queries | READY | Real PostgreSQL and current integration passed. Capture per-operation SQL counts before changing query shape and confirm error ordering and lifecycle outcomes. |
| 02 · F08 Listing cursors | READY | Isolated PostgreSQL integration and browser Listing discovery/keyset passed. Capture legacy cursor fixtures and investigate U02 before any input-policy decision. |
| 03 · F09 Inbox requests | READY WITH LIMITATIONS | Chat integration and targeted Chrome repeat passed. Capture repeatable browser/request-count evidence and confirm the first-run failure does not affect the acceptance scenarios. |
| 04 · F05 Worker diagnostics | READY | Isolated worker integration passed. Instrument and verify the processing and post-commit failures independently. |
| 04 · F12–F14 Documentation | READY | Existing binary and tool configuration facts are reproducible. F14 wording is aligned. |
| 05 · Group A regression and review | READY WITH LIMITATIONS | The verification stack is available. Final acceptance depends on completing Phases 01–04 and closing or explicitly scoping the browser gaps after targeted review. |
| 06A · F01 Dedicated Chat fix | READY WITH LIMITATIONS | The two-client harness runs. Group A comes first. Require a failing test for interleaved IDs and repeatable targeted browser evidence. |
| 06B · F02 Dedicated Redis recovery | READY WITH LIMITATIONS | Redis selection and normal integration are verified. Group A comes first. Fault injection needs a separately verified isolated setup that cannot interrupt runtime DB 0. |

## 14. Blockers and Required Owner Actions

- Assign a separately scoped follow-up for the Listing Follow selector and Auth/User browser request sequencing under the shared API quota. Preserve the behavior assertions and runtime thresholds, then repeat the affected scenarios. Docker and the local test stack are already available.
- Decide whether to formalize the default 10 password attempts per normalized username per 900 s, or specify a different threshold and counting policy. Consider exact IP and re-auth quotas separately if they are to become product requirements. This blocks a Phase 07 policy change.
- Review compatible dependency options in Phase 07 and approve any dependency or CI edits at that stage. F03 stays in the operational backlog for separate ownership and acceptance.

## 15. Final Preparation Status

**PARTIAL.** The branch, Guidelines, Auth analysis, plan, verified isolation, and fresh local integration baseline are complete. Browser verification remains incomplete for Listing Follow and Auth/User. Existing formatter failures and dependency advisories remain recorded. Phase 00 changed only the three documentation deliverables and left the original audit intact. Application source, test source, schema, migrations, tracked configuration, dependency files and CI were preserved. Group A implementation has not started.

## 16. Phase 00B — Ổn định baseline trình duyệt

### Repository và môi trường

Kiểm tra ngày 27/11/2026 trên `refactor/codebase-cleanup`, HEAD
`d2f64caf769efd0612ef26012370b2176484ebc2`. Cây tracked ban đầu sạch, với bốn tài liệu Phase 00
chưa được Git theo dõi. Các mục 1–15 ở trên giữ nguyên kết quả tại thời điểm Phase 00.

- `docker desktop start --detach`, `docker compose config --quiet`, `docker compose up -d postgres redis` và `docker compose ps` — **PASS**. PostgreSQL 17 và Redis 7.4 dùng các cổng loopback 5435 và 6380. Compose dùng volume đã có `looply-rebuild_postgres_data` và giữ nguyên volume cũ.
- Truy vấn chỉ đọc `current_database()`, `current_schema()`, `_prisma_migrations` và Redis `CLIENT INFO` — **PASS**. Đích thực là `looply_test`, schema `public`, bảy checksum khớp sau khi tính đến LF/CRLF, và Redis DB 15. Cấu hình development trỏ đến `looply_dev` và Redis DB 0.
- Chrome 159.0.8154.34, Node 24.22.2 và `ffmpeg -version` / `ffprobe -version` — **PASS**. Cả hai executable dùng build đã provision `n8.1.3-35-gf1acb0a266-20261112`, với override theo tiến trình.
- Kiểm tra listener và quyền sở hữu tiến trình — cổng 3000/3101/4200/9229/9230/9231 trống trước khi chạy. Các lượt chạy tuần tự với hồ sơ Chrome và media trong thư mục tạm riêng theo lượt. Listing/Chat dọn graph fixture và key Redis theo namespace UUID. Auth/User upsert danh mục tỉnh và giữ tài khoản tổng hợp trên test theo quy ước hiện có, với SMS/email giả và HIBP thật.

### Listing Follow

Lượt tái hiện đã quay từ form đăng nhập về đúng Listing và đạt 1 kiểm tra. DOM có đúng một nút khả dụng trong `app-listing-follow`, text `Theo dõi bài đăng`, accessible name `Theo dõi: <tiêu đề fixture>` và `aria-pressed=false`. `BrowserPage.click` ưu tiên so khớp chính xác `aria-label`. Kịch bản dùng accessible name theo tiêu đề fixture cho hai lượt Follow và một lượt Unfollow. Tiêu đề fixture có hậu tố ngẫu nhiên xác định đúng control trên trang chi tiết và Discovery. Các assertion về quan hệ lưu trong PostgreSQL, account switch, owner và outbox vẫn được thực thi.

### Auth/User và quota Core API

`app.ts` gắn Express limiter ở `/api` sau CORS và trước các route. Tiến trình Auth/User dùng
quota thực tế 100 request/60 giây, đo từ header draft-8 và cấu hình local. MemoryStore theo
tiến trình, với cửa sổ theo IP bắt đầu từ lần hit đầu tiên, đếm cả thành công lẫn thất bại.
`trust proxy=false`; API nhận cùng IP loopback cho browser qua Angular proxy, tab thứ hai,
health probe và HTTP trực tiếp của fixture. Các session khác nhau cùng dùng quota này.
WebSocket nằm ngoài `/api`; các lần kết nối lại hoặc thay đổi token kích hoạt tải REST của Angular.
Heartbeat Chat dùng socket. Auth còn có quota Redis riêng cho các route Auth. Route danh sách chặn
chỉ chịu limiter Core trong phép đo này.

Trace chỉ đọc ở response API phân biệt số lần gọi API thực với bản sao response qua Angular proxy.
Hồ sơ chỉ giữ method, route đã thay ID, status, thời gian, quota còn lại và thời gian reset.
Lượt cũ đạt 14 kiểm tra. Trong khoảng 9 giây từ /api/health có 100 request được limiter cho đi
tiếp và 5 request bị 429. `PUT …/block` trả 204 với `r=2; t=52`, refresh kế tiếp trả 200 với
`r=1; t=52`, rồi `GET /api/users/me/blocked` trả 429 với `r=0; t=52` và `Retry-After: 52`.
Bốn 429 còn lại thuộc Notification. Qua lần gọi danh sách chặn đầu tiên có 19 lần GET
Notification, 19 lần GET unread-count, 13 lần GET hồ sơ riêng, 12 lần refresh và 10 lần trình bày
Reminder. Các con số gồm cả request nền từ các lần tải lại Angular và các request thật của fixture.

Các bước điều hướng thông thường theo RouterLink có sẵn. Các lần tải tài liệu dùng để kiểm tra
route guard, refresh cookie, pending deletion và reload sau logout được giữ. Bước mô phỏng Access
Token hết hạn khôi phục đồng hồ trình duyệt sau assertion. Browser kiểm tra cookie refresh thực sự
đổi qua lần tải lại và giữ các cooldown OTP thực. Avatar và staging của Auth/User dùng thư mục tạm
riêng của lượt chạy.

Lượt đầu sau đổi trình tự đạt 26/26. Ở cùng mốc Block, request ghi trả 204 với
`r=31; t=52` và GET danh sách chặn đầu tiên trả 200 với `r=30; t=52`. Đến lần đọc
danh sách đó, số GET Notification và unread-count đều giảm từ 19 xuống 8, refresh từ
12 xuống 5, trình bày Reminder từ 10 xuống 4. GET hồ sơ riêng tăng từ 13 lên 15 do bước
đi qua trang tài khoản khi dùng liên kết. Luồng vẫn chạy liên tục qua Follow, Unfollow, Block
và Unblock. Các khoảng chờ OTP vốn có nằm sau nhóm thao tác này. Quota được áp dụng trong suốt
luồng và phép đo ghi lại request nền tự nhiên của ứng dụng.

| Lượt Auth/User | Tổng HTTP qua limiter | Đỉnh trong cửa sổ 60 giây | HTTP 429 | Lần GET danh sách chặn đầu tiên |
| --- | ---: | ---: | ---: | --- |
| Trước sửa | 105 | 100 được xử lý | 5 | 429, hết quota, còn 52 giây |
| Sau sửa trình tự | 138 | 89 | 0 | 200, còn 30 |
| Xác nhận cuối 1 | 138 | 89 | 0 | 200, còn 30 |
| Xác nhận cuối 2 | 138 | 89 | 0 | 200, còn 30 |
| Xác nhận cuối 3 | 142 | 93 | 0 | 200, còn 26 |

Các lượt hoàn chỉnh chạy qua nhiều cửa sổ, trong đó có hai cooldown OTP có thật. Mức sử dụng
trong một cửa sổ được suy ra từ quota còn lại nhỏ nhất ghi nhận ở API. Số liệu xác nhận đầy đủ
luồng điều hướng thông thường đã kiểm tra trong một tab, cùng bước logout ở tab thứ hai.

### Chat và Inbox

Phase 00 ghi nhận một lượt dừng sau 9 kiểm tra và thiếu thông tin về assertion. Hai lượt
điều tra Phase 00B giữ nguyên assertion và thu được các điểm dừng cụ thể:

- `chat-probe` — **FAIL**, 7/11, `UI timeout: older page prepended`. Harness kiểm tra
  `scrollTop` gần đáy ngay sau khi bấm nút tin mới, rồi ghi lại vị trí và phát sự kiện
  `scroll` tổng hợp để tải lịch sử. Điều kiện hình học gần đáy có thể đúng trước khi Chrome
  giao xong event cuộn và Angular cập nhật số đo viewport.
- `chat-scroll-trace` — **FAIL**, 10/11, `UI timeout: contact logout`. Trace DOM đo được
  31 tin và nút tải lịch sử trước khi cuộn. Bước prepend và giữ anchor, reconnect và
  DIRECT hide/restore đều đạt. API logout trả 204 và các GET Chat/hồ sơ sau đó trả 401.
  Assertion chuyển sang `/auth/login` hết thời gian chờ.

Harness chờ sự kiện `scrollend` của viewport sau khi trở về tin mới, rồi cuộn lên đầu và để
Chrome phát event cuộn. Vẫn kiểm tra tải thêm qua cuộn, việc giữ anchor, reconnect và các bước
DIRECT. Lỗi chụp ảnh chẩn đoán được xử lý riêng để giữ assertion gốc.

### Cách chạy và phạm vi regression

Các entry point từ thư mục gốc dùng công cụ hiện có:

```powershell
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --follow
node frontend/e2e/auth-user.cjs
node --require ./backend/node_modules/tsx/dist/cjs/index.cjs frontend/e2e/listing.cjs --chat --chat-ui
```

Phase 00B gọi các entry point qua launcher tạm `frontend/tmp/phase00b/run.ps1` để ghi status/headers
đã lọc, thu tên assertion, đặt đường dẫn video theo tiến trình và giới hạn 240 giây mỗi lượt.
Mỗi lượt dùng thư mục tạm mới. Có một lượt chuẩn bị **NOT RUN** cho mỗi entry point trước khi
sửa cách truyền đường dẫn Windows cho preload Node. Ba lượt đó dừng ở
`MODULE_NOT_FOUND`, trước khi khởi động Chrome hoặc thực thi harness.

- **PASS** — `npm test -- --watch=false` với chín file test chọn bằng `--include` cho
  App logout, SessionService, Auth interceptor, Relationships page, Listing Follow component/state
  và Chat MessageHistory/ConversationState/InboxState. Kết quả mới 39/39.
- **PASS** — `node --check` và Prettier `--check --end-of-line auto` cho
  `auth-user.cjs`, `listing-follow.cjs` và `chat-ui.cjs`.
- **SKIPPED** — chạy lại Listing discovery/detail, Listing management, Notification và Reminder.
  Phase 00 có kết quả **PASS** 9/9, 7/7, 6/6 và 6/6 tương ứng. Các mode đó gọi file riêng và
  các helper dùng chung `cdp.cjs`, `listing.cjs`, `chat.cjs` và `backend.cjs` giữ nguyên.
- **SKIPPED** — chạy lại toàn bộ integration, unit, typecheck và production build. Diff từ checkpoint
  giới hạn ở browser harness độc lập và tài liệu. Bằng chứng Phase 00 gồm 584/584 integration,
  166 Backend unit, 23 Core API và 129 Angular unit/component vẫn áp dụng trong phạm vi đã chạy.

### Kết quả browser và cổng lặp lại

| Kịch bản | Các lượt điều tra và sửa lỗi | Các lượt xác nhận cuối | Số PASS liên tiếp |
| --- | --- | --- | ---: |
| Listing Follow | `follow-before` **FAIL** 1/7, nút `Theo dõi bài đăng` không khớp accessible name. | `follow-1`, `follow-2`, `follow-3` đều **PASS** 7/7, exit 0. | 3/3 |
| Auth/User | `auth-before` **FAIL** 14/26, timeout danh sách chặn sau HTTP 429. `auth-1` **PASS** 26/26 sau sửa trình tự, trước khi thêm đường dẫn media tạm vào harness. | `auth-final-1`, `auth-final-2`, `auth-final-3` đều **PASS** 26/26, exit 0, 0 phản hồi 429. | 3/3 |
| Chat và Inbox | `chat-probe` **FAIL** 7/11 ở prepend. `chat-scroll-trace` **FAIL** 10/11 ở điều hướng sau logout. | `chat-final-1`, `chat-final-2`, `chat-final-3` đều **PASS** 11/11, exit 0. | 3/3 |

Cả ba lượt Chat cuối ghi nhận HTTP 200 với tham số phân trang lịch sử, HTTP 204 logout được
Chrome nhận, và hoàn tất kiểm tra account switch và từ chối truy cập hội thoại cũ. Timeout
logout từng thấy ở lượt điều tra chưa xác định được nguyên nhân và không tái hiện trong cổng
cuối. Ba lượt liên tiếp là bằng chứng lặp lại có giới hạn cho Chrome và fixture đã dùng.

Các thay đổi được lưu ở [Listing Follow](../frontend/e2e/listing-follow.cjs),
[Auth/User](../frontend/e2e/auth-user.cjs) và [Chat UI](../frontend/e2e/chat-ui.cjs).
`git diff --check`, kiểm tra phần Markdown bổ sung và đối chiếu prefix lịch sử — **PASS**.
Các cổng browser/API/inspector đã trống và tiến trình cùng thư mục tạm theo lượt đã dọn — **PASS**.
Xác minh chỉ đọc sau chạy vẫn thấy bảy migration khớp và Redis DB 15. Các log chẩn đoán
đã lọc nằm trong thư mục bỏ qua bởi Git `frontend/tmp/phase00b`.

### Group A readiness

| Phase và hạng mục | Trạng thái | Bằng chứng và phạm vi chấp nhận |
| --- | --- | --- |
| 01 · F06 Media Upload Finalization | READY | Integration Phase 00, Listing management 7/7 và công cụ video đã xác minh. Giữ các ca expiry, revoke và cleanup race theo kế hoạch. |
| 02 · F07 Manifest Queries | READY | Đã xác minh PostgreSQL và baseline integration. Đo truy vấn theo từng thao tác trong Phase 02. |
| 02 · F08 Listing Cursor Consolidation | READY | Integration và Chrome discovery/keyset 9/9 từ Phase 00. Giữ phép kiểm tra legacy cursor và U02 theo kế hoạch. |
| 03 · F09 Frontend Inbox Optimization | READY | Ba lượt Chat/Inbox đạt 11/11. Phase 03 vẫn cần phép đo GET hồ sơ trước/sau với cùng trình tự, gồm reconnect và account switch. |
| 04 · F05 Worker Diagnostics | READY | Worker integration từ Phase 00 áp dụng cho cùng mã. Kiểm chứng lỗi xử lý và lỗi sau commit theo kế hoạch. |
| 04 · F12–F14 Documentation | READY | Đã xác minh công cụ video và giữ hai tài liệu Phase 00 có liên quan. |
| 05 · Group A Regression and Review | READY | Baseline browser qua cổng lặp lại. Nghiệm thu Phase 05 phụ thuộc vào kết quả triển khai và regression của Phase 01–04. |

### Trạng thái baseline Phase 00B

**COMPLETE.** Ba kịch bản đạt đủ ba lượt liên tiếp và regression trong phạm vi đã đạt.
Audit, Guidelines và Refactoring Plan giữ nguyên checksum. Diff tracked chỉ có ba harness
trình duyệt. Backend, Frontend runtime, giới hạn và middleware bảo mật, API contract,
Prisma schema/migrations, dependencies và CI giữ nguyên ở checkpoint đã audit. Group A
chưa bắt đầu. Cổng này dùng Chrome local, chưa có bằng chứng browser CI hoặc trình duyệt
khác. F01, F02, quyết định ngưỡng Auth và các hạng mục đã hoãn giữ phạm vi trong kế hoạch.
