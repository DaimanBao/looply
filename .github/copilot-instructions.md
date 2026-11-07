# Looply — GitHub Copilot Instructions

## Project Context

Looply is a public second-hand goods marketplace developed incrementally, beginning with Đồ án 1.

Core technology stack:

- Backend: Express.js + TypeScript
- Frontend: Angular + TypeScript
- Database: PostgreSQL
- ORM: Prisma 7

## Instructions

1. Read and follow the repository root `AGENTS.md` before making changes.
2. Consult `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md` for business requirements and project scope.
3. Inspect existing source code, configuration, and documentation before suggesting or implementing changes.
4. Follow the existing module boundaries and architectural conventions.
5. Implement only the requested functionality within the current project scope.
6. Do not introduce new dependencies, architectural changes, or business rules without sufficient justification.
7. Prefer small, verifiable changes over large-scale rewrites.
8. Run relevant checks and tests when possible.
9. Keep documentation and development progress consistent with verified implementation.
10. Communicate with the developer in Vietnamese.

## Source of Truth

- `AGENTS.md`: General AI agent rules and development workflow.
- `docs/requirements/DO_AN_1/LOOPLY_DOAN1_REQUIREMENTS.md`: Business requirements.
- `docs/technical/PROJECT_STRUCTURE.md`: Module responsibilities and architecture, when available.
- `docs/technical/backend/BACKEND_PACKAGES.md`: Backend dependencies.
- `docs/progress/DEVELOPMENT_PROGRESS.md`: Verified development progress, when available.

If documentation conflicts with the actual implementation, identify the discrepancy rather than silently changing the requirements.

Do not assume that a documented or installed feature is already implemented.
