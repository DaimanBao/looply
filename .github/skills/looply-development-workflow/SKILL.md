---
name: looply-development-workflow
description: Implement or modify Looply features incrementally while respecting Đồ án 1 requirements, module boundaries, tests, and verified progress tracking. Use when coding, debugging, refactoring, reviewing, or planning a concrete implementation task in the Looply repository.
---

# Looply Development Workflow

## Purpose

Guide a coding agent through **one concrete Looply development task at a time**. Follow the repository's root `AGENTS.md`. This skill describes *how to work*, not the authoritative business rules or proof of completed implementation.

## 1. Establish context before editing

1. Identify the user's exact request, expected behavior, and task boundaries.
2. Read `AGENTS.md` and the relevant sections of `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md`, **if present**.
3. Inspect relevant code, tests, `package.json`, configuration, database schema, and migrations. Do not assume documented files or modules already exist.
4. Consult `docs/technical/PROJECT_STRUCTURE.md` for module responsibilities and `docs/technical/backend/BACKEND_PACKAGES.md` when considering backend packages, if those files exist.
5. Consult `docs/progress/DEVELOPMENT_PROGRESS.md` for previously recorded work, but verify claims against the actual repository.
6. Summarize in a few sentences: task, affected modules, confirmed decisions, unresolved issues, and a small implementation step.

**Source of truth:** current explicit user instructions govern the task; requirements govern desired behavior; source code and tests show current implementation; progress files only record verified work. Report discrepancies instead of silently rewriting requirements.

## 2. Decide whether to ask first

**Ask for approval before** changing established business behavior, adding a major dependency/service, changing framework or module boundaries, making breaking API/database changes, using paid external services, or executing destructive operations.

For routine implementation details that do not change approved behavior, choose a simple compatible solution and explain briefly. If a business detail is unresolved and blocks correct implementation, ask one focused question; do not invent a final policy.

## 3. Implement the smallest useful slice

1. Choose one observable outcome (for example: a validated endpoint, a service rule, a UI interaction, or a focused bug fix).
2. Respect module ownership and reuse existing infrastructure. Keep controllers thin, business logic in services, and frontend components focused on presentation and interaction.
3. Keep backend authorization and validation independent from frontend checks. For chat/realtime, verify conversation membership server-side. For uploads, validate file content/type/size and ownership.
4. Preserve existing working behavior. Do not refactor unrelated code, generate speculative modules, or create unused abstractions.
5. Do not install packages automatically just because a feature might use them. Inspect actual dependencies first.
6. Do not silently create commits, push branches, open PRs, deploy, reset migrations, delete data, or modify unrelated files.

## 4. Verify honestly

Choose checks appropriate to the change:

- TypeScript/type checking and build when scripts exist.
- Focused unit or integration tests for business rules and API behavior.
- Authorization/negative cases for protected operations.
- Manual testing guidance when a real provider, database, browser, or secret is unavailable.

Read scripts before running commands. Report **exactly which checks ran**, whether they passed, and which checks were blocked or not run. Never infer success from package installation or file creation alone.

## 5. Keep documentation synchronized

After implementing and verifying:

- Update the relevant technical document **only if** the actual architecture, dependency usage, or configuration changed.
- Update the requirements document **only when** the user explicitly agrees to a business-rule change; do not alter requirements to match accidental code behavior.
- Update `docs/progress/DEVELOPMENT_PROGRESS.md` when present, recording the feature, actual status, verification evidence, and unresolved issues. Use statuses such as `Chưa xác minh`, `Chưa bắt đầu`, `Đang thực hiện`, `Bị chặn`, `Hoàn thành (đã kiểm chứng)` according to the evidence.
- If a referenced document does not exist, report it rather than claiming to have updated it. Do not create extra tracking files without a concrete need.

## 6. Final response format

Keep the answer concise, in Vietnamese, and cover:

1. **Đã thực hiện:** what changed and relevant paths.
2. **Đã kiểm chứng:** actual commands/tests and results.
3. **Còn lại / cần quyết định:** unresolved issues or blockers.
4. **Tài liệu / tiến độ:** what was updated or why it was not.
5. **Bước tiếp theo:** one small, practical next action.

Do not claim completion when functionality has not been verified.

## 7. Looply-specific reminders

- The current implementation scope is **Đồ án 1**; do not add Admin, payments, or future-phase features without request.
- The core stack is Express.js + TypeScript, Angular + TypeScript, PostgreSQL, with Prisma 7 where confirmed in the repository.
- Guest browsing is allowed; protected interactions require login.
- A pair of users has one conversation that can refer to multiple listings; do not create one conversation per listing.
- Existing chat history and listing status rules must follow the requirements document.
- Do not assume unresolved numbers or policies (OTP constraints, video limits, feed counts, etc.) are settled.
- A package being installed does not mean the corresponding feature is implemented.

## 8. Example trigger

User: “Triển khai API đăng ký tài khoản cho Looply.”

Agent: inspect the authentication requirements and current `auth` module; identify only the unresolved choices that block registration; implement a narrow registration slice using existing dependencies; test validation and duplicate-account paths; update progress based on actual evidence; propose the next slice.

**Guiding principle:** *Hiểu đúng phần đang làm → triển khai nhỏ → kiểm chứng → cập nhật tài liệu → tiếp tục.*
