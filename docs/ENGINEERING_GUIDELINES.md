# Looply --- Engineering Guidelines

**Scope:** Looply, Đồ án 1 (client MVP) · **Version:** 1.0

These guidelines govern implementation, maintenance, testing and refactoring. They apply to production code, test code and supporting configuration. They are not a new product specification. Existing agreed requirements and contracts remain authoritative; inspect the repository before assuming any example or design is implemented.

**Engineering philosophy:** Simple by Default. Explicit by Design. Secure by Necessity. Tested for Confidence. Refactored for Value.

## How to apply these guidelines

-   MUST / MUST NOT indicate mandatory safeguards or constraints. Prefer / consider indicate context-dependent guidance, not mechanical requirements.
-   Preserve correctness, security, data integrity, agreed behavior and required performance. Simplicity must not undermine them.
-   Follow existing reasonable conventions and tools. Resolve conflicting requirements or consequential ambiguity with the project owner; do not invent business rules.
-   The current stack is Express.js, TypeScript, Angular, PostgreSQL and Prisma, organized as a modular monolith. No unsolicited stack or architecture changes.

## RULE-01 --- Simplicity First: Pragmatic Clean Code

-   Choose the simplest solution that satisfies actual requirements. Apply KISS and YAGNI; avoid speculative extensibility and infrastructure.
-   Distinguish essential complexity (business rules, security, transactions, concurrency, realtime consistency) from accidental complexity (unnecessary wrappers, indirection, duplication and fragmentation). Preserve the former, remove the latter.
-   Prefer direct, readable control flow and existing language, framework and database capabilities. Do not introduce a pattern, abstraction, dependency or layer without a concrete benefit.
-   Apply DRY and SOLID pragmatically. Shared code must represent genuinely shared responsibilities; similar syntax alone is not a reason to merge different business concepts.
-   Keep code cohesive and maintainable by humans. Do not optimize for line count, file count, cleverness or hypothetical future requirements.
-   Keep necessary checks at trust boundaries; remove only verified redundant work. Explain unavoidable complex logic with proportionate comments.
-   Leave good code alone. Quality includes correctness, clarity, maintainability and meaningful verification, not merely appearance.

## RULE-02 --- Explicit, Readable & Consistent Coding Style

### Readability and control flow

-   Prefer explicit, ordinary TypeScript over clever expressions. Use guard clauses and early returns where they clarify the main flow; avoid deep nesting and complicated ternaries.
-   Keep business flows readable from top to bottom. Use meaningful intermediate variables when they improve understanding, not for every expression.
-   Use `map`, `filter`, `find`, `some` and `every` for clear collection operations; use `reduce` only when readable and `for...of` for multi-step logic when clearer. Prefer `async/await` for straightforward asynchronous flows.
-   Extract functions only for meaningful responsibility, reuse, readability or testability. No arbitrary function or file length limits.

### Naming and formatting

-   Use English identifiers. Use camelCase for variables/functions, PascalCase for classes/interfaces/types/enums, UPPER_SNAKE_CASE for global constants and enum members, and kebab-case filenames with meaningful responsibility suffixes. Respect framework conventions.
-   Boolean names should communicate intent (`is`, `has`, `can`, `should`). Avoid vague or excessively long names; use context.
-   Follow the repository [Code Formatting standard](standards/CODE_FORMATTING.md) and existing Angular and TypeScript conventions. Use UTF-8, two-space indentation and a print width of 100. Use double quotes in Backend code and single quotes in Frontend code through the existing Prettier settings. Format only files in scope and avoid unrelated line-ending changes. Use the existing tools.

### Types, comments and errors

-   Preserve TypeScript type safety. Use inference for obvious local values and explicit contracts for public or important boundaries when helpful. Avoid unnecessary complex generics, `any`, unsafe casts and non-null assertions.
-   Write project-owned source comments, JSDoc and TSDoc in Vietnamese. Keep identifiers, API names, error codes, generated comments, license headers and tool directives intact. Give each function a useful comment consistent with [AGENTS.md](../AGENTS.md). Keep simple comments brief and explain non-obvious rules, edge cases, transactions and concurrency protections where relevant.
-   Centralize error handling. Catch errors only when meaningful handling, recovery or context is needed; avoid repetitive try/catch wrappers. Preserve public contracts during refactoring.

