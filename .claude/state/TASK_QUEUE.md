# Task Queue — VibePrint OS

Ordered, prioritized implementation backlog derived from `docs/prd/02-functional-requirements.md`.

Tasks are organized in dependency waves, ordered by sequence.

---

## Remaining Work

These are the items still needing implementation, ordered by priority.

### Next Big Update — Digital Sharing (Option 3) — GAPS 1-3 SHIPPED 2026-06-19

> **Full spec:** [`docs/technical/update-roadmap.md` §5](../../docs/technical/update-roadmap.md)

**Status:** Gaps 1-3 implemented in one batch. Backend tests: 314 passing. Frontend tests: 36 passing (was 32; 3 RevealScreen regressions also fixed). Same 4 pre-existing backend failures unrelated to this work.

What landed:
1. ~~**Public URL via tunnel**~~ — **DONE.** `PUBLIC_BASE_URL` env var + Cloudflare Tunnel sidecar under `profiles: ["tunnel"]` + `BIND_HOST` for LAN-only fallback. `make dev-tunnel` / `make prod-tunnel`.
2. ~~**HTML landing page**~~ — **DONE.** New module `backend/app/services/share_page.py`; `/share/{token}` returns HTML, `/share/{token}/image` returns raw JPEG; expired/tampered tokens return 410 HTML.
3. ~~**Analytics events**~~ — **DONE (partial).** `SHARE_URL_SCANNED` and `COMPOSITE_DOWNLOADED` fire on each hit, try/except-wrapped. **DEFERRED:** admin-dashboard share-rate rollups not in this batch.
4. **Vibe Check parity** — **DEFAULT-SKIP** per D-029. Revisit on operator demand.

**Pending before going live (operator smoke-test):**
- iOS Safari download behavior on tunnel-served landing page (cannot verify from Linux)
- End-to-end via mobile data with a real Cloudflare Tunnel

**Next Big Update direction:** Option 2 MVP (single-kiosk remote monitoring via the same tunnel) is the natural follow-up if the kiosk gets deployed off-site. Otherwise, security/test-coverage hardening items below remain the priority.

### Security Remediation (from Phase 1 audit)

1. **SEC-001: Add non-root user to Dockerfile** — App container runs as root. Add `USER` directive with non-root user. Priority: High.
   ~~**SEC-002: Add API rate limiting**~~ — **DONE.** `RateLimitMiddleware` is now installed globally in `backend/app/main.py`.
   ~~**SEC-003: Add request/response size limits**~~ — **DONE.** `RequestSizeLimitMiddleware` added.
   ~~**SEC-004: Restrict CORS in production**~~ — **DONE.** CORS now restricts methods to `GET/POST/PUT` and headers to `Content-Type/Authorization/X-Request-ID`.

### Hardening & Test Coverage

2. **Expand frontend test coverage** — Only 36 tests against 14 kiosk screens + 10 admin components + 13 pages + 8 hooks. Photobooth screens other than `PhotoboothRevealScreen` (covered 2026-06-19) still have no tests. Admin pages (Photobooth, Strips Gallery, Print Template, Vibe Check) have no tests.
3. ~~**Fix RevealScreen test regression (P1)**~~ — **DONE 2026-06-19.** Replaced whitelist framer-motion mock with a Proxy-based catch-all that renders any `motion.X` as the corresponding HTML tag. Frontend now reports **36 pass / 0 fail** out of 36.
4. **Add backend integration test for photobooth flow** — Unit tests cover individual services but no end-to-end test exercises the photobooth state machine (`CAPTURE → FRAME_SELECT → ARRANGE → COMPOSITING → PHOTOBOOTH_REVEAL`).
5. **CI/CD pipeline** — No automated testing or deployment. GitHub Actions or equivalent needed.

### Documentation

~~5. **Add `photobooth_themes` and `devices` tables to `docs/prd/05-data-models.md`**~~ — **DONE.** Sections 7 (PhotoboothTheme) and 8 (Device) are now documented.

