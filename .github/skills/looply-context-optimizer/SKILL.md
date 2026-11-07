---
name: looply-context-optimizer
description: Optimize context and token usage for Looply coding tasks by retrieving only relevant code and documentation, using scoped searches, and producing compact handoffs without compromising correctness. Use when exploring the repository, planning or implementing a task, debugging, or resuming long sessions.
---

# Looply Context Optimizer

## Purpose

Reduce unnecessary context while preserving correctness, security, and the project's established business decisions. This skill complements, rather than replaces, root `AGENTS.md`, the Looply requirements, and `looply-development-workflow`.

## Rules of precedence

1. Follow the user's current request and `AGENTS.md`.
2. Treat `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md` as the authority for intended Đồ án 1 behavior.
3. Treat current code, tests, migrations and configuration as evidence of what exists, not proof of requirement compliance.
4. If facts conflict or are missing, verify or ask; never trade correctness for token savings.

## Retrieval workflow

### 1. Scope the task

Write down internally: target behavior, likely modules, dependencies, and what evidence is required. Do not preload every document.

### 2. Discover before reading

- List relevant paths and filenames first.
- Search symbols, filenames, imports, and references with scoped tools (for example `rg --files backend/src`, `rg -n 'symbol' backend/src/modules/auth`).
- Inspect narrow ranges or targeted files first; expand when needed to understand call sites, contracts, errors, or security implications.
- Prefer summaries of file structure over dumping entire directories.
- Do not assume a tool exists: check available tools and repository conventions.

### 3. Load documentation on demand

| Task | First sources |
| --- | --- |
| Auth or registration | Auth section of requirements; `backend/src/modules/auth` if present |
| Profile, follow, block | User section; relevant user code |
| Listing, feed, search | Listing/search sections; listing code |
| Chat and realtime | Chat section; chat and socket code |
| Notifications/reminders | Corresponding requirements sections and modules |
| Dependency changes | Relevant `package.json` and `docs/technical/backend/BACKEND_PACKAGES.md` |
| Module boundaries | `docs/technical/PROJECT_STRUCTURE.md` and affected code |
| Progress reporting | `docs/progress/DEVELOPMENT_PROGRESS.md` plus verified code/tests |

Paths are references, not proof files exist. Read only sections required for the task. Follow references to other sections when business rules cross module boundaries.

### 4. Avoid noisy sources

Unless directly needed, exclude `node_modules`, `.git`, `dist`, `build`, `coverage`, `.angular`, generated clients, lockfiles, binary assets, logs, and minified bundles from broad searches. Do not ignore lockfiles or generated code when investigating dependencies, generation, or build errors.

### 5. Keep tool outputs focused

- Use scoped searches and small result windows; avoid unbounded recursive dumps.
- Prefer exact error messages, relevant stack frames, and the smallest reproducible example over full logs.
- Preserve enough surrounding code to understand types, side effects, auth checks, and tests.
- Never truncate evidence in a way that hides an error or a contradictory requirement.

## Coding and validation

- Make small, task-focused changes.
- Inspect existing code before proposing abstractions or packages.
- Validate with relevant scripts and tests; do not skip verification to save tokens.
- Do not claim success without observed results.
- Do not modify unrelated files, delete data, or perform Git publishing actions without authorization.

## Response format

Prefer concise reports with: **Changed**, **Verified**, **Remaining / Decisions needed**. Cite file paths and key symbols instead of pasting whole files. Provide full code when the user asks for it or when necessary for a safe edit.

## Long-session handoff

When context grows large or a session must be resumed, create a compact handoff containing:

1. Current task and objective.
2. Decisions already confirmed (with source references).
3. Files changed and relevant interfaces.
4. Commands/tests run and exact outcomes.
5. Known blockers or unresolved decisions.
6. Next smallest actionable step.

Do not invent a token threshold or claim automatic compaction is available. If the agent cannot persist the handoff, present it to the user or save it only when authorized.

## Completion checklist

- [ ] Read only relevant context, expanding when required.
- [ ] Checked cross-module and security effects.
- [ ] Verified actual code and tests as feasible.
- [ ] Reported limitations and unresolved questions.
- [ ] Updated documentation/progress only for verified changes.

**Principle:** Minimize irrelevant context, not essential reasoning or verification.