## RULE-03 --- Code Structure & Architecture

-   Retain the modular monolith and feature-based organization. Do not impose full Clean Architecture, Hexagonal Architecture, DDD or microservices without an agreed need.
-   Backend default flow: Route/Middleware → Controller (HTTP) → Service (business rules) → Repository (data access) → Prisma/PostgreSQL. Not every module needs every layer. Avoid generic base repositories or a second ORM over Prisma.
-   Organize each module according to actual complexity. A simple Reminder module need not mirror Auth or Chat. Split files for independent responsibility, meaningful reuse or testability, not uniformity or line counts.
-   Modules own their business logic. Access another module through its public service/function rather than its internal repository. Controlled shared transactions or aggregate queries may be justified for consistency; keep ownership explicit.
-   Avoid circular dependencies. Correct responsibility and dependency direction before adding event buses or queues. Retain useful existing events where justified.
-   Keep module-specific code local. Shared code is for genuine cross-cutting responsibilities (errors, middleware, utilities, types, constants); configuration and infrastructure should have clear ownership. Do not create dumping grounds.
-   Classes, functions, interfaces, dependency injection and patterns are tools, not mandatory ceremonies. Avoid pass-through managers, handlers, adapters and factories without a distinct responsibility.
-   Angular should be feature-based. Components coordinate UI; services handle API access and appropriate shared logic/state; backend remains authoritative. Prefer local state, Reactive Forms, and suitable RxJS/signals. Avoid unnecessary global stores, component fragmentation or wholesale reactive-style conversions.
-   Preserve necessary realtime synchronization, reconnect and deduplication behavior. Use database constraints, transactions and queries where appropriate without moving all business logic into the database.
-   Add dependencies or infrastructure only for actual value. Do not reinvent proven security or validation libraries to reduce package count. Keep test architecture simple and isolated.
-   Design for current requirements and reasonable change, not speculative Đồ án 2 or graduation-project features. No unauthorized schema or migration changes.

## RULE-04 --- Business Logic & Data Handling

### Requirements, ownership and state

-   Requirements first: identify inputs, conditions, data changes, outcomes and side effects. Data-oriented thinking is useful when it clarifies the problem, not mandatory for every feature.
-   Maintain a single source of truth. Avoid redundant derived fields unless justified by performance, history or temporal semantics.
-   Frontend validation supports UX; backend validation and authorization enforce rules. Controllers handle HTTP, services own business decisions, repositories own queries, and database constraints enforce integrity. Validate independently at distinct trust boundaries; avoid repeated validation of trusted internal contracts.
-   Prefer natural flows: retrieve → validate → execute → required side effects → return. Use explicit state transitions and simple enums/conditions before introducing a state-machine framework.
-   Handle real edge cases arising from requirements, security, integrity and concurrency. Do not invent hypothetical features or policies.

### Data access and consistency

-   Use database filtering, projection, ordering, pagination, aggregation and batch operations where appropriate. Avoid N+1 queries and unnecessary data transfer; do not force a single query when clarity or consistency suffers.
-   Use unique constraints, foreign keys and other appropriate database guarantees. Application prechecks alone do not prevent concurrent conflicts.
-   Use transactions for atomic business changes (for example, related proposal/listing changes or refresh rotation where applicable). Avoid slow external calls, uploads or socket operations inside transactions.
-   Address concurrency using atomic conditional writes, constraints, transactions, locking or isolation as justified. Do not introduce distributed locks or queues by default.
-   Separate core state changes from side effects. Emit success events after commit where appropriate; preserve required delivery guarantees and do not silently discard required failures. Do not introduce an outbox or event framework without need.
-   Use idempotency where retries or duplicate operations matter. Prefer naturally idempotent state changes; do not impose universal idempotency keys.
-   Maintain cross-module consistency through clear public APIs and shared database transactions where appropriate. No internal HTTP, Saga or distributed transaction framework by default.

### Contracts and performance

