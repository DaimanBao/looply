# Looply

**A marketplace for buying, selling, renting, and exchanging second-hand goods.**

> **Project status:** Under active development — **Đồ án 1 (Software Engineering Project 1)**. This README documents the product vision, agreed requirements, development conventions, and intended implementation. **A documented feature is not necessarily implemented yet.** Refer to the source code and development progress document for verified implementation status.

## Table of contents

1. [Overview](#1-overview)
2. [Project goals and scope](#2-project-goals-and-scope)
3. [User roles and access](#3-user-roles-and-access)
4. [Functional requirements](#4-functional-requirements)
5. [Technology stack](#5-technology-stack)
6. [System architecture](#6-system-architecture)
7. [Repository structure](#7-repository-structure)
8. [Getting started](#8-getting-started)
9. [Environment variables and configuration](#9-environment-variables-and-configuration)
10. [Database and Prisma](#10-database-and-prisma)
11. [Development workflow](#11-development-workflow)
12. [Testing and quality assurance](#12-testing-and-quality-assurance)
13. [Security and data protection](#13-security-and-data-protection)
14. [Documentation and AI agents](#14-documentation-and-ai-agents)
15. [Project roadmap](#15-project-roadmap)
16. [Known decisions and open questions](#16-known-decisions-and-open-questions)
17. [Troubleshooting](#17-troubleshooting)
18. [Contributing and maintenance](#18-contributing-and-maintenance)
19. [License](#19-license)

---

## 1. Overview

Looply is a public marketplace that connects people who want to **buy, sell, rent, or exchange used goods**. The platform is designed for a general audience, **not only students**, and does not require student verification.

Rather than building every feature at once, Looply follows an **incremental, implementation-driven approach**: agree on the behavior needed for the current task, implement it, verify it, and update the documentation. The current delivery target is **Đồ án 1**; subsequent phases may expand the product when justified by requirements and available resources.

### Core ideas

- Make second-hand items discoverable through searchable listings.
- Allow owners to offer items for sale, rental, or exchange.
- Let users contact one another through a unified conversation system.
- Preserve clear ownership, privacy, and access-control boundaries.
- Keep the codebase maintainable and extensible without premature complexity.

### Development principles

| Principle | Meaning in Looply |
| --- | --- |
| Correctness first | Business rules and access checks must be enforced on the backend. |
| Incremental delivery | Implement and test small, meaningful pieces. |
| Clear module ownership | Each module is responsible for its own domain. |
| Documentation alongside code | Decisions, architecture, and progress evolve with implementation. |
| Scope discipline | Do not silently introduce Đồ án 2 features into Đồ án 1. |
| Honest progress tracking | Installed packages and documented plans do not imply working features. |

## 2. Project goals and scope

### 2.1 Current phase: Đồ án 1

The initial product foundation focuses on:

- Account registration, verification, and sign-in.
- User profile management.
- Creating and managing second-hand listings.
- Browsing, searching, filtering, and viewing listing details.
- Uploading listing media.
- User interactions such as following and blocking.
- Conversations associated with users and listings.
- In-app notifications and relevant profile reminders.

The **smallest initial implementation milestone** is account access plus listing creation, browsing, and detail views. The broader Đồ án 1 requirements are documented separately and should be delivered incrementally.

### 2.2 Explicitly outside the current phase

Unless requirements change through an explicit decision, Đồ án 1 does **not** include:

- Online payment or checkout processing.
- An administration/moderation dashboard.
- AI recommendation or advanced automated anti-spam systems.
- Student identity verification.
- Mobile push notifications.
- A full production-scale distributed microservices architecture.

These exclusions describe the **current scope**, not a permanent product limitation.

## 3. User roles and access

Looply distinguishes between **guests** and **authenticated users**.

| Capability | Guest | Signed-in user |
| --- | :---: | :---: |
| Browse available listings | Yes | Yes |
| Search/filter listings | Yes | Yes |
| View listing details | Yes | Yes |
| Follow users or listings | No | Yes |
| Start or participate in chats | No | Yes, subject to business rules |
| Create and manage own listings | No | Yes |
| Manage own profile | No | Yes |
| Access personal notifications | No | Yes |

When a guest attempts a protected interaction, the interface should display a sign-in prompt and a link to the login page. The backend must still independently enforce authentication and authorization; UI restrictions alone are insufficient.

**Administration:** There is no dedicated admin role or dashboard in the Đồ án 1 implementation scope.

## 4. Functional requirements

> The following describes **agreed product behavior and intended functionality**, not an assertion that every feature has been coded. The detailed and authoritative specification is [`docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md`](docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md).

### 4.1 Authentication and account access

- Registration includes an account username, password, email, phone number, required location information, and successful SMS verification.
- Username and email are separate concepts. Internal username/password authentication must not treat a Google account as an automatically linked local-password account.
- Authentication methods are designed to support local credentials, phone-based verification/login, and Google sign-in as distinct flows.
- Changes to sensitive contact information require the corresponding verification process.
- Passwords must be securely hashed; verification codes and credentials must not be exposed through logs or API responses.

**Not yet finalized:** OTP expiration and attempt limits, provider selection, account recovery, and any future account-linking policy. These require explicit decisions during implementation.

### 4.2 User profiles and relationships

- Users manage their own profile information.
- A general location (province/city level) is required during registration; a full street address is not required.
- Changing a user's profile location does **not** retroactively update existing listing locations.
- Profile avatars may be uploaded and updated.
- Users can follow/unfollow other users and view follower/following information.
- Users can block/unblock others; blocking affects messaging according to the agreed rules without automatically hiding listings or changing follow relationships.

### 4.3 Listings

A listing supports one of three transaction types:

| Type | Description |
| --- | --- |
| **Sale** | An item offered for purchase. |
| **Rent** | An item offered for rental, with a day/month pricing unit as applicable. |
| **Exchange** | An item offered for exchange with another item. |

Listing management includes creating, viewing, editing, hiding, restoring where allowed, marking unavailable, and soft-deleting a listing.

Key business rules:

- A listing has its **own required location**, initially prefilled from the owner's profile but editable independently.
- Only the listing owner can modify its management state or content.
- Before any listing-related chat interaction, the owner can edit its information according to normal validation rules.
- Once a chat interaction exists, editing requires a warning and confirmation. After a confirmed, successful change, relevant conversation participants receive a notification; simply following a listing is not enough to receive that edit notification.
- Hidden, deleted, or unavailable listings cannot initiate **new** listing-based chats, but existing conversations and history are preserved under the established rules.
- The system records creation and modification timestamps.

The detailed field schema, pricing validation, and allowed status transitions should be checked against the specification and current implementation before coding.

### 4.4 Listing media

The current agreed direction supports **up to five images and one video per listing**, with previews and media management operations such as replacement, removal, and ordering.

- Images should be validated and optimized.
- Video is uploaded to the system rather than linked only from an external video service.
- Đồ án 1 targets local storage, while storage logic should be isolated sufficiently to support a future provider change.
- Exact video duration, file-size limits, supported codecs, and processing requirements remain implementation decisions to finalize.

### 4.5 Discovery, search, and feed

- Guests and authenticated users can browse available listings.
- Text search targets **listing titles**, not full descriptions.
- Search should handle Vietnamese text appropriately and support autocomplete where specified.
- Filters include transaction type, price, location, and posting time.
- Sorting includes newest, oldest, and price ascending/descending.
- Rental prices with different units must not be treated as directly comparable without an explicit rule.
- Infinite scrolling is the intended browsing experience.
- The planned feed combines recent listings from followed users with newer listings from other users; the exact selection size and pagination details require implementation decisions.

A product-category feature is **not part of the current Đồ án 1 scope**.

### 4.6 Conversations and messaging

Looply uses a **user-pair conversation model**:

- A pair of users shares **one conversation**, even if they discuss multiple listings.
- A conversation can contain references to multiple listings and can also support free-form chat.
- Real-time message updates are expected without requiring a page refresh.
- Message states distinguish **sent**, **delivered**, and **read**.
- Each participant may hide a conversation on their own side; a new incoming message can make it visible again.
- Existing chats remain accessible when a referenced listing becomes hidden, deleted, or unavailable, subject to access and blocking rules.
- Users cannot recall or delete individual sent messages in the current scope.

The server must validate conversation membership and messaging permissions for HTTP and real-time events.

### 4.7 Notifications

- Notifications are delivered inside the application, with real-time updates where applicable.
- Chat indicators use an icon/unread count; message preview text is not required in Đồ án 1.
- Users can mark a notification as read, mark all as read, and delete individual notifications.
- Temporary toast messages may disappear after a few seconds, but stored notification records are not automatically removed for that reason.
- Notification navigation should open the relevant conversation or listing when applicable.
- Following, unfollowing, blocking, and unblocking users do not automatically generate notification events.

### 4.8 Profile reminders

Reminders are lightweight, non-blocking prompts for **useful optional** profile information. They should not repeatedly nag users for unimportant fields.

- Check applicable conditions at the beginning of a new user session.
- Dismissing a reminder suppresses it for the current session.
- A later session may check the condition again.
- A reminder does not prevent normal use of the application.

The final list of reminder conditions and the technical definition of a session must be decided during implementation.

## 5. Technology stack

### 5.1 Core stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Backend | **Express.js + TypeScript** | HTTP API and business logic |
| Frontend | **Angular + TypeScript** | Web application UI |
| Database | **PostgreSQL** | Relational data storage |
| ORM | **Prisma 7** | Schema, migrations, and database access |
| Development environment | **Docker Compose** | Local service orchestration where configured |
| Source control | **Git + GitHub** | Version control and collaboration |

### 5.2 Backend packages and supporting tools

The backend dependency plan includes tools for authentication/security, request validation, logging, media, real-time communication, and automated tests. Examples from the current dependency selection include:

- **Prisma Client** and the PostgreSQL adapter for database access.
- **argon2** for password hashing.
- **jose** and **google-auth-library** for relevant authentication flows.
- **zod** for schema validation.
- **express-rate-limit** for selected rate-limited endpoints.
- **multer** and **sharp** for uploads and image processing.
- **socket.io** for real-time communication.
- **pino / pino-http** for structured logging.
- **Vitest / Supertest** for automated backend testing.

The exact installed versions and available scripts are defined by [`backend/package.json`](backend/package.json) and its lockfile. See [`docs/technical/backend/BACKEND_PACKAGES.md`](docs/technical/backend/BACKEND_PACKAGES.md) for package-specific guidance.

**Important:** The presence of a package in `package.json` does not prove that its associated feature has been implemented or tested.

## 6. System architecture

Looply is organized as a **monorepo** with a separate frontend and backend. Its backend is intended to follow a **modular application architecture** rather than prematurely splitting every business domain into independent deployed services.

```text
Browser / Angular application
             |
             | HTTP requests / real-time events
             v
      Express.js backend
             |
      Application modules
             |
       Prisma / SQL
             |
        PostgreSQL

Media files: local storage during Đồ án 1 (when configured)
```

### 6.1 Backend module responsibilities

| Module | Main responsibility |
| --- | --- |
| `auth` | Registration, login, verification, authentication, credential security |
| `user` | Profile, user relationships, following, blocking |
| `listing` | Listing content, ownership, status, transaction rules, discovery |
| `media` | Upload, validation, processing, and storage of media |
| `chat` | Conversations, messages, listing references, messaging permissions |
| `notification` | Notification records, read state, in-app delivery |
| `reminder` | Non-blocking optional profile-completion reminders |

These are **logical responsibility boundaries**. Their physical folders and exact internal files must be confirmed against the repository. Do not assume every module already exists.

### 6.2 Design guidelines

- Controllers should focus on HTTP transport and request/response handling.
- Services should own application and business rules.
- Data access should be organized consistently with the existing repository conventions.
- Authentication, authorization, and validation must be enforced server-side.
- Cross-module interactions should use clear interfaces rather than duplicate another module's logic.
- Use abstractions only where they solve a current problem or a clearly justified extension point.

For the current, verified structure and architecture notes, see [`docs/technical/PROJECT_STRUCTURE.md`](docs/technical/PROJECT_STRUCTURE.md).

## 7. Repository structure

The top-level layout below is based on the current project organization. Nested items labeled *planned/reference* may not yet exist.

```text
looply/
├── .github/
│   ├── copilot-instructions.md
│   ├── skills/
│   │   └── looply-development-workflow/  # When installed
│   │       └── SKILL.md
│   └── workflows/                         # GitHub Actions when configured
├── AGENTS.md                              # AI agent rules
├── backend/                               # Express + TypeScript application
├── frontend/                              # Angular application
├── docker/                                # Docker-related configuration
├── docs/
│   ├── requirements/
│   │   └── DO_AN_1/
│   │       └── LOOPLY_DOAN1_REQUIREMENTS.md
│   ├── technical/
│   │   ├── PROJECT_STRUCTURE.md
│   │   └── backend/
│   │       └── BACKEND_PACKAGES.md
│   └── progress/
│       └── DEVELOPMENT_PROGRESS.md
└── README.md
```

Some documentation paths are the **recommended organization**; check that files have been added before following the links. The actual repository tree takes precedence over illustrative examples.

## 8. Getting started

This section describes a **safe general setup procedure**. Exact commands depend on the files and scripts present in the checked-out repository. Do not assume that Docker Compose, migrations, seed scripts, or frontend start scripts have already been configured.

### 8.1 Prerequisites

- **Git**
- **Node.js** and **npm** compatible with the current project configuration
- **Docker Desktop + Docker Compose** if using containerized PostgreSQL/services
- A code editor such as **Visual Studio Code**
- Optional API client such as **Postman**

Check your environment:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

Use the repository's declared Node requirements and lockfiles as the authority for compatibility; do not assume that one globally installed version is required on every machine.

### 8.2 Clone the repository

```powershell
git clone https://github.com/DaimanBao/looply.git
cd looply
```

If you already have the repository locally, open its existing root directory instead of cloning it again.

### 8.3 Inspect the project before installing

```powershell
Get-ChildItem
Get-Content backend/package.json
```

If `frontend/package.json` exists:

```powershell
Get-Content frontend/package.json
```

Inspect available Docker Compose files:

```powershell
Get-ChildItem -Recurse -File -Include compose.yaml,compose.yml,docker-compose.yaml,docker-compose.yml
```

### 8.4 Install dependencies

From the backend directory:

```powershell
cd backend
npm ci
```

`npm ci` requires a compatible committed `package-lock.json`. If no lockfile exists, confirm the intended dependency-installation procedure before using `npm install`.

For the frontend, **only if its project and lockfile exist**:

```powershell
cd ..\frontend
npm ci
```

### 8.5 Configure environment variables

Check for provided `.env.example` or equivalent template files. Copy the template into a local `.env` file and fill in values appropriate to your machine. **Never commit actual secrets.**

Example (run only where a template exists):

```powershell
Copy-Item .env.example .env
```

See [Environment variables and configuration](#9-environment-variables-and-configuration) for additional guidance.

### 8.6 Start PostgreSQL / local services

If a working Compose configuration exists, run `docker compose` **from the directory containing that configuration**, or supply `-f` with its actual path:

```powershell
# Example only; adjust the file path to match your repository.
docker compose -f docker/compose.yaml up -d
```

Do not run this example unchanged if `docker/compose.yaml` is not present. Verify service names, ports, volumes, and credentials in the actual Compose file first.

Check container status with the same Compose file:

```powershell
docker compose -f docker/compose.yaml ps
```

### 8.7 Database setup

Once PostgreSQL is reachable and Prisma is configured, use the **actual Prisma schema/configuration** and the appropriate commands for the repository. Typical development commands are:

```powershell
cd backend
npx prisma validate
npx prisma migrate dev
npx prisma generate
```

**Do not run migration or reset commands against an unknown database.** Confirm `DATABASE_URL`, the Prisma configuration, migration state, and whether the target is a disposable development database. Prisma 7 configuration can differ from older tutorials.

### 8.8 Run the backend

The currently described backend development script is:

```powershell
cd backend
npm run dev
```

It is expected to execute `tsx watch src/server.ts` **if that script is still present**. Confirm the actual port and startup output; this README does not assume a fixed backend URL.

### 8.9 Run the frontend

Inspect the Angular scripts first:

```powershell
cd frontend
npm run
```

Then execute the script provided by `frontend/package.json` (often `npm start`, but do not assume it exists). Read the terminal output for the actual local URL.

### 8.10 Verify the setup

A minimal verification should establish that:

1. PostgreSQL is reachable from the backend.
2. Backend startup completes without configuration errors.
3. Frontend development server starts, if configured.
4. Frontend API configuration points to the intended backend.
5. An implemented endpoint or UI flow works end-to-end.

Do not infer successful startup from a running Docker container alone.

## 9. Environment variables and configuration

Environment configuration must be checked against the **current source code**, because variable names and providers can evolve.

Potential configuration categories include:

| Category | Example setting | Notes |
| --- | --- | --- |
| Runtime | `NODE_ENV`, `PORT` | Only if used by the application |
| Database | `DATABASE_URL` | Keep credentials private |
| Authentication | Token signing keys and token settings | Do not commit real values |
| Google login | Google client configuration | Required only when that flow is implemented |
| SMS/email | Provider credentials and sender settings | Provider choice may be pending |
| Media | Upload directory and file limits | Confirm actual storage implementation |
| Frontend | Backend API origin | Depends on Angular environment configuration |

**These are illustrative categories, not a confirmed complete `.env` schema.** Use a maintained `.env.example` without secrets once the actual configuration is defined.

Recommended practices:

- Commit templates, not real `.env` files.
- Use different credentials for development and production.
- Keep secrets out of source code, GitHub Issues, screenshots, and logs.
- Never publish access tokens, SMS OTPs, passwords, or full connection strings containing credentials.
- Configure GitHub Actions secrets through the repository's supported secret-management mechanism when CI/CD is introduced.

## 10. Database and Prisma

PostgreSQL is the primary database. Prisma is used for schema modeling, migrations, and database access in the backend.

### Guidelines

- Define relationships and constraints that protect data integrity.
- Apply indexes based on real query needs.
- Consider transactions for operations that must succeed or fail together.
- Preserve conversation and listing history according to the agreed soft-deletion rules.
- Keep migrations versioned and review changes before applying them.
- Avoid destructive migration commands on shared or important databases.

### Useful inspection commands

Run from the backend directory when Prisma is installed and configured:

```powershell
npx prisma --version
npx prisma validate
npx prisma migrate status
```

Migration commands are **not interchangeable**: `migrate dev` is a development workflow; production/staging deployment requires a separately reviewed deployment procedure. Do not use `prisma migrate reset` as a routine troubleshooting step.

## 11. Development workflow

Looply follows an incremental workflow:

```text
Understand the current requirement
            ↓
Inspect relevant code and documentation
            ↓
Discuss only the decisions needed now
            ↓
Implement a small, focused change
            ↓
Run checks and tests
            ↓
Update documentation and verified progress
            ↓
Proceed to the next task
```

### 11.1 Git collaboration

- Keep changes focused and reviewable.
- Use meaningful commit messages.
- Do not commit secrets, generated dependency directories, or local runtime data.
- Respect GitHub branch-protection and repository rules.
- If direct pushes to a protected branch are rejected, create a feature branch and open a pull request instead of bypassing protection.
- Do not force-push or rewrite shared history without explicit coordination.

Example feature-branch workflow:

```powershell
git switch develop
git pull --ff-only
git switch -c feat/example-feature
# Make and verify changes
git add .
git commit -m "feat: describe the change"
git push -u origin feat/example-feature
```

This example assumes a local `develop` branch exists and is configured. **Never assume direct pushing to `develop` is permitted**; follow the repository's current branch rules and PR process.

### 11.2 Pull request expectations

A useful pull request should explain:

- What changed and why.
- Which requirement or issue it addresses.
- Which modules and API/database contracts are affected.
- How the change was tested.
- Whether a migration, environment variable, or documentation update is required.
- Any unresolved limitations or follow-up work.

## 12. Testing and quality assurance

Testing is part of implementation, not a final-phase activity.

### Backend

The selected testing tools include **Vitest** and **Supertest**, with coverage tooling available in the dependency plan. Tests should cover, as appropriate:

- Successful and invalid request validation.
- Authentication and authorization failures.
- Listing ownership and allowed state transitions.
- Conversation membership and messaging restrictions.
- Notification read/delete behavior.
- Database consistency for multi-step operations.

### Frontend

Use the test/build tooling actually configured in the Angular project. Prefer tests for meaningful UI behavior, service logic, and important integration flows. Do not install a second testing framework without a concrete need.

### Commands

Inspect package scripts before running them:

```powershell
cd backend
npm run
```

Run available `test`, `build`, `lint`, or typecheck scripts **only when configured**. The backend may initially contain a placeholder `test` script; a placeholder is not a passing automated test suite.

**Manual API testing** (for example, with Postman) is useful but does not replace repeatable automated tests.

### Definition of done

A task can be marked complete only when its behavior is implemented, relevant checks have been performed or limitations reported, and documentation/progress accurately reflect the result. If tests could not run, record the task as **not fully verified** rather than silently marking it done.

## 13. Security and data protection

Security is enforced primarily by the backend.

- Hash passwords using an appropriate password-hashing algorithm; never store plaintext passwords.
- Validate and constrain untrusted inputs server-side.
- Use Prisma or parameterized queries; never concatenate user input into SQL statements.
- Enforce resource ownership and conversation membership on every protected operation.
- Apply rate limiting and abuse controls where appropriate, especially for authentication and verification.
- Avoid leaking internal errors, credentials, tokens, or verification codes.
- Validate media content, file types, sizes, and ownership before storing or serving uploads.
- Review CORS, cookie/token storage, and real-time connection authentication during implementation.
- Avoid logging sensitive personal data unnecessarily.
- Treat deletion, account changes, and migrations as operations requiring careful data-integrity checks.

The absence of an admin interface does **not** remove the need for authentication, authorization, input validation, or safe data handling.

## 14. Documentation and AI agents

Looply maintains separate documents for distinct purposes:

| Document | Responsibility |
| --- | --- |
| [`README.md`](README.md) | Public-facing project overview and developer onboarding |
| [`AGENTS.md`](AGENTS.md) | General rules for AI coding agents |
| [`.github/copilot-instructions.md`](.github/copilot-instructions.md) | GitHub Copilot-specific guidance |
| [`docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md`](docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md) | Detailed business requirements and Đồ án 1 scope |
| [`docs/technical/PROJECT_STRUCTURE.md`](docs/technical/PROJECT_STRUCTURE.md) | Architecture, module responsibilities, and actual structure |
| [`docs/technical/backend/BACKEND_PACKAGES.md`](docs/technical/backend/BACKEND_PACKAGES.md) | Backend dependency explanations |
| [`docs/progress/DEVELOPMENT_PROGRESS.md`](docs/progress/DEVELOPMENT_PROGRESS.md) | Verified implementation progress and outstanding work |
| `.github/skills/looply-development-workflow/SKILL.md` | Task execution workflow for compatible agents, when installed |

### Documentation rules

1. Business behavior belongs in the **requirements specification**.
2. Technical structure and module ownership belong in **technical documentation**.
3. Current implementation status belongs in the **progress tracker**.
4. Agent behavior belongs in **AGENTS.md** and tool-specific instructions.
5. The README provides an overview and links to deeper sources; it should not duplicate the full specification.

AI agents must inspect the actual repository before making changes. If documentation conflicts with source code, they should identify the discrepancy rather than silently changing business rules or claiming a feature is complete.

## 15. Project roadmap

This roadmap describes **phases and intent**, not fixed delivery dates.

| Phase | Focus | Status |
| --- | --- | --- |
| **Đồ án 1 — Foundation** | Account access, profiles, listings, discovery, media, user interactions, chat, notifications, and supporting rules | **In development** |
| **Đồ án 2 — Expansion** | Evaluate advanced administration, moderation, payments, and other product capabilities | **Future direction; not committed implementation** |
| **Later evolution** | Scalability, operational maturity, advanced intelligence, and broader deployment needs | **Long-term possibilities** |

Within Đồ án 1, features should be prioritized and completed in small increments. For a reliable per-feature status, consult `docs/progress/DEVELOPMENT_PROGRESS.md` **after it has been reconciled with the actual source code**.

## 16. Known decisions and open questions

### Agreed decisions

- The platform is public and is not student-only.
- The core stack is Express.js/TypeScript, Angular/TypeScript, and PostgreSQL; Prisma 7 is selected for database access.
- A user profile location is required; a listing has its own independent location.
- A user pair shares one conversation, which can reference multiple listings.
- Existing conversations are preserved when a listing becomes unavailable or hidden, subject to access rules.
- No online payments or admin dashboard in Đồ án 1.
- Development proceeds incrementally, with documentation updated alongside code.

### Decisions to finalize during relevant implementation steps

- SMS/email provider and OTP expiration/attempt policies.
- Detailed account recovery and account-linking behavior.
- Exact listing field constraints and complete state-transition matrix.
- Video duration, file limits, formats, and processing strategy.
- Feed selection size and infinite-scroll cursor design.
- Precise block-direction semantics where it affects permissions.
- Final reminder conditions and session definition.
- Production hosting, storage provider, and deployment configuration.

These questions should be resolved **when the corresponding feature is being implemented**, not all at once before development can proceed.

## 17. Troubleshooting

### `npm ci` fails

Confirm you are in the correct package directory, a compatible `package-lock.json` exists, and your Node/npm versions satisfy project requirements. Avoid deleting lockfiles as a first response.

### Backend cannot connect to PostgreSQL

Verify that the database is running, the configured host/port and credentials match the actual environment, and the Prisma configuration points to the intended database. Remember that a hostname used inside Docker may differ from the host machine's connection address.

### Prisma reports configuration or migration errors

Check the installed Prisma version, schema/config files, environment variables, and migration status. Prisma 7 may not follow older Prisma tutorial conventions. Do not run a destructive reset to “fix” a configuration mismatch.

### A frontend API call fails

Check the backend process, actual API URL, request payload, authentication state, browser network response, and CORS configuration. Distinguish a connection error from a validation or authorization error.

### GitHub rejects a push

Read the remote error carefully. If a branch requires pull requests, push changes to a permitted feature branch and open a PR; do not bypass branch protection.

### A feature is described but not working

A feature may be **specified but not implemented**, **partially implemented**, or **not yet verified**. Check the progress tracker, code, tests, and recent changes rather than assuming the README is a completion report.

## 18. Contributing and maintenance

Looply is currently maintained as a university software engineering project. Contributions and changes should respect the repository's branch rules, coding conventions, business requirements, and incremental workflow.

Before opening a pull request:

1. Read the relevant requirements and `AGENTS.md` if using an AI coding assistant.
2. Inspect existing modules and avoid duplicate responsibilities.
3. Keep the change focused and explain important decisions.
4. Run the checks that are actually available.
5. Update technical documentation and verified progress where appropriate.
6. Do not include secrets, local databases, generated runtime files, or unrelated modifications.

For project questions, use the repository's supported Issues/Discussions or maintainer communication channels **if enabled**.

## 19. License

No license is asserted by this README. Check for a repository-root `LICENSE` file and its terms before assuming the project may be reused, redistributed, or modified by third parties. If no license has been selected, that is a decision for the repository owner.

---

**Looply** — Build a reliable foundation first, verify each increment, and grow the product intentionally.
