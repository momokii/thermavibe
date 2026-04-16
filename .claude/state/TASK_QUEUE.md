# Task Queue — VibePrint OS

Ordered, prioritized implementation backlog derived from `docs/prd/02-functional-requirements.md`.

Tasks are organized in dependency waves, ordered by sequence.

---

## Remaining Work

These are the items still needing implementation, ordered by priority:

### Security Remediation (from Phase 1 audit)

1. **SEC-001: Add non-root user to Dockerfile** — App container runs as root. Add `USER` directive with non-root user. Priority: High.
2. **SEC-002: Add API rate limiting** — No rate limiting beyond admin login. Add general API rate limiting middleware. Priority: Medium.
3. **SEC-003: Add request/response size limits** — No file upload or payload size limits configured. Priority: Medium.
4. **SEC-004: Restrict CORS in production** — Default CORS allows all methods/headers. Should be narrowed for production. Priority: Medium.

### Feature Work

5. **Implement PaymentScreen** — The kiosk payment screen is a stub (empty `<div>`). Must be completed before enabling `PAYMENT_ENABLED=true`.
6. **Add kiosk error display UI** — `kioskStore.error` is set but never rendered. Users see nothing on errors.
7. **Expand frontend test coverage** — Admin components, most hooks, and pages lack tests.
8. **Fix useKioskState side effect** — Render-time side effect should be in `useEffect`.
9. **Remove unused `next-themes` dependency** — Dead package in `package.json`.

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

| | **Priority:** P0 | **Complexity:** L | **Dependencies:** Wave 1 | **Status:** MOSTLY DONE |
|---|---|
| **Scope:** | Kiosk UI components:
  - IdleScreen — DONE
  - CaptureScreen — DONE (camera feed, countdown, flash)
  - ProcessingScreen — DONE (loading animation)
  - RevealScreen — DONE (typewriter effect, auto-print)
  - KioskShell — DONE (state router with Framer Motion)
  - PaymentScreen — **STUB** (empty div) |
| **Remaining:** | Implement PaymentScreen with QR code display and payment status polling |

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
| **Scope:** | 249 tests across unit and integration:
  - **Unit tests (10 files):** ai_service, analytics_service, camera_service, config_service, exceptions, hardware_service, payment_service, printer_service, security, session_service
  - **Integration tests (4 files):** admin_flow, ai_flow, kiosk_flow, payment_flow
  - Database: SQLite in-memory with PostgreSQL compat patches
  - ~4,777 lines of test code |

---

### Frontend Tests

| | **Priority:** P1 | **Complexity:** M | **Dependencies:** Wave 3 | **Status:** PARTIAL |
|---|---|
| **Scope:** | 32 tests:
  - Stores: kioskStore, adminStore
  - Components: IdleScreen, CaptureScreen, RevealScreen, AdminLoginPage
  - Hooks: useCountdown
  - MSW API mocking configured |
| **Remaining:** | Tests for ProcessingScreen, admin pages, admin components, useSession, useKioskState, useCamera, usePrinter, ErrorBoundary |

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
