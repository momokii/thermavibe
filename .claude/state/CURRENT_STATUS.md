# Current Status — VibePrint OS

**Last Updated:** 2026-06-17
**Updated By:** Documentation sync against actual codebase state
**Session Summary:** Reconciled state files with the May–June feature work. The previous snapshot (2026-04-16) predated photobooth mode, access codes, themes, retention/share services, the marketing website, WSL2 hardware passthrough, and production deployment hardening. Test, model, and endpoint counts were refreshed from the live tree.

---

## Overall Phase

**Phase 1 — Implementation (~90% complete)**

The backend is feature-complete for both the Vibe Check and Photobooth flows. The frontend kiosk shell, admin dashboard, marketing website, and production Docker deployment are all in place. Remaining work is hardening (security, E2E tests, CI) rather than core features.

**Overall Completion:** ~90%

---

## Remaining Work (Priority Order)

1. **SEC-001: Add non-root user to Dockerfile** — App container still runs as root. Only open item from the Phase 1 security audit.
2. **Expand frontend test coverage** — Only 32 frontend tests; admin pages, most hooks, and most screens lack tests. New photobooth screens (`PhotoboothCaptureScreen`, `FrameSelectScreen`, `ArrangeScreen`, `ReviewScreen`, `PhotoboothRevealScreen`, `AccessCodeScreen`) have no tests.
3. **Backend test coverage gaps** — New services added since the last snapshot (`access_code_service`, `photobooth_service`, `theme_service`, `image_composition_service`, `retention_service`, `share_service`) have unit tests but the integration test suite (4 files) does not yet exercise the photobooth flow end-to-end.
4. **Wave 5 — E2E & hardware testing** — Not started. Full kiosk flow in Docker with mock providers, real camera capture, real thermal printer, real AI provider, performance benchmarks.
5. **CI/CD pipeline** — No automated testing or deployment.

---

## Completed Items

### Infrastructure (100%)
- [x] Project directory structure
- [x] `CLAUDE.md` — project-wide rules and conventions
- [x] `.editorconfig`, `.gitignore`, `.gitattributes` (LF enforcement for shell scripts)
- [x] `LICENSE` (MIT), comprehensive `README.md`
- [x] Makefile with 20+ targets including `dev-restart`, `prod-restart`, `deploy`
- [x] `scripts/start-docker.sh` — cross-platform launcher (Linux + WSL2 via usbipd-win auto-install/attach)
- [x] `scripts/setup-dev.sh`, `scripts/start-kiosk.sh`
- [x] `website/` — Astro + Tailwind marketing site with Docker compose deployment

### Documentation (100%)
- [x] PRD: 9 documents (executive summary, personas, functional requirements, NFRs, user flows, data models, integration map, out-of-scope, open questions)
- [x] Technical: 8 documents (architecture, coding standards, API contract, testing strategy, project structure, dev setup, Docker deployment, tech stack decisions)
- [x] `base-data/thermavibe-base-ideas.md`

### Backend Foundation (100%)
- [x] FastAPI application factory (`backend/app/main.py`) — health check, lifespan, middleware, SPA fallback in production
- [x] Pydantic BaseSettings (`backend/app/core/config.py`) — all config fields including photobooth settings
- [x] SQLAlchemy async setup (`backend/app/core/database.py`)
- [x] Alembic configuration — 5 migrations (initial, add_review_state_and_photos, add_photobooth_support, add_access_codes_table, add_price_to_access_codes)
- [x] Router aggregation (`backend/app/api/v1/router.py`)
- [x] `pyproject.toml`, exception hierarchy, middleware (RequestID, CORS, RateLimit, RequestSizeLimit, error handlers)
- [x] Security/auth — PIN verification, JWT tokens, global rate limiting, request size limiting

