# Looply Refactoring Plan

This plan applies to Đồ án 1 and starts from `refactor/codebase-cleanup` at `d2f64caf769efd0612ef26012370b2176484ebc2`. The [audit](CODEBASE_AUDIT.md) owns the original findings. The [Phase 00 baseline](REFACTORING_BASELINE.md) records verification and readiness. The [Engineering Guidelines](ENGINEERING_GUIDELINES.md), [module requirements](requirements/modules/README.md), and [OpenAPI contract](api/openapi.json) govern implementation.

Execute Group A before Group B. The plan defines work and acceptance gates for separately scoped tasks. Preserve the Modular Monolith, existing stack, API contracts, schema and migration history, security boundaries, UI/UX, and testing tools. Apply RULE-01 through RULE-07 through narrow changes, characterization where needed, risk-based verification, and diff review. Use [repository formatting](standards/CODE_FORMATTING.md) on touched files. Obtain owner approval for changes to product behavior, security policy, contracts, schema, dependencies, CI, or checkout policy unless already explicitly authorized.

## Phase 00 — Preparation and Baseline

- **Findings and scope** — F03, F04, F11, F12, and F14 directly affect preparation. All F01–F14 and U01–U03 inform sequencing. Scope includes Guidelines, the plan and report, Git state, the test harnesses, and local infrastructure.
- **Objective and direction** — Verify the audit checkpoint, align the Guidelines, compare Auth policy boundaries, start and verify test isolation, and establish the baseline. Preserve historical evidence, source behavior, and pre-existing work. Keep F03 open in the operational backlog.
- **Risks and required checks** — Guard against targeting the wrong database, suppressing failures, or mistaking an older browser result for current evidence. Verify actual PostgreSQL and Redis identities before fixture writes. Run applicable integration and browser tests and validate documentation links and Git diffs. Reuse applicable same-commit checks.
- **Acceptance and approval** — Deliver the three documents and working branch with verified evidence and explicit readiness. Use PARTIAL when required evidence remains unavailable. The owner approved the Guidelines corrections and safe local preparation. Each implementation phase needs its own task.

## Group A — Internal Refactoring

### Phase 01 — F06 Media Upload Finalization

- **Objective and scope** — Consolidate genuinely shared finalization in [ListingUploadService](../backend/src/modules/media/listing-upload.service.ts). Characterize both entry points, then share the invariant checks and final state transition within the Media module.
- **Preserve and risks** — Keep format-specific processing and DTO construction, User-before-Media locking, current-session revalidation, TEMP expiry, readiness, cancellation, cleanup, errors, and response contracts. The main risks are stale authorization and publishing a cancelled or expired asset after object writes.
- **Required tests and acceptance** — Exercise image and video through their public upload flow with isolated PostgreSQL/Redis and existing local object storage. Cover success, revocation after storage write, exact expiry, cancellation, and cleanup races. Both paths must produce the same pre-change outcomes and leave no invalid ready asset.
- **Dependencies and approval** — Phase 00 isolation, migrations, and working pinned video binaries. Equivalent internal consolidation falls within Group A once assigned. Changes to the lifecycle or lock policy require approval.

### Phase 02 — F07 and F08 Listing and Media

- **F07 objective and scope** — In [ListingManifestService](../backend/src/modules/media/listing-manifest.service.ts) and the [Listing Media repository](../backend/src/modules/media/listing-media.repository.ts), evaluate bounded bulk projections and reference lookups for the locked asset set. Retain original-order validation and guarded writes.
- **F07 preserved behavior and risks** — Keep validation and error precedence, cover/gallery order, lock ordering, reference protection, lifecycle transitions, and transaction rollback. Missing, foreign, expired, or referenced assets must yield the same outcomes. Preserve schema.
- **F07 required tests and acceptance** — Use actual PostgreSQL with identical fixture sizes and initial state before and after. Count executed SQL through the installed Prisma query event hooks or test-local adapter instrumentation. Count manifest metadata/reference statements and total operation statements, including explicit treatment of setup, transaction control, and retries. Run single-asset, multi-asset/maximum-gallery, and detachment cases. Confirm reduced redundant reads alongside passing mixed-invalid, reference, contention, cleanup, and rollback cases.
- **F08 objective and scope** — Share canonical encoding, decoding, binding-hash mechanics, and malformed-token error mapping within Listing's [owner](../backend/src/modules/listing/listing-cursor.ts) and [discovery](../backend/src/modules/listing/listing-discovery-cursor.ts) pagination boundaries. Keep scope-specific validation local and avoid a global pagination framework.
- **F08 preserved behavior, risks, and acceptance** — Preserve sort semantics, sorting tie-breaks, scope, binding hashes, page-size binding, public cursor bytes and compatibility. Test tokens emitted before the change, malformed and cross-scope tokens, sort/page-size mismatches, and forward paging after removal of a boundary row. Investigate U02 with isolated PostgreSQL and record adapter/date behavior without changing accepted cursor inputs.
- **Dependencies and approval** — Phase 01 establishes Media lifecycle regression evidence. F07 needs actual queries and concurrency tests on the isolated stack. F08 needs pre-change cursor fixtures and PostgreSQL paging cases. Schema, error precedence, or public cursor changes require explicit approval.