-   Use meaningful DTOs and minimal transformations. Explicitly select safe response fields; never expose sensitive/internal fields through raw ORM models.
-   Use centralized, meaningful errors and preserve status codes and API contracts. Avoid a separate error class for every resource without benefit.
-   Remove unnecessary work and measure relevant bottlenecks before introducing caches, Redis, queues or other infrastructure.
-   MUST NOT change schema, migrations, constraints, indexes or reset databases without appropriate authorization. Propose justified changes separately.
-   Preserve business behavior, authorization, realtime semantics and data integrity during refactoring. Identify and report genuine bug fixes separately; do not silently change requirements or preserve known security flaws as intended behavior.

## RULE-05 --- Security & Reliability

### Security boundaries

-   Apply risk-based security. Never trust client-provided identity, permissions, HTTP input, socket payloads or file metadata. Derive actor identity from authenticated context.
-   Centralize authentication; enforce resource-level authorization separately at the appropriate business boundary. Do not introduce speculative RBAC/ABAC or permission engines.
-   Follow the approved [Auth requirements](requirements/modules/AUTH_REQUIREMENTS.md) for token lifetime, refresh rotation and revocation. Access-token authentication must validate the current server-side session. Logout revokes that session and its refresh token, and subsequent authentication must reject access tokens for the revoked session. Treat password login, per-IP Auth traffic, re-authentication and OTP as separate limits. Product-specific thresholds and any changes to revocation policy require authoritative requirements and an explicit owner decision. Verify expiry, revocation, reuse and rotation against the approved policy.
-   Use vetted password hashing (appropriate Argon2id/bcrypt configuration), JWT libraries and cryptographically secure randomness. Protect stored refresh tokens with appropriate hashing. No plaintext passwords, Base64 as security, plain SHA-256 password hashing or custom cryptography. Do not replace a safe existing library without reason.
-   Validate untrusted body/query/params/socket/files and external responses where necessary. Allowlist writable fields; never pass unvalidated request bodies into database writes.
-   Address relevant SQL injection, XSS, CSRF, IDOR, mass assignment, path traversal, brute force, sensitive-data exposure and SSRF risks. Framework defaults do not replace security review.
-   Classify public, private and internal data according to requirements. Never expose password hashes, refresh-token hashes, OTPs or secrets. Phone/email visibility follows product policy.
-   Apply proportionate rate limits to sensitive or abuse-prone operations. In-memory limits may suffice for a single-instance demo; shared storage requires a real deployment need.
-   Uploads: enforce size/count/type limits, inspect actual content where appropriate, use safe generated paths/names, prevent execution, authorize modification/deletion and clean up failed temporary files.
-   Sockets: authenticate connections, validate events, authorize room/resource access and recipients, share business logic with HTTP where appropriate, and enforce the agreed token expiry/revocation policy.

### Configuration and reliability

-   Centralize and validate environment configuration. No hardcoded secrets, tracked real `.env` files or secrets in logs. Use safe `.env.example` placeholders and separate test settings. Rotate/revoke exposed secrets; deletion alone is insufficient.
-   Use HTTPS in deployment, appropriate CORS, security headers, body limits and cookie flags (HttpOnly/Secure/SameSite as appropriate); address CSRF according to authentication design. CORS is not authorization.
-   Fail fast on missing mandatory configuration; use safe defaults only for optional settings. Handle ordinary request failures without crashing the application.
-   Centralize safe client errors and useful server logs. Do not expose stacks, SQL, internal paths, configuration, passwords, OTPs, tokens or authorization headers. Use appropriate log levels, not logging every function.
-   Preserve integrity on database, upload, network and realtime failures. Roll back atomic operations, handle reconnect/recovery appropriately and never report false success or swallow required failures.
-   Bound retries and timeouts. Retry only suitable transient failures; avoid retrying validation/authorization errors. Treat refresh rotation and duplicate-prone writes carefully. No generic retry framework by default.
-   Manage resources and graceful shutdown proportionately: stop accepting work, bounded drain, close connections, clean listeners/timers/subscriptions, avoid redundant Prisma clients.
-   Apply defensive programming at real trust boundaries. TypeScript types do not validate runtime input. Remove only verified redundant checks.
-   Test meaningful negative security cases: invalid/expired tokens, unauthorized resources, rotation/reuse/concurrency, invalid input, rate limits, uploads, sockets and sensitive response fields.
-   Do not weaken security to simplify code. Report security defects, impact, fixes and verification explicitly. No speculative distributed security infrastructure.

