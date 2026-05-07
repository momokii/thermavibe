# VibePrint OS — Claude Code Agent Context

## Project Identity
- **Name:** VibePrint OS
- **Type:** Open-source kiosk software for AI-powered photobooths
- **License:** MIT
- **Repository:** thermavibe

## Tech Stack
- **Backend:** Python 3.12+ / FastAPI / SQLAlchemy 2.0 (async) / Alembic / PostgreSQL
- **Frontend:** React 19 / TypeScript 5 / Vite 6 / Tailwind CSS 4 / shadcn/ui / Framer Motion / Zustand
- **AI:** Provider-agnostic — OpenAI, Anthropic, Google Vision, Ollama (local)
- **Printer:** python-escpos for direct ESC/POS USB communication
- **Camera:** OpenCV / V4L2 for USB webcam capture
- **Payment:** QRIS via Midtrans/Xendit, with mock provider for development
- **Deployment:** Docker Compose on Linux (Ubuntu/Debian)

## Project Structure
- `backend/` — FastAPI Python application (API, services, models, tests)
- `frontend/` — React TypeScript SPA (kiosk UI + admin dashboard)
- `docs/` — All project documentation
- `scripts/` — Operational scripts (kiosk launcher, dev setup)
- `config/` — Static configuration and fallback templates
- `base-data/` — Original source material (PRD)

## Mandatory Workflow
Every task MUST follow these steps in order:

1. **Analyze** — Read relevant docs (`docs/prd/`, `docs/technical/`) and existing code before touching anything.
2. **Plan** — Produce a written implementation plan; list files to be created or modified.
3. **Implement** — Execute the plan, one logical unit at a time.
4. **Test** — Run existing tests; write new tests for new behavior.
5. **Report** — Summarize what was done, what was changed, and any deviations from the plan.
6. **Update docs** — Keep all affected documentation current with the changes made.

## Code Architecture Rules
- **Follow the layer contract:** Routes → Services → Models. Never skip layers.
- **Async-first:** All database operations use SQLAlchemy async sessions. Never use sync DB calls.
- **Type everything:** All Python functions have full type hints. All TypeScript is strict mode.
- **Test what you write:** Every service must have corresponding unit tests. Every API endpoint must have integration tests.

## Scope Discipline
- The kiosk UI is for PUBLIC end-users. The admin UI is for OPERATORS only.
- Payment is TOGGLE-ABLE. Default OFF. The mock provider is always available.
- AI provider is swappable via config. Never hardcode to one provider.
- Camera and printer are hardware-agnostic. Never vendor-lock to specific hardware.

## Clarification Gate
Before implementing any feature:
1. Check if the behavior is defined in `docs/prd/`.
2. If yes, implement as specified.
3. If no, or if ambiguous, **ASK THE USER** before proceeding. Do not assume.
4. If the PRD says one thing and the code currently does another, flag it explicitly.

## Zero Regression Policy
- Never break existing tests.
- Never change database column types without a new Alembic migration.
- Never remove an API endpoint without updating `docs/technical/api-contract.md`.
- Never modify `.env.example` without updating `docs/technical/development-setup-guide.md`.

## Code Style
- Python: PEP 8, enforced by Ruff. Max line length 120.
- TypeScript: Prettier + ESLint. 2-space indent. Single quotes.
- Commit messages: Conventional Commits format (feat:, fix:, docs:, chore:, etc.)
- All public functions and classes must have docstrings (Python) or JSDoc (TypeScript).

## Build & Test Commands
- Backend tests: `cd backend && python -m pytest tests/ -v`
- Frontend tests: `cd frontend && npm test`
- Lint backend: `cd backend && ruff check app/ tests/`
- Lint frontend: `cd frontend && npm run lint`
- Type check frontend: `cd frontend && npx tsc --noEmit`
- Run migrations: `cd backend && alembic upgrade head`
- Docker dev: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`

## Architecture Boundaries
- Backend owns ALL business logic. Frontend is a thin presentation layer.
- Frontend communicates with backend exclusively via REST API.
- Frontend NEVER talks directly to the printer, camera, or AI providers.
- The camera preview stream is an exception: MJPEG stream served from backend.
- Payment webhooks come FROM the payment gateway TO the backend. Frontend polls for status.

## Key Files
- `backend/app/main.py` — FastAPI application factory
- `backend/app/core/config.py` — All configuration via Pydantic BaseSettings
- `backend/app/services/session_service.py` — Kiosk state machine (core business logic)
- `frontend/src/stores/kioskStore.ts` — Frontend kiosk state mirror
- `docs/technical/api-contract.md` — Complete API specification
- `docs/technical/multi-kiosk-architecture.md` — Future multi-room architecture plan

## .claude/ Reference System

The `.claude/` folder contains operational reference material that supplements this file. Always consult these before starting work.

### Read Every Session

| File | Purpose |
|------|---------|
| `.claude/AGENT_RULES.md` | 36 non-negotiable behavioral rules (workflow, safety, security, session management) |
| `.claude/CODING_STANDARDS.md` | Detailed Python/TypeScript/React conventions, naming, error handling, forbidden patterns |
| `.claude/SECURITY_STANDARDS.md` | Security audit findings, secrets management, input validation, auth rules |
| `.claude/ENVIRONMENT_GUIDE.md` | Environment definitions (dev/staging/prod), verified commands, Docker patterns |
| `.claude/HOW_TO_RESUME.md` | Full session startup protocol (11 steps to orient before touching code) |

### Read for State Awareness

| File | Purpose |
|------|---------|
| `.claude/state/CURRENT_STATUS.md` | Project completion status, known gaps, blocked items |
| `.claude/state/TASK_QUEUE.md` | Prioritized implementation backlog with acceptance criteria |
| `.claude/state/DECISIONS_LOG.md` | Architectural and implementation decisions (what, why, alternatives rejected) |

### Read for Task Templates

| File | When to Use |
|------|-------------|
| `.claude/templates/bug_fix.md` | Investigating and fixing a bug (7-step protocol) |
| `.claude/templates/new_endpoint.md` | Adding a new API endpoint (checklist) |
| `.claude/templates/new_feature.md` | Implementing a new feature (full checklist) |
| `.claude/templates/new_test.md` | Writing backend or frontend tests (checklist) |