### Phase 03 — F09 Frontend Chat Optimization

- **Objective and scope** — Reuse existing profile identity within an identity generation at the [Inbox state](../frontend/src/app/features/chat/state/inbox.state.ts) and [User API](../frontend/src/app/features/user/data-access/user.api.ts) boundary. Use existing Angular Signals/RxJS and identity mechanisms.
- **Preserve and risks** — Keep logout, account switching, token refresh, pagination, reconnect, late-response protection, and Inbox behavior. Results fetched for an old account must never populate the current one. Keep F01's dedicated conversation invalidation work in Phase 06A.
- **Required tests and acceptance** — Assert exact profile GET counts using the existing Angular HTTP test tools or API spy and corroborate with Chrome CDP network events for the actual profile route. Compare the same sequence of initial load, pagination, repeated invalidation, reconnect, refresh, and logout/account switch before and after. Verify identity invalidation and stale response rejection. Require targeted Inbox tests and browser evidence of unchanged behavior with fewer redundant profile requests.
- **Dependencies and approval** — Require a working isolated Chrome harness and deterministic identity fixtures. Internal request reuse is in scope when assigned. Identity/API policy or new state framework changes require approval.

### Phase 04 — F05, F12, F13, and F14 Worker Diagnostics and Documentation

- **F05 objective and scope** — Add safe attempt and failure diagnostics to the [Notification worker](../backend/src/modules/notification/notification.worker.ts) and [deletion worker](../backend/src/modules/user/deletion/deletion.worker.ts), using the existing logging boundary. Identify durable processing failure and post-commit delivery failure independently. Preserve retry and backoff, lease fencing, event processing, and delivery semantics.
- **F05 risks, tests, and acceptance** — Avoid sensitive data and changes to retry behavior. Inject failures before and after commit, verify attempt/backoff and lease outcomes through existing worker tests, and assert safe structured fields. A committed event must remain distinguishable from a durable processing failure without an unintended replay.
- **F12–F14 objective and scope** — Clarify pinned video binary and preflight setup in the [Backend README](../backend/README.md), then reconcile factual stack/setup drift with [tech stack](TECH_STACK.md), active manifests, bootstrap and module evidence. Distinguish current, planned, and historical entries. F14's Guidelines wording is addressed in Phase 00. Apply established formatting only to relevant files and preserve line endings where possible.
- **F12–F14 risks, checks, and acceptance** — Verify commands on existing and relocated workspaces, validate Markdown links and documented options, and inspect formatting diffs for scope and EOL churn. Preserve product acceptance status unless supported by evidence. No broad formatting gate or tool installation.
- **Dependencies and approval** — Worker telemetry needs deterministic failure fixtures and PostgreSQL integration. Factual docs may proceed on verified evidence once assigned. Changes to retry policy, scope, tool adoption, or checkout policy require approval.

### Phase 05 — Group A Regression and Review

- **Findings and objective** — F05–F09 and F12–F14. Review the Group A diff against security, authorization, lock ordering, transaction, API compatibility, and UI boundaries.
- **Direction and risks** — Repeat affected tests using the isolated Backend and browser suites. Compare actual F07 query and F09 request measurements against like-for-like fixtures. Reuse CI evidence only where it covers the new reviewed state. Hidden cross-module effects and mismatched workload comparisons can obscure regressions.
- **Acceptance and dependencies** — Phases 01–04 have passing applicable tests, documented metrics, clean scoped diffs, and explicit remaining limitations. Resolve regressions before entering Group B. The baseline, fixture isolation, and current branch evidence must remain valid. Owner approval is required for any consequential scope change.

## Group B — Dedicated Fixes and Technical Decisions

### Phase 06A — F01 Chat Realtime Bug Fix

- **Objective and scope** — Reproduce lost interleaved invalidations in [Chat realtime state](../frontend/src/app/features/chat/state/chat-realtime.ts) and [Conversation state](../frontend/src/app/features/chat/state/conversation.state.ts). Add a meaningful failing regression on current behavior before the fix. Evaluate the existing RxJS and Signals mechanisms and choose a simple delivery model that survives bursts.
- **Preserve and risks** — Maintain reconnect synchronization, identity isolation, stale-response protection, and draft/attachment preservation. Watch for request storms or refreshes overwriting newer conversation state.
- **Required tests and acceptance** — Demonstrate that an active conversation refreshes when its ID is followed immediately by another conversation ID. Cover reconnect, pending drafts/attachments, identity switch and out-of-order responses in targeted tests and a two-client browser regression. Verify Backend authorization still applies.
- **Dependencies and approval** — Group A accepted first. The owner approved a subsequent dedicated fix. Test reproduction and browser verification require the isolated stack. Any broader architecture or contract change needs approval.