## RULE-06 --- Testing & Quality Assurance

**Test for confidence, not for coverage.** Testing is part of development; TDD is optional.

-   Choose unit, integration, API and E2E tests according to risk and responsibility. No mandatory ratio or test for every trivial function. Test behavior and contracts, not incidental implementation details.
-   Prefer Arrange--Act--Assert, clear English behavior-oriented `should ...` names, and shallow meaningful grouping. Cover happy paths, negative paths and relevant edge cases, including security and concurrency.
-   Use mocks, stubs, spies, fakes, fixtures and seeds purposefully. Never mock the logic under test or claim real database guarantees from mocked results. Keep fixtures minimal, valid, readable and reproducible.
-   MUST verify a separate authorized test database and environment before mutating integration tests. A `_test` suffix alone is insufficient. Never reset development/production data, run unauthorized migrations or send real OTPs by default. Report BLOCKED if isolation cannot be verified.
-   Tests should be independent and deterministic. Control time/randomness and wait for actual events instead of arbitrary sleeps. Multi-step E2E scenarios may share state within a single test.
-   Assert meaningful outcomes, errors, persisted changes and required side effects. Coverage is diagnostic, not a target of 100%; prioritize important untested branches.
-   Use real PostgreSQL integration tests for relevant queries, constraints, transactions and concurrency. API tests can cover controllers/middleware without duplicative unit tests.
-   Angular tests should prioritize auth state, refresh interceptors, guards, meaningful forms, chat/realtime state and user interactions. E2E tests should cover key complete user flows; do not convert every case to E2E.
-   Manual/visual testing remains valuable for layout, responsiveness and UX. Build success is not evidence of visual correctness. Report unperformed checks.
-   Run relevant type checks, lint, formatting checks, builds, Prisma validation and dependency audits using existing tooling. Do not weaken configuration or add unjustified suppressions to pass checks.
-   Keep test code as clean and simple as production code. Prefer existing frameworks; avoid elaborate test infrastructure and redundant assertions/helpers.
-   Before refactoring, establish a baseline; distinguish pre-existing failures. Add characterization tests for important behavior when needed, aligned with requirements, not to legitimize defects. Run targeted tests after changes and full regression after the whole-project refactor.
-   MUST NOT weaken assertions, change expected results, skip failing tests or lower thresholds to conceal implementation defects. Legitimate test corrections must be explained.
-   Report actual execution: PASS, FAIL, BLOCKED, NOT RUN or SKIPPED, with scope, counts when available, failures and limitations. Never infer PASS from reading code.

## RULE-07 --- Refactoring & Technical Debt Management

**Refactor for value, not for perfection.**

### Audit and decisions

-   Understand requirements, implementation and dependencies before editing. For a whole-project refactor, audit backend, frontend, architecture, business logic, database, security, shared code, dependencies, tests, configuration and documentation first. Graphify and static tools assist but do not replace source inspection.
-   Treat code smells (dead code, duplication, deep nesting, excessive abstraction, god classes, long methods, feature envy, shotgun surgery, speculative generality, middlemen, data clumps, magic values, coupling, cycles, inconsistent naming and redundant defensive checks) as investigation signals, not automatic defects.
-   Choose KEEP, SIMPLIFY, CONSOLIDATE, REORGANIZE, REWRITE or REMOVE based on demonstrated value and risk. Keep good code; rewrite internal implementation only when justified and verifiable. No default wholesale rewrite.
-   Verify dead code against imports, dynamic loading, DI, decorators, routes, scripts, configuration, public contracts and requirements. Do not delete endpoints or database fields solely because the frontend does not use them.
-   Simplify control flow, unjustified abstractions, fragmentation, naming and comments using RULE-01--03. Consolidate genuinely shared logic, not merely identical syntax.
-   Verify dependency usage before removal. Avoid gratuitous upgrades or replacement of vetted security libraries. Preserve UI/UX and reactive behavior; improve queries without unauthorized database changes.
-   Distinguish refactoring (behavior-preserving), bug fixes, optimization, feature work, architecture changes, database changes, dependency upgrades and formatting. Report overlapping categories explicitly; no hidden scope expansion.