### Backend Business Logic (100%)
- [x] **14 services** fully implemented:
  - `session_service.py` — Vibe Check state machine (12 states across two flows)
  - `photobooth_service.py` — Photobooth flow (multi-photo capture, frame select, arrange, composite)
  - `ai_service.py` — Provider-agnostic AI image analysis with fallback chain
  - `camera_service.py` — OpenCV camera management, MJPEG streaming
  - `printer_service.py` — ESC/POS thermal printer with progressive retry for USB-to-parallel bridge chips
  - `payment_service.py` — QRIS payment gateway abstraction
  - `config_service.py` — Operator configuration CRUD with seeding
  - `analytics_service.py` — Session and revenue analytics
  - `hardware_service.py` — Aggregate hardware status for admin
  - `access_code_service.py` — Redeemable code access (alternative to payment)
  - `theme_service.py` — Photobooth theme management (built-in + custom)
  - `image_composition_service.py` — Photo strip composite generation
  - `retention_service.py` — Composite image retention/expiry
  - `share_service.py` — Time-limited share URLs
- [x] **7 user-facing tables**: `kiosk_sessions`, `access_codes`, `photobooth_themes`, `operator_configs`, `analytics_events`, `print_jobs`, `devices`
- [x] **65 API endpoints** across 6 route modules (admin 29, kiosk 25, camera 3, printer 4, ai 1, payment 3)
- [x] 5 AI providers (OpenAI, Anthropic, Google, Ollama, Mock) with fallback chain
- [x] 3 payment providers (Midtrans, Xendit, Mock)
- [x] 6 utility modules (dithering, escpos, image, validators, logging, constants)
- [x] Floyd-Steinberg dithering, ESC/POS raster encoding

### Frontend Foundation (100%)
- [x] Vite 6 + TypeScript strict mode + Tailwind CSS 4 + shadcn/ui (17 components)
- [x] ESLint + Prettier, Vitest with jsdom, MSW for API mocking
- [x] Axios client with auth interceptors, Zustand stores, React Query for server state
- [x] New deps: `qrcode.react` (PaymentScreen QR), `recharts` (analytics charts), `jspdf` + `jspdf-autotable` (CSV/PDF export)

### Frontend Implementation (95%)
- [x] **Kiosk screens** (14 components):
  - Vibe Check flow: `IdleScreen`, `CaptureScreen`, `ReviewScreen`, `ProcessingScreen`, `RevealScreen`
  - Photobooth flow: `PhotoboothCaptureScreen`, `FrameSelectScreen`, `ArrangeScreen`, `PhotoboothRevealScreen`
  - Shared: `FeatureSelectScreen`, `AccessCodeScreen`, `PaymentScreen`, `KioskShell`, `VirtualNumpad`
- [x] `PaymentScreen` — **fully implemented** (QR display, status polling, countdown). Was previously a stub.
- [x] **Admin components** (10): `AdminLayout`, `AiConfig`, `AnalyticsDashboard`, `AnalyticsExportButton`, `HardwareSetup`, `PaymentAccessConfig`, `PhotoboothConfig`, `PrintTemplateConfig`, `ThemeManager`, `VibeCheckConfig`
- [x] **13 pages** including `AdminPhotoboothPage`, `AdminStripsGalleryPage`, `AdminPrintTemplatePage`, `AdminVibeCheckPage`
- [x] 8 hooks: `useCamera`, `useCountdown`, `useKioskState`, `useMediaQuery`, `usePayment`, `usePhotoboothState`, `usePrinter`, `useSession`
- [x] `useKioskState` — render-time side effect fixed (uses `useEffect` properly)
- [x] `next-themes` dependency removed (was unused)
- [x] Error display via Toaster (sonner)

### Testing (~65%)
- [x] **Backend: 284 tests** (up from 249)
  - Unit (12 files): ai, analytics, camera, config, exceptions, hardware, payment, printer, security, session, access_code, retention
  - Integration (4 files): admin_flow, ai_flow, kiosk_flow, payment_flow
  - Database: SQLite in-memory with PostgreSQL compat patches
- [x] **Frontend: 32 tests**
  - Stores: kioskStore, adminStore
  - Components: IdleScreen, CaptureScreen, RevealScreen, AdminLoginPage
  - Hooks: useCountdown
  - MSW handlers configured
- [ ] Frontend: missing tests for ProcessingScreen, all photobooth screens, admin pages, admin components, most hooks, ErrorBoundary
- [ ] Backend: missing integration test for photobooth flow