### Phase 06B — F02 Redis Recovery

- **Objective and scope** — Design bounded recovery around the existing [Redis store](../backend/src/modules/auth/redis/redis-store.ts), Backend shutdown/startup lifecycle and Reminder consumers. Define a safe recovery policy before implementation.
- **Preserve and risks** — Keep fail-closed behavior, disabled offline replay, selected database revalidation before serving operations, and safe shutdown. Ambiguous Auth operations must never be automatically replayed. Watch for races between readiness, target revalidation, and shutdown.
- **Required tests and acceptance** — Use isolated Redis tests for startup failure, disconnect, bounded return to service, wrong target rejection, ambiguity after a submitted operation, and shutdown during recovery. Assert expected Auth/Reminder refusal while unavailable and normal operation after verified recovery.
- **Dependencies and approval** — Group A accepted first. The owner approved a subsequent dedicated design and implementation preserving fail-closed behavior. Use isolated infrastructure for fault injection. Broader infrastructure or security-policy decisions need approval.

### Phase 07 — F04, F10, and F11 Policy, Dependencies, and Browser CI

- **F04** — Compare authoritative Auth requirements, [Auth configuration](../backend/src/config/auth-config.ts), HTTP and socket code, and the baseline policy table. Preserve runtime security until the owner approves exact policy. Verify scoped thresholds, expiry, revocation, and refresh rotation if a change is approved. Acceptance requires traceable policy and matching tests. The unresolved limits block policy implementation.
- **F10** — Review dependency audit paths in the package lockfiles, practical exposure, and compatibility with pinned versions. Preserve runtime behavior, lockfile integrity, and toolchain compatibility. Compare audit trees, run generation/validation and integration for Prisma changes, and run affected Angular build/unit/browser tests. Select a compatible remediation or document acceptance with the owner. Dependency changes require prior approval. Avoid forced automatic upgrades.
- **F11** — Restore repeatable local CDP browser verification before evaluating a small CI smoke set in [existing workflows](../.github/workflows). Candidate flows are session restoration, Listing editing, and two-client Chat/Notification updates. Preserve tools and isolated fixtures. Verify port and artifact cleanup, bounded timeouts, and repeatability. Owner approval is required before CI edits. Browser baseline and any external prerequisites must be resolved first.

## Group C — Investigation and Operational Backlog

### F03 and U01–U03

- **F03** — Track account-deletion-aware backup and restore as an open operational requirement in the [User requirements](requirements/modules/USER_REQUIREMENTS.md). Operational owners must approve a retention-safe restore procedure and validate it on isolated synthetic data covering pending and completed deletions before closing the requirement. Risk is resurrecting deleted data. No infrastructure implementation is included in this plan.
- **U01** — Measure Notification fan-out query counts and lock duration across representative recipient counts in the Notification worker and outbox repository. Preserve recipient eligibility, order, and durable processing. Acceptance is a repeatable measurement and evidence-based decision. Worker or recipient policy redesign requires approval.
- **U02** — In Phase 02, probe both Listing cursor date boundaries against isolated PostgreSQL using representative legacy tokens and equivalent page queries. Preserve accepted public inputs and ordering. Record verified boundary differences and request approval before any semantic change.
- **U03** — Measure storage waits, concurrent visibility changes, and cleanup under existing Media/Listing transaction locks using a controllably slow test object store. Preserve authorization and lifecycle ordering. Acceptance is a reproducible impact assessment. A transaction scope change needs supporting evidence and owner approval.

## Phase 09 — Final Quality Assurance

- **Scope and direction** — Review all implemented F01–F14 work and the disposition of U01–U03. Reconcile approved requirements, public contracts, docs, Git diff, and the seven engineering rules. F03 remains tracked as deferred.
- **Risks and required checks** — Run full relevant regression on the final reviewed state, including source/test types, production builds, isolated database integration, and targeted browser flows. Review security and data integrity, compare actual before/after measurements, and check formatting and dependency results in scope. Record known baseline failures and any regression separately.
- **Acceptance and dependencies** — Publish a final report with measured results, actual command outcomes, approval decisions, Definition of Done, and verified Git diff. Close only work with sufficient evidence. Flag remaining limitations, obtain approval for any outstanding policy decision, and follow repository rules for Git publication.
