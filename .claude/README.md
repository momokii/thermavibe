# VibePrint OS — Agent Orientation

**Project:** VibePrint OS — Open-source kiosk software for AI-powered photobooths
**License:** MIT

## What Is This Project?

VibePrint OS is an open-source kiosk application that turns a commodity USB webcam and thermal printer, and AI vision API into a self-contained "vibe reading" photobooth. Users touch a screen, their photo is captured, analyzed by AI for and a personalized reading is printed on a thermal receipt — all in under 90 seconds.

 Designed for deployment in cafes, markets, and event venues across Indonesia.

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12+ / FastAPI / SQLAlchemy 2.0 (async) / Alembic / PostgreSQL |
| Frontend | React 19 / TypeScript 5 / Vite 6 / Tailwind CSS 4 / shadcn/ui / Zustand |
| AI | Provider-agnostic: OpenAI, Anthropic, Google Vision, Ollama, Mock |
| Hardware | USB webcam (OpenCV/V4L2) + ESC/POS thermal printer (python-escpos) |
| Payment | QRIS via Midtrans/Xendit (toggle-able, mock for dev) |
| Deployment | Docker Compose on Linux (Ubuntu/Debian) |

## Orient Yourself in 5 Minutes

Read these files in order:

1. **This file** (`.claude/README.md`) — You are here
 now
2. **Current status** (`.claude/state/CURRENT_STATUS.md`) — what's done, what's next
 what's blocked
3. **Task queue** (`.claude/state/TASK_QUEUE.md`) — pick the next task
4. **Decisions log** (`.claude/state/DECISIONS_LOG.md`) — what was decided and why
5. **Coding standards** (`.claude/CODING_STANDARDS.md`) — how to write code here
6. **Security standards** (`.claude/SECURITY_STANDARDS.md`) — security requirements and audit findings
7. **Environment guide** (`.claude/ENVIRONMENT_GUIDE.md`) — environment definitions and verified commands
8. **Root CLAUDE.md** — project-wide rules and constraints

Then, for your task at hand, read the relevant sections from:

- **PRD:** `docs/prd/` — product requirements and features
- **Technical docs:** `docs/technical/` — architecture, API contracts, testing

## Key Documentation Links

### PRD (Product Requirements)
| File | Purpose |
|------|---------|
| `docs/prd/00-executive-summary.md` | Project overview and goals |
| `docs/prd/01-personas-and-goals.md` | User personas (Maya, Budi) and product goals |
| `docs/prd/02-functional-requirements.md` | All functional requirements by module |
| `docs/prd/03-nonfunctional-requirements.md` | Performance, reliability, security NFRs |
| `docs/prd/04-user-flows.md` | Complete kiosk and admin user flows |
| `docs/prd/05-data-models.md` | Database schema (4 tables) constraints, indexes) |
| `docs/prd/06-integration-map.md` | External integration specs (AI, payment, printer, camera) |
| `docs/prd/07-out-of-scope.md` | Explicitly out-of-scope items |
| `docs/prd/08-open-questions.md` | Unresolved questions |

### Technical Documentation
| File | Purpose |
|------|---------|
| `docs/technical/architecture-overview.md` | System architecture and design decisions |
| `docs/technical/coding-standards.md` | Detailed coding conventions |
| `docs/technical/api-contract.md` | Complete API specification for all endpoints |
| `docs/technical/testing-strategy.md` | Testing approach and requirements |
| `docs/technical/project-structure-guide.md` | File organization and naming rules |
| `docs/technical/development-setup-guide.md` | Local development environment setup |
| `docs/technical/docker-deployment-guide.md` | Production Docker deployment |
| `docs/technical/tech-stack-decision-record.md` | Why each technology was chosen |

## Verify the Environment

```bash
make dev
```

This starts PostgreSQL + backend + frontend in Docker containers with hot-reload.

Verify the backend is healthy:
```bash
curl http://localhost:8000/health
# Expected: {"status":"healthy","version":"0.1.0","uptime_seconds":...}
```

Other key commands:
- `make test` — Run all tests (249 backend + 32 frontend)
- `make lint` — Run all linters
- `make help` — See all available commands
- See `.claude/ENVIRONMENT_GUIDE.md` for the complete command reference

## Security

Consult `.claude/SECURITY_STANDARDS.md` for the full security posture and requirements.

Key points:
- No secrets in source code — all via `.env` (properly gitignored)
- JWT auth with rate limiting on admin endpoints
- Docker container runs as root (known issue SEC-001 — needs remediation)
- Default credentials in `.env.example` are for development only

## Key Files in the Repo

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI application factory |
| `backend/app/core/config.py` | All configuration via Pydantic BaseSettings |
| `backend/app/services/session_service.py` | Kiosk state machine (core business logic) |
| `frontend/src/stores/kioskStore.ts` | Frontend kiosk state mirror |
| `docs/technical/api-contract.md` | Complete API specification |