6. **Fix factory-pattern example in `docs/technical/testing-strategy.md` §4.1 (docs-only)** — The example imports `from app.models.payment import Payment` (nonexistent — `backend/app/models/payment.py` is a 15-line docstring stub, no SQLAlchemy class, not exported from `models/__init__.py`), uses `return Session(**defaults)` instead of `KioskSession(...)` (the import on the adjacent line is `KioskSession`), and defines a `create_test_payment()` factory that cannot work as written. Payment data currently lives as columns on `KioskSession` (`payment_provider`, `payment_amount`, `payment_reference`, `payment_status`). Two clean fix options: (a) delete the `create_test_payment` factory and the `Payment` import, leaving `create_test_session` with the `Session` → `KioskSession` typo fixed; or (b) keep the factory as aspirational with a clear note that it depends on implementing the `Payment` model. **No code changes** — this is a doc-only fix.

### Wave 5 — E2E & Hardware (not started)

6. Full kiosk flow in Docker with mock providers.
7. Real camera capture testing.
8. Real thermal printer testing (respecting the "minimize paper waste" feedback rule).
9. Real AI provider testing.
10. Payment flow with mock provider.
11. Performance benchmarks (capture-to-print < 30s).

### Completed (kept for reference)

- ~~**Implement PaymentScreen**~~ — **DONE.** `frontend/src/components/kiosk/PaymentScreen.tsx` now creates a QR via `paymentApi.createQR`, polls for status, and renders a countdown.
- ~~**Add kiosk error display UI**~~ — **DONE.** Errors surface via the `sonner` Toaster mounted in `App.tsx`.
- ~~**Fix useKioskState side effect**~~ — **DONE.** The hook now uses `useEffect` for the processing→reveal transition.
- ~~**Remove unused `next-themes` dependency**~~ — **DONE.** No longer in `frontend/package.json`.

---

## Wave 1 — Foundation (Tasks 01-08)

These must be completed first. Everything else depends on them.

### T01 — Implement Exception Hierarchy

| | **Priority:** P0 | **Complexity:** S | **Dependencies:** None | **Status:** DONE |
|---|---|
| **Scope:** | Create custom exception classes in `backend/app/core/exceptions.py`:
  - `VibePrintError` (base)
  - `SessionError`, `StateTransitionError`
  - `AIProviderError`, `AIFallbackExhausted`
  - `PaymentError`, `PaymentTimeoutError`
  - `PrinterError`, `PrinterOfflineError`
  - `CameraError`, `CameraNotFoundError`
  - `ConfigurationError`
- All exception classes include error codes, docstrings, and equality checks
- Error-to-response JSON envelope middleware
- Tests in `backend/tests/` |

**Acceptance criteria:**
- All exception classes defined with error codes and HTTP status mapping
- Error middleware catches `VibePrintError` and returns JSON response
- All HTTP error responses use standard error envelope
- Full test suite passes: `make test` with zero errors

---

### T02 — Implement Database Models

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** T01 | **Status:** DONE |
|---|---|
| **Scope:** | Implement SQLAlchemy ORM models in `backend/app/models/`:
  - KioskSession (id, state, photo_path, ai_response_text, ai_provider_used, payment fields, timestamps)
  - OperatorConfig (id, key, value, category, description, updated_at)
  - PrintJob (id, session_id FK, status, retry_count, error_message, timestamps)
  - AnalyticsEvent (id, session_id FK, event_type, metadata JSONB, timestamp)
  - Device (id, device_type, name, vendor_id, product_id, capabilities JSONB, is_active, last_seen_at)
- Generate initial Alembic migration |
| **Deliverable:** | `alembic/versions/d596d3d1a363_initial.py` — initial migration with 5 tables |

---

### T03 — Implement All Services

| | **Priority:** P0 | **Complexity:** L | **Dependencies:** T02 | **Status:** DONE |
|---|---|
| **Scope:** | Implement business logic services in `backend/app/services/`:
  - `session_service.py` — Kiosk state machine (6 states with validated transitions)
  - `ai_service.py` — Provider-agnostic AI image analysis with fallback chain
  - `camera_service.py` — OpenCV camera management, MJPEG streaming
  - `printer_service.py` — ESC/POS thermal printer communication
  - `payment_service.py` — QRIS payment gateway abstraction
  - `config_service.py` — Operator configuration CRUD with seeding
  - `analytics_service.py` — Session and revenue analytics
  - `hardware_service.py` — Aggregate hardware status for admin |

