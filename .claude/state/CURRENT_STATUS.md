# Current Status — VibePrint OS

**Last Updated:** 2026-06-20
**Updated By:** Status reconciliation — Digital Sharing shipped, roadmap re-prioritized for future dev
**Session Summary:** Digital Sharing (Option 3) shipped 2026-06-19 — Gaps 1-3 complete and Gap 4 DEFAULT-SKIP per D-029. Project status documents reconciled to reflect this: (1) Removed duplicate "Also documented in the roadmap" section. (2) Shifted "Overall Phase" framing from "Phase 1 Implementation ~90%" to "Phase 1 complete; entering hardening + polish". (3) Reorganized Remaining Work to clearly tell the future-dev story: next big thing is Option 2 MVP (Remote Ops) because it directly reuses the Cloudflare Tunnel from the Digital Sharing batch; hygiene items (SEC-001, CI/CD, frontend test coverage) are next; Wave 5 hardware testing is gated on real hardware availability; Option 1 (multi-kiosk) is deferred indefinitely pending concrete demand. All three state docs now tell a consistent story. No code changes.

---

## Overall Phase

**Phase 1 — Implementation: COMPLETE.**
**Phase 2 — Hardening & Polish: IN PROGRESS.**

The backend, frontend, admin dashboard, marketing site, and production Docker deployment are all feature-complete for the single-kiosk Vibe Check and Photobooth flows. Digital Sharing (Option 3) — the last major customer-facing feature on the roadmap — shipped 2026-06-19. What remains is hardening (security, CI, test coverage), real hardware validation (Wave 5), and one operator-conditional follow-up (Option 2 MVP Remote Ops).

**Overall Completion:** ~95% of Phase 1 vision. Remaining 5% is hygiene + Wave 5 hardware validation, not new features.

---

## Remaining Work (Priority Order)

### Next Big Update — Option 2 MVP: Remote Operations (REUSES Digital Sharing tunnel)

> **Full spec:** [`docs/technical/update-roadmap.md` §6.2](../../docs/technical/update-roadmap.md)

**Status:** Not started. **Condition:** Only worth building if the kiosk is deployed off-site (weekly-or-less visit frequency). If the kiosk lives in your home/office, skip this.

**Why this is next:** The Cloudflare Tunnel sidecar shipped in the Digital Sharing batch gave the kiosk a public URL. That same URL unlocks remote admin access from a phone — so ~80% of the infra cost is already paid. The remaining work is narrow:

1. **TOTP auth on admin login** (~half a day) — Required before exposing admin UI to the internet. Add Google Authenticator alongside the existing PIN. Files: `backend/app/core/security.py`, `frontend/src/components/admin/AdminLoginPage.tsx`, `frontend/src/hooks/useAuth.ts`.
2. **Push notifications for 3 critical events** (~1-2 days) — When the kiosk detects printer offline >60s, paper out >60s, or camera not detected on startup, fire a webhook to NTFY.sh (free) → push to operator's phone. Files: `backend/app/services/*.py` (instrument existing error paths), `backend/app/core/config.py` (`NOTIFY_WEBHOOK_URL`, `TOTP_ISSUER`).
3. **External heartbeat watcher** (zero kiosk code) — UptimeRobot cron hitting `/health` every 5 minutes, alerts on two consecutive failures.
4. **Reuse Option 3's tunnel** — already done; no additional infra.

**Effort:** 2-3 days (because tunnel is already shipped). Would be 4-5 days without Option 3 done first.

**Trigger condition to start:** Operator confirms the kiosk will live somewhere they visit weekly or less.

### Hygiene Items (do in parallel with or before Option 2 MVP)

1. **SEC-001: Add non-root user to Dockerfile** — App container still runs as root. **Only open item from the Phase 1 security audit.** Small change, high value, no reason to defer. File: `Dockerfile`.
2. **CI/CD pipeline** — No automated testing or deployment today. Tests run only locally. GitHub Actions workflow that runs `ruff check`, `python -m pytest`, `npm run lint`, `npm test`, `npx tsc --noEmit` on every PR. Files: `.github/workflows/ci.yml` (new).
3. **Expand frontend test coverage** — Only 36 tests across 14 kiosk screens, 10 admin components, 13 pages, 8 hooks. Uncovered: `ProcessingScreen`, photobooth screens (`PhotoboothCaptureScreen`, `FrameSelectScreen`, `ArrangeScreen`, `ReviewScreen`), `AccessCodeScreen`, admin pages (Photobooth, Strips Gallery, Print Template, Vibe Check), most hooks, `ErrorBoundary`. Each missing test is small (~15 min) but coverage compounds.
4. **Photobooth integration test** — Unit tests exist for every service but the integration suite doesn't exercise the photobooth state machine end-to-end (only the share endpoints have integration coverage). Files: `backend/tests/integration/test_photobooth_flow.py` (new, mirroring `test_kiosk_flow.py` structure).

