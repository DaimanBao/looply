# Looply Codebase Audit

## 1. Executive Summary

**PARTIAL** · 26 November 2026 · `develop` at `d2f64caf769efd0612ef26012370b2176484ebc2`. The requested branch `refactor/codebase-cleanup` was absent from local and remote-tracking refs, so the audit used the current checkout.

Both production builds, four type checks, Prisma validation and 318 tests passed locally with the working video configuration. Both GitHub Actions workflows passed on the audited commit, including the Backend database integration step. The local PostgreSQL/Redis stack and browser tests were blocked. Formatting checks and three of four dependency audit commands failed. [Backend CI](https://github.com/DaimanBao/looply/actions/runs/44764420854) · [Frontend CI](https://github.com/DaimanBao/looply/actions/runs/44764420471)

| Status | P0 | P1 | P2 | P3 | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Verified findings | 0 | 3 | 8 | 3 | 14 |
| Investigation items | — | — | — | — | 3 |

The high-priority findings concern Chat freshness during bursts, Auth recovery following a Redis interruption and account-deletion-aware backup/restore. The most direct internal simplifications are shared Listing upload finalization, fewer manifest and Inbox queries, and consolidation of Listing cursor mechanics.

## 2. Audit Scope and Methodology

The [Engineering Guidelines](ENGINEERING_GUIDELINES.md) supplied RULE-01 through RULE-07. [Agent instructions](../AGENTS.md) and [Code Formatting](standards/CODE_FORMATTING.md) govern repository conventions. The [project overview](PROJECT_OVERVIEW.md), [functional checklist](requirements/FUNCTIONAL_REQUIREMENTS.md) and [module requirements](requirements/modules/) define product scope. The [OpenAPI spec](api/openapi.json), [transport conventions](api/CONVENTIONS.md), [architecture documents](structures/), [database documentation](database/README.md), [Backend README](../backend/README.md) and [Frontend README](../frontend/README.md) distinguish design, implementation and historical verification.

The audit inventoried tracked source, tests, scripts, migrations and configuration. It traced representative workflows in every module from entry points through authorization, persistence and client synchronization. It checked module imports, Angular forms, templates, SCSS and state boundaries, test isolation and operational configuration. Evidence combines source review, local commands and dependency advisories. Source observations identify code paths and implications. Runtime frequency and deployment reachability remain separate claims. The explicit English-language deliverable takes precedence over the usual Vietnamese documentation default.

The initial working tree contained the untracked Guidelines file with blob hash `15799fe5784fe84c5bfdbf8b1c96d7185215f845`. Existing tooling was used for the audit. No Graphify result was used.

## 3. Current Project Architecture

| Layer | Implementation and ownership |
| --- | --- |
| Runtime | Node.js 24, Express 5 and TypeScript. `server.ts` loads validated configuration, `bootstrap.ts` assembles the runtime, `features.ts` wires routers and the runtime manages dependency startup and shutdown. |
| HTTP | Helmet, CORS, request IDs, request limits, safe logging and error normalization. Feature routes compose middleware and controllers, with services and repositories owning business rules and queries. OpenAPI 3.1 describes the HTTP boundary. |
| Identity | Auth owns credentials, OTP, re-auth and sessions. User owns profiles, Province catalog, relationships and deletion. Session checks and User locks coordinate these workflows. |
| Marketplace | Listing owns publication, visibility, discovery, follow, versions and Listing transitions. Media owns file validation, object lifecycle, delivery and cleanup. |
| Communication | Chat owns conversations, messages, receipts, proposals and retained snapshots. Notification consumes committed Chat/Listing events. Both use the Socket.IO `/chat` namespace. Reminder evaluates profile fields and reserves one presentation per Auth session. |
| Data | PostgreSQL 17 and Prisma 7.10.1 for persistent state, SQL migrations for additional constraints, Redis 7.4 for ephemeral state, and local or private S3-compatible object storage. |
| Client | Angular 21, lazy standalone routes, feature-oriented state and data access, Reactive Forms, Signals, RxJS and SCSS. |
| Quality | Backend Vitest, Supertest, PostgreSQL/Redis integration and GitHub Actions. Frontend Angular CLI/Vitest, jsdom and native Chrome DevTools Protocol harnesses. |

## 4. Baseline Build and Testing Results

Windows PowerShell, Node `24.22.2`, npm `11.12.0`, existing installed dependencies. Commands were run from their package root unless specified otherwise.

| Check | Status | Evidence |
| --- | --- | --- |
| Backend source type check | PASS | `npm run typecheck` |
| Backend source and test types | PASS | Local `tsc --project tests/tsconfig.json` |
| Backend build | PASS | `npm run build` |
| Backend unit, initial | FAIL | `npm test`, 160 passed and six video cases failed across 25 files. The failures reported validator unavailable. |
| Video-only and coverage retries using the saved environment | FAIL | The video-only retry reproduced six failures, as did the coverage run. Both executable paths in the existing ignored `video.env` pointed to missing files. |
| Backend unit and coverage, corrected environment | PASS | `npm run test:coverage`, 25 files and 166 tests. Both FFprobe and FFmpeg reported the pinned `n8.1.3-35-gf1acb0a266` build after process-only path overrides to existing executables. |
| Backend Core API | PASS | `npm run test:api`, 1 file and 23 Supertest cases with Core test routers. |
| Backend integration | BLOCKED | Docker Desktop Linux engine was unavailable and configured local PostgreSQL/Redis test ports had no listeners. A listener on a different PostgreSQL port was left untouched. Actual test-target isolation could not be verified. |
| Backend lint | NOT RUN | No configured repository lint script or ESLint configuration was identified. |
| Prisma validation | PASS | Local `prisma validate --config prisma7.config.ts`, with a process-only placeholder datasource for config parsing. No database connection was used. |
| Angular source/templates | PASS | Local `ngc --project tsconfig.app.json --noEmit` |
| Angular test types | PASS | Local `tsc --project tsconfig.spec.json --noEmit` |
| Angular production build | PASS | `npm run build -- --configuration production`. Initial bundle 365.31 kB raw and 103.36 kB estimated transfer. |
| Angular unit/component | PASS | `npm test -- --watch=false`, 44 files and 129 tests. |
| Angular lint | NOT RUN | No lint script, builder or ESLint configuration was identified. |
| Browser E2E | BLOCKED | Auth/User, Listing, Chat, Notification and Reminder scenarios depend on the isolated PostgreSQL/Redis stack. |
| Formatting | FAIL | Prettier flagged 230 Backend/test/script files and 171 Frontend/E2E files with documented options. An EOL-neutral repeat reduced the counts to 3 and 1. See F14. |
| Backend dependency audit | FAIL | `npm audit --json` and `--omit=dev` each reported three high-severity package entries from one advisory. |
| Frontend dependency audit | FAIL / PASS | Full audit reported 16 moderate package entries from two advisories. `--omit=dev` returned zero. |
| Backend CI, audited commit | PASS | Push workflow on 20 November 2026. Jobs verified the isolated test database and passed the migration, unit, API, database integration, type check and build steps. This audit did not trigger the run. [Backend CI](https://github.com/DaimanBao/looply/actions/runs/44764420854) |
| Frontend CI, audited commit | PASS | Push workflow on 20 November 2026. Source/template and test type checks, unit/component tests and production build passed. [Frontend CI](https://github.com/DaimanBao/looply/actions/runs/44764420471) |

The corrected Backend run covered the same 166 tests. The original video failures reflect local tool resolution. Backend Vitest also warned about future native loading of ESM syntax in CommonJS configs.

## 5. Overall Codebase Assessment

The modular monolith gives the main workflows recognizable ownership. The most involved flows cross a trust or consistency boundary, including refresh rotation, Listing media attachment, proposal acceptance and account cleanup. These warrant keeping their locks, validation and explicit state transitions.

The clearest internal improvements remove repeated work within those boundaries. The recurring patterns are duplicate upload finalization, repeated cursor parsing and avoidable database or HTTP reads. No relative runtime import cycle was found in the scanned production sources. The checklist records 70 of 96 functions confirmed and marks genuine OTP delivery, Google UI, Listing composition on public profiles and backup/restore as incomplete. [Functional checklist](requirements/FUNCTIONAL_REQUIREMENTS.md)

## 6. Backend Audit

| Area | Workflow and assessment |
| --- | --- |
| Auth | Routes and middleware feed identity, credential, OTP and session services. Redis Lua atomically accounts for OTP attempts, expiry and single-use proofs. Session rotation checks the old digest under a User lock. Verified contact ownership is rechecked for authentication and password reset. F02, F04. [Auth requirements](requirements/modules/AUTH_REQUIREMENTS.md) |
| User | Explicit public/private profiles, valid Province selection, and User locks for Follow/Block. Deletion separates transactional state changes from storage cleanup and retains a historical tombstone. F03, F05. [User requirements](requirements/modules/USER_REQUIREMENTS.md) |
| Listing | Owner writes use `expectedVersion` and User→Listing locks. Discovery binds SQL values and loads projections from bounded keysets. The public `acceptListingTransaction` gate keeps Listing ownership within Chat's transaction. F07, F08, U02. [Listing/Media design](api/LISTING_MEDIA_DESIGN.md) |
| Media | Upload staging, content decoding, storage bounds, TEMP readiness and reference guards serve different failure modes. Delivery goes through authorized application endpoints. Cleanup protects attached and referenced objects. F06, F07, F12, U03. [Media requirements](requirements/modules/MEDIA_REQUIREMENTS.md) |
| Chat | REST and sockets share access/service logic. Message request IDs support idempotency. Proposal and Listing transitions commit together. Snapshots preserve past terms and enforce an independent image retention lifecycle. F01, F09. [Chat design](api/CHAT_DESIGN.md) |
| Notification | Committed outbox events are claimed with a lease. Recipient/member eligibility is checked under locks and invalidations follow persistence. Expected event IDs and monotonic boundaries guard concurrent read operations. F05, U01. [Notification design](api/NOTIFICATION_DESIGN.md) |
| Reminder | Public User profile reads and a Redis NX reservation provide one presentation per Auth session. The lean module reuses current connection, profile and routing infrastructure. [Reminder design](api/REMINDER_DESIGN.md) |
| Shared infrastructure | Routes and middleware are separate. `AppError`, request logging and Prisma lifecycle are centralized. Startup/shutdown calls share promises and the shutdown deadline bounds drain. Workers reuse the polling loop. F02, F05. |

Several paths explain where the module boundaries carry consistency guarantees:

- **Session refresh.** The cookie-only HTTP route checks Origin. Session lookup identifies the candidate and a transaction rechecks the current hash and user state under the User lock before rotation. Angular coalesces concurrent refresh within its service and guards response installation by identity generation. [Auth routes](../backend/src/modules/auth/auth.routes.ts#L40) · [Session rotation](../backend/src/modules/auth/sessions/session.service.ts#L76) · [Client refresh](../frontend/src/app/core/auth/session.service.ts#L102)
- **Listing edit and proposal acceptance.** The editor sends the expected version and manifest. Listing preserves owner and active-cycle checks under lock. Media takes the union of old/new asset locks before attachment changes. Chat routes proposal acceptance through the public Listing operation and writes its durable event in the same transaction. [Editor save](../frontend/src/app/features/listing/state/listing-editor.ts#L95) · [Listing update](../backend/src/modules/listing/listing.service.ts#L125) · [Media manifest](../backend/src/modules/media/listing-manifest.service.ts#L29) · [Proposal acceptance](../backend/src/modules/chat/proposal.service.ts#L230)
- **Notification and Reminder.** The worker resolves eligible recipients after acquiring locks, persists durable notification changes, then sends invalidations. Angular refreshes from REST and rejects late results from stale identities. Reminder reserves its presentation independently using the Auth session. [Notification worker](../backend/src/modules/notification/notification.worker.ts#L31) · [Notification client](../frontend/src/app/features/notification/state/notification.state.ts#L88) · [Reminder reservation](../backend/src/modules/reminder/reminder-presentation.store.ts#L14)

## 7. Frontend Audit

| Area | Assessment |
| --- | --- |
| Auth and routing | Lazy standalone routes and guards steer guest, active and pending-deletion accounts. `SessionService` holds access in memory, coordinates refresh within one application instance and guards responses by identity. The interceptor distinguishes safe reads from mutations. Cross-tab behavior remains unverified. |
| User and forms | Reactive Forms, shared OTP/re-auth inputs and identity-scoped private profile state are cohesive. Several User API responses rely on TS types, while Auth token, Listing, Chat and Notification boundaries perform explicit decoding. Retain distinct validation semantics. |
| Listing/Media | Discovery, Follow and Editor state address different concerns. The editor tracks version conflicts and dirty state. Media Draft owns upload subscriptions and object URLs. Gallery delivery includes explicit cleanup. |
| Chat/Notification | Chat separates inbox and conversation state, preserving composer drafts across resync. Notification handles stale identity, pagination and toast expiry. Key issues are dropped invalidations and redundant profile requests. F01, F09. |
| Reminder/shared UI | A session-scoped card directs users to existing profile flows. Feedback, account validators and layout serve common uses. Templates/SCSS are generally feature-local, with short inline UI where appropriate. Loading/empty states were read in source. Browser presentation was blocked. |

Identity guards, effect/listener cleanup, RxJS subscriptions and object URL disposal are valuable. There is no demonstrated basis for wholesale Angular state migration or deleting a component based on size alone.

## 8. Database and Data Handling Audit

Both Prisma files declare 18 models. The seven executable migrations add semantics beyond the Prisma shape, including verified email uniqueness, partial unique cover/video, pending proposal and accepted-cycle guards, and unread Notification grouping. Restrictive foreign keys and account tombstones preserve history. Requirements explicitly retain the legacy OTP table, which account cleanup still references. [Schema and migration ownership](database/README.md)

Reads generally use bounded keysets and projections. Listing search binds values and has an existing trigram index. Seeded random ordering requires a sort over eligible rows. The normalized search title, historical snapshots and Notification event watermarks serve different semantics. The specific per-asset query pattern in F07 can be addressed without schema changes. Measure Notification fan-out and storage-held transactions before changing persistence or indexes. No live plans or timing measurements were collected.

## 9. Security and Reliability Audit

Source evidence shows Argon2id hashing, random digest-stored refresh tokens, HttpOnly SameSite cookies and Origin checks, server-side session validation, bounded input/upload processing and explicit projections. Socket delivery rechecks session and applicable scope. Object storage uses generated keys, private delivery and bounded stream operations. Central logging redacts credential-bearing headers and public errors use safe codes.

F02 and F03 cover recovery gaps. F04 documents a policy conflict, and F10 documents affected package paths. No application-level critical security finding met the evidence threshold. Deployment HTTPS, production logs and provider/storage policy require separate evidence. [Auth transport](api/CONVENTIONS.md) · [Chat transport](api/CHAT_DESIGN.md)

## 10. Testing and Quality Audit

Backend unit coverage concentrates on policy, validation, configuration, media tools and runtime. The integration suite owns important evidence for constraints, session/OTP ownership, proposal and cleanup races, upload lifecycle and Socket.IO authorization. It checks actual test targets before fixture writes, with rollback or scoped cleanup. Core API tests exercise middleware and public HTTP errors with test routers. Existing coverage scope explains why a unit-only metric gives limited visibility into feature orchestration.

Angular tests exercise identity changes, interceptors, guards, state stores, response decoding, forms and UI actions. Server socket tests and isolated Angular state tests leave a seam at the realtime-to-page burst scenario in F01. Browser coverage exists in local harnesses and historical evidence. Its CI gap is F11. No tests were changed.

## 11. Dependencies and Configuration Audit

Both packages lock their resolved graphs. Prisma CLI/client/adapter resolve at 7.10.1. `socket.io-client` serves browser runtime and Backend integration tests from their respective manifests. `pg` serves the Prisma stack and test isolation. TypeScript runtime helpers, Angular builders, test environments and package executables can be in use through generated output, tooling and scripts. No direct dependency removal was verified after comparing those uses with imports and manifests.

Compose configures loopback PostgreSQL and Redis. Runtime validation, separate test variables and ignored local env files support environment isolation. F10 documents the actual advisories and F13 documents drift between planned and active tools. No environment values are included in the report.

## 12. Essential vs Accidental Complexity

| Preserve | Simplify with suitable verification |
| --- | --- |
| Fail-closed authentication, Lua atomicity, single-use proofs, refresh rotation | Duplicate upload finalization and cursor wire mechanics |
| Ordered locks, conditional writes, constraints and request idempotency | Per-asset manifest reads and repeated Inbox profile calls |
| Media completion markers, snapshot lifetime, private streaming and outbox fencing | Realtime invalidation logic that retains a single changed ID |
| Identity scopes, reconnect resync, resource cleanup and read boundaries | Worker failure reporting and misleading setup documentation |

## 13. Consolidated Findings Register

Verified indicates a source, configuration or execution finding. Source-confirmed behavior still needs the specified runtime regression. Approval applies to future changes. This audit recommends actions only.

### P1 — High

#### F01 — Chat can lose a conversation invalidation during a burst

**Frontend Chat · RULE-04/05/06 · SIMPLIFY · Bug Fix · High confidence from source.** `ChatRealtime` overwrites a single `changedId` and increments `revision` for each event. `ConversationPage` reads the latest ID in an effect and can skip its load if that ID belongs to another conversation. Multiple changes before the effect runs can leave the active conversation stale. Browser confirmation remains pending. [ChatRealtime](../frontend/src/app/features/chat/state/chat-realtime.ts#L43) · [ConversationPage](../frontend/src/app/features/chat/pages/conversation.page.ts#L83)

Retain all changed IDs until resync or deliver scoped events through a stream. Open conversations can refresh without disturbing the current draft and target. Risk is medium due to HTTP load and scroll. Verify interleaved different/same IDs, reconnect, identity switches and draft preservation. **Approval required** for the user-visible behavior correction.

#### F02 — Redis recovery requires a Backend process restart

**Auth/Reminder/runtime · RULE-05/06 · SIMPLIFY · Bug Fix · High confidence.** `RedisStore` disables reconnect and offline queuing. Auth and Reminder store operations fail closed when it is disconnected. The README explicitly requires a Backend restart even after Redis returns. A running HTTP process can therefore remain degraded after a transient interruption. [RedisStore](../backend/src/modules/auth/redis/redis-store.ts#L12) · [Bootstrap](../backend/src/bootstrap.ts#L44) · [Operations](../backend/README.md#chạy-auth--user)

Agree on bounded reconnect with target revalidation or process recycle through the existing supervisor. Surface degradation while retaining fail-closed behavior and disabled offline queuing. Risk is medium to high due to delayed replay and Redis target selection. In isolation, verify startup refusal, operation failure during interruption, recovery, expiry and shutdown. **Approval required** for the recovery policy.

#### F03 — Account-deletion-aware backup and restore remains incomplete

**User/operations · RULE-04/05 · KEEP · Architecture Change · High confidence for the documented gap.** The deletion worker fences the job, revokes sessions, performs private media cleanup and completes deletion. Approved User policy also requires encrypted, time-bounded backups and an isolated restore checked against independent deletion records. The repository explicitly documents those missing capabilities. A restore cannot yet be accepted as deletion-safe. [Deletion worker](../backend/src/modules/user/deletion/deletion.worker.ts#L39) · [Backup policy](requirements/modules/USER_REQUIREMENTS.md#backup-và-khôi-phục)

Keep the worker and treat recovery as a separately approved operational release requirement. This protects deletion guarantees across restore. Risk is high due to retention, permissions and data handling. Rehearse an isolated synthetic restore covering all deletion states, missing/incomplete deletion records and retention expiry. **Approval required** for operating architecture and data policy.

### P2 — Medium

#### F04 — Auth throttling and revocation policies disagree

**Auth documentation · RULE-04/05/07 · CONSOLIDATE · Documentation · High confidence.** RULE-05 says five login attempts per 15 minutes and residual access validity after logout. `AUTH_PASSWORD_LIMIT` defaults to ten per 900 seconds, consistent with the Backend README. The Auth requirements and `SessionService` enforce current server session checks on JWT-authorized requests. This divergence can misdirect future tests or weaken a revocation guarantee. [Guidelines](ENGINEERING_GUIDELINES.md) · [Auth config](../backend/src/config/auth-config.ts#L14) · [SessionService](../backend/src/modules/auth/sessions/session.service.ts#L36) · [Auth requirements](requirements/modules/AUTH_REQUIREMENTS.md#quy-tắc-chung)

Confirm the intended limit with the owner and align the Guideline wording with the agreed policy. Preserve current revocation checks during the review. Risk is low for clarification and high for a policy change. Verify threshold, expiry, and revoked sessions over HTTP and sockets. **Approval required** for Guidelines edits and security policy decisions.

#### F05 — Worker retry paths hide event-level failures

**Notification/User/shared jobs · RULE-05/06 · SIMPLIFY · Bug Fix · High confidence.** Notification and deletion workers catch processing failures, record backoff and return normally. `CleanupLoop` logs only thrown failures. Repeated event failures can therefore lack a safe operational signal. Notification additionally uses one catch for durable processing and post-commit invalidation. [Notification worker](../backend/src/modules/notification/notification.worker.ts#L18) · [Deletion worker](../backend/src/modules/user/deletion/deletion.worker.ts#L18) · [Cleanup loop](../backend/src/jobs/cleanup-loop.ts#L24)

Record safe failure categories and attempt counts at retry and distinguish a committed event from a delivery error. This makes recurring failures diagnosable. Risk is medium due to PII and retry semantics. Verify process and post-commit failures, replay, lease fencing and log field safety. **Approval not required** for internal telemetry preserving retry behavior. Changes to retry semantics need review.

#### F06 — Image and video uploads duplicate finalization

**Media · RULE-01/02/04/07 · CONSOLIDATE · Refactoring · High confidence.** `ListingUploadService.uploadFile` and `upload` independently lock User/Media, recheck the session, reload asset state and enforce TEMP expiry after writes. Identical invariants can drift between two media paths. [Video path](../backend/src/modules/media/listing-upload.service.ts#L36) · [Image path](../backend/src/modules/media/listing-upload.service.ts#L67)

Share one Listing upload finalization operation, retaining format-specific processing and DTO construction. One invariant then covers both paths. Risk is medium for stale session and cleanup races. Verify both media types, revocation after object write, cancel and exact expiry. **Approval not required** for an equivalent internal refactor.

#### F07 — Listing manifest validates metadata one asset at a time

**Listing/Media data access · RULE-03/04 · CONSOLIDATE · Optimization · High confidence for query shape.** Under media locks, `ListingManifestService.save` reads an asset and often its references for each final ID, then checks references on detached assets. Gallery limits bound cost, but repeated round trips extend a locked transaction. [Manifest](../backend/src/modules/media/listing-manifest.service.ts#L35) · [Repository](../backend/src/modules/media/listing-media.repository.ts#L35)

Load the required projection and reference flags for the locked set in bounded batches, keeping validation order and state transition writes. Measure round trips before and after. Risk is medium for error precedence and lifecycle rules. Verify mixed invalid assets, cover order, reference guards, cleanup races and rollback. **Approval not required** for equivalent queries. Schema changes require approval.

#### F08 — Listing cursors duplicate wire mechanics

**Listing pagination · RULE-01/02/07 · CONSOLIDATE · Refactoring · High confidence.** Owner and discovery cursors repeat canonical base64url/JSON parsing, binding hashes, serialization and validation error mapping. Their scopes and boundary schemas differ. This duplicates maintenance and contributes to divergence in timestamp checks. [Owner cursor](../backend/src/modules/listing/listing-cursor.ts#L16) · [Discovery cursor](../backend/src/modules/listing/listing-discovery-cursor.ts#L33)

Share the Listing wire codec and malformed-token mapping, keeping scope, sorting and authorization specific. This cuts repeated code without creating a global pagination abstraction. Risk is medium for compatibility. Verify old emitted tokens, scope/page-size binding, malformed inputs and forward paging after a boundary row disappears. **Approval not required** for equivalent accepted inputs and outputs. A public contract change requires approval.

#### F09 — Inbox reloads the private profile on each page and invalidation

**Frontend Chat/HTTP · RULE-01/04 · SIMPLIFY · Optimization · High confidence.** `InboxState.load` calls `UserApi.me()` alongside every Inbox request and uses the profile result for the caller ID. This includes pagination and realtime invalidations. It adds a request and couples valid Inbox data to a separate endpoint. [InboxState](../frontend/src/app/features/chat/state/inbox.state.ts#L77) · [UserApi](../frontend/src/app/features/user/data-access/user.api.ts#L25)

Reuse one identity lookup per identity generation at the existing profile boundary. This reduces requests for stable identities. Risk is medium due to cross-account staleness. Verify reconnect, refresh rotation, logout, user switch and pagination with scoped lookup counts. **Approval not required** for equivalent internal request reuse.

#### F10 — Dependency audits flag Prisma and Angular CLI graphs

**Dependencies · RULE-05/06/07 · SIMPLIFY · Dependency Change · High confidence for locked packages.** `npm explain effect` traces `effect@3.20.0` through `@prisma/config@7.10.1` and Prisma's optional peer from `@prisma/client`. The entries survive `--omit=dev`. Angular CLI's development tree includes affected `glob@13.0.7` and `minimatch@10.2.6`. Package entries include affected parent paths. Application request reachability was not established. [Backend lockfile](../backend/package-lock.json#L3723) · [Frontend lockfile](../frontend/package-lock.json#L5555) · [Effect advisory](https://github.com/advisories/GHSA-7589-6fvf-x4pw) · [Glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) · [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249)

Review production packaging and select a supported compatible remedy with the owner. npm's automatic suggestions cross the approved version boundaries. Remediation reduces exposure while avoiding broken Prisma generation or Angular builds. Risk is high for toolchain changes. Verify audit trees, Prisma generate/validate and isolated integration, plus Angular build/unit/browser behavior. **Approval required** for dependency changes.

#### F11 — Active CI stops before the browser boundary

**Tests/CI · RULE-06/07 · REORGANIZE · Testing Improvement · High confidence.** Frontend CI runs unit tests and build checks. Backend CI runs service integration. The configured workflows omit existing browser scenarios, so combined cookie, routing, stream and Socket.IO behavior lacks a repeatable CI gate. [Frontend CI](../.github/workflows/frontend-ci.yml#L24) · [Backend CI](../.github/workflows/backend-ci.yml) · [Browser evidence](../frontend/README.md#frontend-ci)

Make a small browser smoke set repeatable on the isolated test stack and evaluate a dedicated job for session restore, a Listing edit and two-client Chat/Notification sync. Risk is medium from timing and port/resource cleanup. Verify capped timeouts, unique test fixtures and repeatable runs. **Approval required** for new CI/environment workflow changes.

### P3 — Low

#### F12 — Stored video tools paths can go stale after a checkout relocation

**Media tooling · RULE-02/06 · SIMPLIFY · Documentation · High confidence.** Setup persists absolute executable paths in `video.env`. Both paths were stale on this checkout even though the pinned executables were present, producing six failures until process overrides pointed to the actual files. [Setup script](../scripts/setup-video-tools.mjs#L62) · [Video setup](../backend/README.md#provision-ffprobeffmpeg)

Add a quick local test preflight for the two paths and versions so developers can distinguish setup faults from video defects. Risk is low. Verify the documented check in an ordinary and relocated workspace. **Approval not required** for a setup documentation clarification.

#### F13 — Active setup and historical plans share conflicting descriptions

**Documentation · RULE-02/03/07 · CONSOLIDATE · Documentation · High confidence.** The stack document lists Playwright, Angular Material/CDK, generated OpenAPI API types and ESLint, while current manifests and scripts use the existing CDP harness and hand-authored API clients. Backend README says the composition root has no Socket.IO, but bootstrap attaches it. The Listing checklist narrative says Notification delivery is missing, while the worker handles `listing.updated` and the Notification checklist records 10/10. [Stack](TECH_STACK.md) · [Backend README](../backend/README.md#phân-tách-trách-nhiệm) · [Bootstrap](../backend/src/bootstrap.ts#L25) · [Notification dispatch](../backend/src/modules/notification/notification-source.service.ts#L28) · [Checklist](requirements/FUNCTIONAL_REQUIREMENTS.md)

Label active, planned and historical setup at the owning documents and link to current commands. This prevents setup and scope mistakes. Risk is low. Verify against manifests, scripts, registration and the current requirements. **Approval not required** for factual corrections. Adopting tools or altering approved scope requires approval.

#### F14 — Formatting guidance and Windows check results need alignment

**Formatting · RULE-02/06 · CONSOLIDATE · Documentation · High confidence.** Guidelines prefer four spaces and English comments. The repository standard requires two spaces and Vietnamese comments. Working tree line endings explained most Windows warnings. `--end-of-line auto` still flagged `account-management.test.ts`, `auth-security.test.ts`, `price-special-values.test.ts` and `media-draft.ts`. [Guidelines](ENGINEERING_GUIDELINES.md) · [Formatting standard](standards/CODE_FORMATTING.md) · [Frontend formatter](../frontend/.prettierrc)

Clarify applicable conventions and document line-ending-aware checks before introducing a gate. Address the four EOL-independent differences during relevant edits. Risk is low for a documentation change and moderate for checkout policy. Verify on Windows and Linux and inspect diffs for line-ending churn. **Approval required** for Guidelines or repository checkout policy changes.

### Investigation items

| ID and candidate priority | Evidence and concern | Scope of follow-up |
| --- | --- | --- |
| U01 · P2 | Notification fan-out · RULE-04/05. `process` resolves candidates twice and uses a linear membership search per intent. The listing edit source queries conversations without a row limit. Deployment cost is unmeasured. [Worker](../backend/src/modules/notification/notification.worker.ts#L31) · [Repository](../backend/src/modules/notification/notification-outbox.repository.ts#L48) | **SIMPLIFY · Optimization · Medium confidence.** Measure query count and lock duration across representative recipient counts. Consider a set lookup and batch projection while retaining post-lock verification. Medium ordering/eligibility risk. Approval required for recipient or job-persistence policy changes. |
| U02 · P2 | Listing cursor edge behavior · RULE-04/06. Owner and Discovery have different minimum date checks. PostgreSQL adapter behavior at date boundaries was unverified. [Owner](../backend/src/modules/listing/listing-cursor.ts#L6) · [Discovery](../backend/src/modules/listing/listing-discovery-cursor.ts#L7) | **KEEP · Testing Improvement · Medium confidence.** Verify database-compatible date boundaries in isolated PostgreSQL. Low diagnostic risk. Approval required for changing which public cursor inputs are accepted. |
| U03 · P2 | Media reads under lock · RULE-04/05. Listing authorization holds a transaction while opening private content. S3 range open allows a 30-second bound. Actual lock and pool effects are unmeasured. [Listing delivery](../backend/src/modules/listing/listing.service.ts#L63) · [Manifest](../backend/src/modules/media/listing-manifest.service.ts#L132) · [Object store](../backend/src/modules/media/object-store.ts#L184) | **KEEP · Testing Improvement · Medium confidence.** Measure slow-storage concurrency and check cleanup and visibility. High implementation risk if authorization timing changes. Approval required for shifting transaction/security boundaries. |

## 14. Technical Debt Summary

| Debt | Cost |
| --- | --- |
| Realtime freshness | F01 can delay an open conversation's updates after coalesced invalidations. |
| Operational recovery and evidence | F02/F03/F05/F11 leave manual Redis recovery, restore acceptance work, gaps in worker diagnostics and missing browser CI evidence. |
| Duplicated mechanics and reads | F06–F09 provide bounded opportunities to reduce transactional and HTTP work. |
| Policy and tooling drift | F04/F10/F12–F14 increase the chance of testing the wrong policy, selecting incompatible versions or misdiagnosing setup. |

## 15. Components and Decisions Worth Preserving

- Modular Express composition, feature-oriented Angular and explicit public module boundaries.
- Strict token claims, current-session checks, Argon2id, HttpOnly refresh cookies, atomic rotation, and OTP/proof Lua scripts.
- Shared lock order, migration-backed uniqueness, keysets, version fencing and safe response projection.
- Media readiness checks, reference guards and cleanup, along with Chat idempotency, proposal transactions and historical snapshots.
- Durable outbox claims and receipts, Notification read boundaries, REST reconnect resync and the focused Redis Reminder reservation.
- Actual-target test verification and bounded fixture cleanup.

## 16. Recommended Refactoring Priorities

1. Establish integration and browser baselines on the existing approved isolated stack. Capture the F01 client invalidation regression to support a dedicated bug fix.
2. Resolve Redis recovery and the backup/restore release requirement as separate operational decisions. Confirm the Auth policy and dependency advisory acceptance before changes in those areas.
3. Group behavior-preserving work around Media finalization and Listing cursor parsing. Measure request/query counts before and after manifest and Inbox optimizations.
4. Improve worker diagnostics, update actively misleading documentation and scope browser CI separately. Measure Notification fan-out and storage waits before considering persistence changes.

## 17. Changes Requiring Explicit Approval

- Chat freshness behavior (F01), Redis recovery (F02), backup/restore architecture and retention (F03), and approved Auth policy or Engineering Guidelines revisions (F04/F14).
- Dependency changes (F10), CI or environment provisioning (F11), and repository line-ending policy (F14).
- Schema, migrations, production data, security boundaries or public API/cursor contract changes. No such change is proposed as routine refactoring. U01–U03 identify evidence needed before deciding.
- Real messaging providers, Google frontend acceptance and production storage/infrastructure remain separate product and operations scope.

## 18. Baseline Quality Metrics

Physical lines were counted from Git-tracked files with LF/CRLF-neutral splitting. Blank lines and comments count. Generated Prisma, dependencies and build artifacts are excluded. The Frontend non-spec count includes one fixture in `testing/`. Backend helpers outside the listed suites are excluded.

| Scope | Files | Physical lines |
| --- | ---: | ---: |
| Backend non-spec application TypeScript | 161 | 10,651 |
| Backend unit specs | 25 | 2,001 |
| Backend API tests | 1 | 258 |
| Backend integration tests | 34 | 8,229 |
| Frontend non-spec TypeScript | 91 | 6,149 |
| Frontend HTML and styles | 57 | 4,061 |
| Frontend unit/component specs | 44 | 3,190 |
| Frontend E2E CJS, including harness files | 10 | 2,228 |
| Prisma migration SQL | 7 | 1,113 |

- **Dependencies.** Backend has 18 regular and 12 development direct declarations and 493 non-root lockfile package entries. Frontend has 9 regular and 7 development declarations and 583 non-root lockfile package entries. Lockfile entries include nested or platform variants.
- **Relative runtime imports.** A TypeScript AST pass resolved relative runtime imports and exports, including literal dynamic imports. It excluded type-only imports, specs, generated files and the Frontend test fixture. Backend had 161 vertices and 338 unique directed edges. Frontend had 90 vertices and 246 edges. A depth-first scan found zero back edges in either graph. External packages and runtime dependency injection are outside that graph.
- **HTTP contract.** OpenAPI declares 59 paths and 71 operations marked implemented. Backend unit checks include route classification and OpenAPI assertions.
- **Backend V8 unit coverage.** 22.47% statements, 25.91% branches, 19.26% functions and 22.59% lines. This is unit scope only. Core API, database integration and browser tests were outside coverage collection. No Frontend coverage or repository-wide duplication score was measured.

## 19. Limitations and Unverified Areas

- The report applies to the identified `develop` checkpoint. A dedicated refactor-branch baseline is unavailable. CI evidence comes from the existing push workflows for the exact audited commit.
- Local PostgreSQL/Redis integration and browser execution were blocked. CI covered backend integration and test migration. An independent local catalog comparison, live query plans and fresh browser outcomes remain unavailable. No database writes, provisioning or migrations occurred during the audit.
- Production provider delivery, Google browser authentication, actual S3 delivery, HTTPS ingress, deployed logs, backup restoration and cross-browser presentation were outside the evidence collected.
- Cross-tab refresh and high-volume realtime behavior need additional evidence. Advisory results describe three underlying advisory roots on the audit date. Application reachability remains unverified.
- Source links with line fragments point to the audited checkout. Historical test evidence is cited for context.

## 20. Final Audit Conclusion

The existing domain, data integrity and security boundaries are a sound basis for a controlled refactor. The first cleanup groups can reduce repeated work while preserving them. Chat freshness, recovery and operational acceptance belong in dedicated changes with explicit verification.

Audit status remains **PARTIAL**. Same-commit CI supplies the Backend integration baseline, while locally blocked browser execution leaves the end-to-end baseline unfinished. This report is the only repository deliverable. Production code, tests, schema, migrations, dependencies, application configuration and Engineering Guidelines were preserved.