---

### T04 — Implement API Endpoints

| | **Priority:** P0 | **Complexity:** L | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | Implement REST API endpoints in `backend/app/api/v1/endpoints/`:
  - `kiosk.py` — Session CRUD, capture, print, finish
  - `camera.py` — MJPEG stream, device list, device select
  - `ai.py` — Image analysis endpoint
  - `printer.py` — Test print, status check (admin auth)
  - `payment.py` — QR creation, webhooks, status polling
  - `admin.py` — Login, config CRUD, analytics, hardware testing (admin auth) |
| **Deliverable:** | 24+ endpoints across 6 route modules, all under `/api/v1` |

---

### T05 — Implement Pydantic Schemas

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** T04 | **Status:** DONE |
|---|---|
| **Scope:** | Create Pydantic request/response schemas in `backend/app/schemas/`:
  - `common.py`, `kiosk.py`, `payment.py`, `camera.py`, `admin.py`, `print.py`, `config.py`, `session.py`
- All schemas with field types, constraints, validation, and JSON envelope format |
| **Deliverable:** | 9 schema files with full type coverage |

---

### T06 — Implement Dependency Injection + Middleware

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** T05 | **Status:** DONE |
|---|---|
| **Scope:** | Create dependency injection in `backend/app/api/deps.py`:
  - `get_db` — async database session
  - `get_current_admin` — authenticated admin verification
- Implement middleware in `backend/app/core/middleware.py`:
  - RequestID middleware (X-Request-ID)
  - CORS middleware
  - Error handling middleware |

---

### T07 — Implement AI Providers

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | Implement AI provider adapters in `backend/app/ai/`:
  - `base.py` — Abstract base class
  - `openai.py`, `anthropic.py`, `google.py`, `ollama.py`, `mock.py`
- Fallback chain: OpenAI → Anthropic → Google → Ollama → Mock
- Image compression (max 1024px), base64 encoding, 45s timeout |

---

### T08 — Implement Payment Providers

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | Implement payment provider adapters in `backend/app/payment/`:
  - `base.py` — Abstract base class
  - `midtrans.py`, `xendit.py`, `mock.py`
- QR code generation, payment status polling, webhook handling |

---

## Wave 2 — Utilities (Tasks 25-29)

### T25 — Implement Floyd-Steinberg Dithering

| | **Priority:** P1 | **Complexity:** S | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | `backend/app/utils/dithering.py` — Convert captured photos to 1-bit bitmaps for thermal printing using Floyd-Steinberg error-diffusion algorithm |
| **Deliverable:** | `dither()` function accepting numpy grayscale array, returning binary array |

---

### T26 — Implement ESC/POS Raster Encoding

| | **Priority:** P1 | **Complexity:** S | **Dependencies:** T25 | **Status:** DONE |
|---|---|
| **Scope:** | `backend/app/utils/escpos.py` — Wrap 1-bit image data in ESC/POS raster command format (row padding, MSB-first byte packing) |
| **Deliverable:** | `to_escpos_raster()` function producing ESC/POS-compatible byte arrays |

---

### T27 — Implement Input Validators

| | **Priority:** P1 | **Complexity:** S | **Dependencies:** T01 | **Status:** DONE |
|---|---|
| **Scope:** | `backend/app/utils/validators.py` — Input validation helpers for config categories, payment amounts, camera settings |
| **Deliverable:** | `validate_operator_config()`, `validate_payment_amount()`, `validate_camera_settings()` functions |

---

### T28 — Implement Config Service with Seeding

| | **Priority:** P1 | **Complexity:** M | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | `backend/app/services/config_service.py` — Operator configuration CRUD with default value seeding for categories: `ai`, `payment`, `hardware`, `kiosk`, `general` |
| **Deliverable:** | `get_all_configs()`, `get_configs_by_category()`, `update_config()`, `seed_default_configs()` |

---

### T29 — Implement Image Processing Utilities

| | **Priority:** P1 | **Complexity:** S | **Dependencies:** T03 | **Status:** DONE |
|---|---|
| **Scope:** | `backend/app/utils/image.py` — Image resize, grayscale conversion, compression for AI API calls |
| **Deliverable:** | Image processing helpers used by AI and printer services |