### Wave 5 — E2E & Hardware Validation (gated on real hardware)

Not started. All items require physical access to the actual kiosk hardware:

1. Full kiosk flow in Docker with mock providers
2. Real camera capture testing
3. Real thermal printer testing (respecting the "minimize paper waste" rule)
4. Real AI provider testing (OpenAI/Anthropic/Google — at least one)
5. Payment flow with mock provider
6. Performance benchmarks (capture-to-print < 30s target)

**Note:** None of these can be done from a dev environment. They're the operator's pre-launch checklist, not implementation work.

### Deferred — Option 1: Multi-Kiosk Architecture

**Status:** Spec exists (`docs/technical/multi-kiosk-architecture.md`, 622 lines). **Do not start without concrete multi-kiosk demand.** Most open-source projects never reach this stage.

What to do in the meantime: don't hardcode "only one kiosk" assumptions. Keep `session_service`, `analytics_service`, etc. compatible with a future `kiosk_id` filter. The schema is already clean — no immediate refactor needed.

### Deferred — Option 2 Full: Multi-Kiosk Aggregation Dashboard

**Status:** Blocked on Option 1. Multi-month effort. Only relevant once 2+ kiosks are deployed.

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
- [x] **15 services** fully implemented:
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
  - `share_service.py` — Time-limited share URLs (HMAC-signed tokens)
  - `share_page.py` — Inline HTML landing page renderer for the public share endpoint (digital sharing)
- [x] **7 user-facing tables**: `kiosk_sessions`, `access_codes`, `photobooth_themes`, `operator_configs`, `analytics_events`, `print_jobs`, `devices`
- [x] **66 API endpoints** across 6 route modules (admin 29, kiosk 26, camera 3, printer 4, ai 1, payment 3)
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

### Testing (~75%)
- [x] **Backend: 318 passing / 4 pre-existing failures** (322 total) across 13 unit + 5 integration files
  - Unit (13 files): ai, analytics, camera, config, exceptions, hardware, payment, printer, security, session, access_code, retention, share_page
  - Integration (5 files): admin_flow, ai_flow, kiosk_flow, payment_flow, share_endpoints
  - Database: SQLite in-memory with PostgreSQL compat patches
  - The 4 failures (`test_capture_photo_returns_capture_response`, `test_full_kiosk_flow_without_payment`, `test_raises_when_no_device`, `test_raises_when_no_active_device_and_none_index`) are pre-existing MagicMock patterns that need refactoring to AsyncMock — unrelated to any current feature work.
- [x] **Frontend: 36 tests** (all passing — 3 RevealScreen regressions fixed 2026-06-19 via Proxy-based framer-motion mock)
  - Stores: kioskStore, adminStore
  - Components: IdleScreen, CaptureScreen, RevealScreen, AdminLoginPage, PhotoboothRevealScreen
  - Hooks: useCountdown
  - MSW handlers configured
- [ ] Frontend: missing tests for ProcessingScreen, other photobooth screens (Capture/FrameSelect/Arrange/Review), admin pages, admin components, most hooks, ErrorBoundary
- [ ] Backend: missing integration test for photobooth flow (only share endpoints covered)

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
2. **Frontend test coverage thin** — 36 tests against 14 kiosk screens + 10 admin components + 13 pages + 8 hooks. Most new photobooth and admin work is untested.
3. ~~**RevealScreen tests are failing (regression)**~~ — **FIXED 2026-06-19.** Proxy-based framer-motion mock now renders any `motion.X` as the corresponding HTML tag. All 3 previously-failing tests pass.
4. **No photobooth integration test** — Unit tests exist but no end-to-end backend test for the photobooth state machine (only share endpoints have integration coverage).
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

- **Backend**: 318 passing / 4 pre-existing failures (322 total) across 13 unit + 5 integration files. The 4 failures are pre-existing MagicMock patterns that need refactoring to AsyncMock — unrelated to any current feature work.
- **Frontend**: 36 passing / 0 failing (RevealScreen regression fixed 2026-06-19)
- **Total**: 354 passing / 4 failing across 358 tests

Run with:
```bash
make test                                    # both via Docker
cd backend && python -m pytest tests/ -v     # backend locally
cd frontend && npm test                      # frontend locally
```
