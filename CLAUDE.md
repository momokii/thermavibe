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