### DevOps (100%)
- [x] Docker Compose production config (PostgreSQL 16, multi-stage build, USB passthrough, resource limits)
- [x] Docker Compose dev override (hot-reload, exposed ports, debug mode)
- [x] Multi-stage Dockerfile (Node 20 build + Python 3.12 runtime)
- [x] `.env.example`, `.env.production`
- [x] `scripts/start-docker.sh` — auto-detects cameras and printers on Linux, uses usbipd-win auto-install/attach on WSL2
- [x] Production hardening: static SPA serving, health checks, `make deploy` target, `127.0.0.1` port binding, resource limits
- [x] `config/fallback-templates/default-fortune.txt`

---

## Currently In Progress

**Nothing.** No tasks are currently in progress.

---

## Blocked Items

**Nothing.** No items are blocked.

---

## Known Gaps

1. **SEC-001: Docker container runs as root** — Dockerfile has no `USER` directive. Only remaining item from the Phase 1 security audit.
2. **Frontend test coverage thin** — 32 tests against 14 kiosk screens + 10 admin components + 13 pages + 8 hooks. Most new photobooth and admin work is untested.
3. **RevealScreen tests are failing (regression)** — All 3 tests in `frontend/src/__tests__/components/RevealScreen.test.tsx` fail with `Element type is invalid: ... got: undefined`, meaning a component used by `RevealScreen.tsx` is missing or wrongly imported (likely a `framer-motion` element not covered by the test's mock, which only stubs `motion.div`, `motion.img`, `motion.p`). Investigation needed; current state is **29 pass / 3 fail** out of 32.
4. **No photobooth integration test** — Unit tests exist but no end-to-end backend test for the photobooth state machine.
5. **No CI/CD pipeline** — Tests run only locally.
6. **Tests use SQLite, production uses PostgreSQL** — Minor gap in DB-level testing.
7. **In-memory rate limiter and payment store** — Acceptable for single-kiosk; would need Redis for multi-kiosk.
8. **`docs/technical/testing-strategy.md` §4.1 example drift** — The factory-pattern example imports `from app.models.payment import Payment` (nonexistent — `payment.py` is a stub) and uses `Session(**defaults)` instead of `KioskSession(**defaults)`. Doc-only fix; no code changes needed. Flagged inline in the doc.

---

## Security Findings

**Overall Posture: GREEN** (foundations solid, one production hardening item remaining)

### Confirmed Safe
- No hardcoded secrets, API keys, or tokens in source code
- `.env` properly gitignored
- All database queries use parameterized statements
- JWT auth with constant-time PIN comparison and rate limiting
- Input validation via Pydantic v2 on all request bodies
- Photos deleted after session completion (privacy-first)
- Composite images expire via retention service

### Issues Status
| ID | Issue | Status |
|----|-------|--------|
| SEC-001 | Docker container runs as root (no `USER` directive) | **OPEN** |
| SEC-002 | No API rate limiting beyond auth endpoint | **DONE** — `RateLimitMiddleware` is now global |
| SEC-003 | No request/response size limits | **DONE** — `RequestSizeLimitMiddleware` added |
| SEC-004 | CORS allows all methods/headers | **DONE** — restricted to `GET/POST/PUT` and `Content-Type/Authorization/X-Request-ID` |

Full details in `.claude/SECURITY_STANDARDS.md`

---

## Open Questions

1. Should payment store be persisted to the database instead of in-memory? (Current: in-memory, acceptable for single-kiosk)
2. Should rate limiter use Redis for distributed deployments? (Current: in-memory, acceptable for single-kiosk)
3. What is the production CORS policy? (Current: configurable via env var, defaults to localhost)
4. Is there a Content Security Policy requirement for the kiosk browser?

---

## Test Results

- **Backend**: 284 tests across 12 unit + 4 integration files — should all pass
- **Frontend**: 32 tests — **29 pass / 3 fail** (see Known Gap #3: RevealScreen regression)
- **Total**: ~316 tests

Run with:
```bash
make test                                    # both via Docker
cd backend && python -m pytest tests/ -v     # backend locally
cd frontend && npm test                      # frontend locally
```