---

## Wave 3 — Frontend

### Frontend Kiosk Screens

| | **Priority:** P0 | **Complexity:** L | **Dependencies:** Wave 1 | **Status:** DONE |
|---|---|
| **Scope:** | Kiosk UI components:
  - IdleScreen — DONE
  - CaptureScreen — DONE (camera feed, countdown, flash)
  - ReviewScreen — DONE (photo review + retake)
  - ProcessingScreen — DONE (loading animation)
  - RevealScreen — DONE (typewriter effect, auto-print)
  - KioskShell — DONE (state router with Framer Motion)
  - PaymentScreen — DONE (QR display, status polling, countdown)
  - Photobooth flow — DONE (PhotoboothCaptureScreen, FrameSelectScreen, ArrangeScreen, PhotoboothRevealScreen)
  - AccessCodeScreen — DONE (VirtualNumpad, code redemption)
  - FeatureSelectScreen — DONE (Vibe Check vs Photobooth chooser) |

---

### Frontend Admin Dashboard

| | **Priority:** P0 | **Complexity:** L | **Dependencies:** Wave 1 | **Status:** DONE |
|---|---|
| **Scope:** | Admin components and pages:
  - AdminLayout — sidebar navigation, logout
  - AiConfig — provider selection, API keys, model config
  - PaymentConfig — enable toggle, provider, amount
  - AnalyticsDashboard — session/revenue analytics
  - HardwareSetup — camera/printer/system status
  - AdminLoginPage — PIN authentication
  - AdminDashboardPage, AdminConfigPage, AdminHardwarePage, AdminAnalyticsPage |

---

### Frontend State & API Layer

| | **Priority:** P0 | **Complexity:** M | **Dependencies:** Wave 1 | **Status:** DONE |
|---|---|
| **Scope:** | Zustand stores, API client, hooks, types:
  - kioskStore — state machine, session data
  - adminStore — auth, config, hardware status
  - API client with Axios (auth interceptors, 401 handling)
  - API modules: kioskApi, adminApi, cameraApi, paymentApi
  - 320 lines of TypeScript types matching backend schemas |

---

## Wave 4 — Testing & Integration

### Backend Tests

| | **Priority:** P1 | **Complexity:** L | **Dependencies:** Wave 1-2 | **Status:** DONE |
|---|---|
| **Scope:** | 322 tests across unit and integration:
  - **Unit tests (13 files):** ai_service, analytics_service, camera_service, config_service, exceptions, hardware_service, payment_service, printer_service, security, session_service, access_code_service, retention_service, share_page
  - **Integration tests (5 files):** admin_flow, ai_flow, kiosk_flow, payment_flow, share_endpoints
  - Database: SQLite in-memory with PostgreSQL compat patches

---

### Frontend Tests

| | **Priority:** P1 | **Complexity:** M | **Dependencies:** Wave 3 | **Status:** PARTIAL |
|---|---|
| **Scope:** | 36 tests:
  - Stores: kioskStore, adminStore
  - Components: IdleScreen, CaptureScreen, RevealScreen, AdminLoginPage, PhotoboothRevealScreen
  - Hooks: useCountdown
  - MSW API mocking configured |
| **Remaining:** | Tests for ProcessingScreen, other photobooth screens (PhotoboothCaptureScreen, FrameSelectScreen, ArrangeScreen, ReviewScreen), AccessCodeScreen, admin pages (Photobooth, Strips Gallery, Print Template, Vibe Check), admin components, useSession, useKioskState, usePhotoboothState, useCamera, usePrinter, usePayment, ErrorBoundary |

---

## Wave 5 — End-to-End & Hardware

| | **Priority:** P2 | **Complexity:** L | **Dependencies:** All previous | **Status:** NOT STARTED |
|---|---|
| **Scope:** | Full E2E testing:
  - Complete kiosk flow in Docker with mock providers
  - Real camera capture testing
  - Real thermal printer testing
  - Real AI provider testing
  - Payment flow with mock provider
  - Performance benchmarks (capture-to-print < 30s) |