### Priorities and execution

  ---------------------------------------------------------------------------------------------------------------------
  Priority                            Meaning
  ----------------------------------- ---------------------------------------------------------------------------------
  P0 Critical                         Serious security, data loss or system-blocking issues; prioritize immediately.

  P1 High                             Incorrect business behavior or high-risk maintainability/architecture problems.

  P2 Medium                           Meaningful duplication, indirection or readability/maintenance debt.

  P3 Low                              Minor naming, formatting or low-impact improvements; defer when appropriate.
  ---------------------------------------------------------------------------------------------------------------------

-   Audit globally, plan controlled groups according to dependencies and impact, and test/review each group. A possible grouping is shared infrastructure, Auth/User, Listing/Media, Chat, Notification/Reminder, frontend and cross-module integration; determine actual order after audit.
-   Preserve the existing stack and scope. No unsolicited Redis, RabbitMQ, architecture replacement or new features.
-   Compare meaningful before/after evidence: complexity, duplication, file/dependency counts, cycles, queries, test/build results and measured performance where relevant. Metrics are diagnostic; fewer lines or files do not prove better code.
-   Check Git branch/status before changes; preserve user work and review diffs. MUST NOT overwrite unrelated changes, use destructive Git operations or commit/push/merge/create PRs without authorization.
-   Update only necessary documentation to reflect implementation, setup, architecture, contracts and tests. Avoid documentation proliferation.
-   Report initial findings, scope, changes and rationale, removals, preserved behavior, separate bug fixes, actual checks, remaining debt, limitations and final status.
-   Stop when meaningful in-scope issues are resolved, code is understandable, required checks pass, behavior/security/integrity are preserved, remaining debt is documented and further changes offer little value. Do not pursue perfection or cosmetic churn.

## Execution workflow (not an additional RULE)

1.  **Analyze:** inspect requirements, relevant source, repository state and baseline checks; for full refactor, complete the audit before editing.
2.  **Design:** select the simplest justified solution and plan affected groups, risks and verification.
3.  **Implement / Refactor:** make controlled in-scope changes, preserving user work.
4.  **Test:** write/update meaningful tests and execute applicable checks safely.
5.  **Code Review:** inspect diffs, behavior, security, data integrity and maintainability.
6.  **Fix:** resolve identified in-scope issues; distinguish bug fixes from refactoring.
7.  **Regression Test:** rerun affected checks; full regression for whole-project refactor.
8.  **Documentation:** synchronize necessary documentation.
9.  **Final Review:** verify the Definition of Done and remaining risks.
10. **Report:** provide actual evidence and final status.

Proceed autonomously between phases within agreed scope. Stop for genuine blockers, unsafe operations, consequential unresolved requirements or decisions requiring owner approval. Do not stop merely to request approval for routine in-scope work. If a task is explicitly audit-only, do not edit implementation.

## Definition of Done

-   [ ] Agreed requirements and scope are satisfied; no unauthorized features or architecture changes.
-   [ ] Applicable RULE-01--07 principles are met; implementation and diff reviewed.
-   [ ] Necessary tests are written/updated and required tests actually executed successfully.
-   [ ] Relevant type checks, builds and quality checks pass.
-   [ ] No known regression in the affected scope; security and data integrity preserved.
-   [ ] Necessary documentation synchronized; user work preserved.
-   [ ] Decisions, actual verification, limitations and remaining issues reported honestly.

Use **COMPLETE** only when mandatory completion criteria are met; **PARTIAL** when work or required verification remains; **BLOCKED** when an obstacle prevents continuation or completion. A skipped or unexecuted required check is not a pass.

## Maintenance of these guidelines

These seven rules are the agreed current engineering standard, not an immutable universal rulebook. Apply them proportionately to Looply's scope. Revise deliberately with the owner when requirements or evidence justify a change. Examples and suggested techniques are not findings about the current repository. This document does not authorize migrations, infrastructure changes or new product behavior.
