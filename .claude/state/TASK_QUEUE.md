# Task Queue — VibePrint OS

Ordered, priorititized implementation backlog derived from `docs/prd/02-functional-requirements.md`.

 Tasks are organized in dependency waves order by sequence order.

 A task's acceptance criteria includes specific deliverables and a complexity estimate.

S/M/L for small, M/M medium, or large).

---

## Wave 1 — Foundation (Tasks 01-08)

These must be completed first. Everything else depends on them.

 Implement models, providers, or service.

 or endpoint first.

### T01 — Implement Exception Hierarchy

| | **Priority:** P0 | **Complexity:** S | **Dependencies:** None | **Status:** TODO |
| **Scope:** | Create custom exception classes in `backend/app/core/exceptions.py`:
  - `VibePrintError` (base)
  - `SessionError`, `StateTransitionError`
  - `AIProviderError`, `AIFallbackExhausted`
  - `PaymentError`, `PaymentTimeoutError`
  - `PrinterError`, `PrinterOfflineError`
  - `CameraError`, `CameraNotFoundError`
  - `ConfigurationError`
- All exceptions classes include `__str__` or applicable, docstring, `__eq__` check constraint
- Implement error-to-response JSON envelope middleware that uses the from `backend/app/core/middleware.py`
- Wire corresponding tests in `backend/tests/` |

**Acceptance criteria:**
- All exception classes defined with `__eq__` constraint and error codes
- Error middleware catches `VibePrintError` and returns JSON response with correct code and message
- All HTTP error responses use standard error envelope
- Exception hierarchy loads in `VibePrintError` or re-raises to appropriate exception subclass
- Full test suite passes:make test` with zero errors

- All tests pass

 including the original tests suite

- All tests pass:`make test` passes

- Ruff lint with zero errors/w zero lint errors

 and no new lint errors.
- `backend && ruff check app/ tests/` passes

- Code matches `docs/prd/02-functional-requirements.md` (FR-ERR-001

 FR-EXC-002, FR-PRD-05-data-model, - Implement database models — KioskSession, OperatorConfig, AnalyticsEvent, PrintJob per `docs/prd/05-data-model.md`

| **Priority:** P0 | **Complexity:** M | **Dependencies:** T01 | **Status:** TODO |
| **Scope:** | Implement 4 SQLAlchemy ORM models in `backend/app/models/`:
  - KioskSession (fields: id, state, photo_path, ai_response text, ai provider used, payment status, payment provider, payment amount, payment reference, created at, completed_at, cleared at)
  - OperatorConfig (fields: id, key, value, category, description, updated_at)
  - PrintJob (fields: id, session_id ( status, retry count, error_message, created at, completed_at)
- Generate initial Alembic migration (`cd backend && alembic upgrade head`)
- Models importable in `env.py` for auto-migration aut discovery

- `alembic/env.py` configured for async migration runner |
- Run `alembic upgrade head` to target schema
- Verify migration succeeds against fresh database:- Application starts cleanly and empty schema

- Alembic config service runs `load_config()` to settings |

**Acceptance criteria:**
- All 4 models defined with proper field types, constraints, indexes, relationships per PRD
docs/prd/05-data-model.md` (- Migration auto-generates succeeds
- `make test` passes
 no regressions |
- `alembic revision --autogenerate -m "initial schema"` succeeds
- Application starts cleanly |

**Deliverable:** |
- `alembic.ini` points to the correct migration scripts
 ensure env.py matches metadata
- Verify the models exist at expected path ( `autogenerate` will create migration with table name that matches PRD spec. If it doesn't, follow up.

- Run `alembic revision --autogenerate` manually, then review the revision script before committing

- If applying to a real production database, run `alembic upgrade head` manually on your dev machine, otherwise, commit the revision as-is and have the model files but the commit and a re-read the step 8: "Verify migration succeeds"

 test passes (integration tests pass)

 **Complexity:** S |

### T05 — Implement Pydantic Schemas

| **Priority:** P0 | **Complexity:** M | **Dependencies:** T01, T04 | **Status:** TODO |
| **Scope:** | Create all Pydantic request/response schemas in `backend/app/schemas/`:
  - `common.py` — ErrorResponse, Pagination wrappers
  - `kiosk.py` — session state ( capture, print, reveal responses
  - `payment.py` — QR create, QR code, and payment status
  - `camera.py` — device list, camera select response
  - `admin.py` — admin login, config, hardware test
  - `print.py` — print test print response
  - `config.py` — config read/update schemas
  - All schemas defined and file `schemas/` in this file `backend/app/schemas/`

**Acceptance criteria:**
- All schemas defined with field types, constraints, and validation
- All schemas follow the JSON envelope format:{"data": {...}, "meta": {"request_id": "...}}`
  - Common schemas are be exported/import for consistency
  - All schemas have `__str__` when `__eq__` constraint, error code and message
- Common schemas reference the source in `docs/technical/coding-standards.md`

- **Note:** Each schema should map to the appropriate Pydantic model type (BaseModel, OneOf `BaseModel`, etc) from file `schemas/common.py` which imports the `BaseModel`.

**Complexity:** M | **Dependencies:** T04 | **Status:** TODO |
| **Scope:** | Create dependency injection functions in `backend/app/api/deps.py` for providing async database sessions and service methods injection. - Implement middleware in `backend/app/core/middleware.py` covering CORS, error handling, and request ID tracking.

 The middleware must:
- Extract X-Request-ID from the response for debugging
- Run request tracing for `X-Request-ID` format for logging

 error responses.

 and API contracts for error envelope format

**Acceptance criteria:**
- `get_db` dependency returns async session
 database sessions (`get_db`)
- `get_current_admin` dependency returns authenticated admin user ( admin endpoint
- CORS middleware handles CORS correctly (- `X-CORPUS` is `Access-Control` headers are set to `X-Request-ID` from the response header)
- Error responses use the VibePrintError hierarchy,- CORS middleware handles OPTIONS correctly
- CORS_OPTIONS allows origins `http://localhost:8000` and `http://localhost:5173`
- `cors_middleware` correctly adds allowed_orig headers to responses
 `Access-Control-Allow-origin http://localhost:*`
- Unit tests pass in `backend/tests/unit/test_middleware.py`
 and `backend/tests/integration/test_middleware.py`

- Tests pass:- All tests pass,- No regressions

- `make test` passes
 zero lint errors
 and no new lint errors
- `backend && ruff check app/ tests/` passes with zero errors, lower lint warnings

 note: `Ruff check` outputs linting suggestions, not Ruff format output, Use `--max-length 120`)

 pytest-asyncio with `async def test_...`
- All API endpoint files must have integration tests

- New dependency injections

- `backend/tests/integration/test_middleware.py`

- Error handling middleware catches errors
 does not propagate) Error responses to API endpoints)
- Verify response envelope is all error scenarios (POST /api/v1/endpoints/`)
- All dependency injection functions work correctly
- Tests for dependency injection itself pass
- All tests pass,- No regressions

- `make test` passes with zero errors, lower lint warning, note: `Ruff check` outputs linting suggestions, but Ruff format output, use `--max-length 120`)

 pytest-asyncio with `async def test_...`
- All API endpoint files must have integration tests
- New dependency injections pass and- New test module
 has integration tests in `backend/tests/integration/test_kiosk_flow.py`
- Tests for dependency injection itself
- Kiosk flow tests cover state machine transitions and session lifecycle
- Camera service MJPEG streaming tests
- Error handling ( graceful degradation,- Tests for payment flow end-to-end (webhook and polling,- Verify admin PIN authentication with rate limiting (- Endpoints tested all CRUD operations on admin endpoints (login, config, hardware status, test print/c test camera)

- Analytics endpoint tests cover all CRUD operations, analytics queries,- Hardware test endpoints for print and camera hardware)
- All dependency injection functions work correctly
- Tests for all dependency injection pass
- All endpoint tests pass (- No regressions in `make test` passes with zero errors, lower lint warning, note: `Ruff check` outputs linting suggestions, not Ruff format output, use `--max-length 120`).

 pytest-asyncio with `async def test_...`
- All dependency injection functions work correctly
- All endpoint tests pass

- No regressions in `make test` passes with zero errors, lower lint warning, note: `Ruff check` outputs linting suggestions, not Ruff format output, use `--max-length 120`)

 pytest-asyncio with `async def test_...`

### Wave 4 — Utilities (Tasks 25-29)

| **Priority:** P1 | **Complexity:** S | **Dependencies:** T03 (services) | **Status:** TODO |
| **Scope:** | Implement utilities in `backend/app/utils/`:

- **T25 — Implement Floyd-Steinberg dithering** | `backend/app/utils/dithering.py`: Convert captured photos to 1-bit (black and white) bitmaps for thermal printing.

 Output: 1-bit binary bitmap where each row is padded to a multiple of 8.
 Uses Floyd-Steinberg error-diffusion algorithm that distributes quantization error to neighboring pixels to smooth gradients.

  - Produ much higher quality results than simple thresholding or lower quality on dark or very dark prints
 artifacts
- Uses ESC/POS raster encoding to wrap 1-bit image data for ESC/POS raster command format: Each row padded to a multiple of 8 to make the width byte-aligned, and pack pixels into bytes, MSB first, then LSB first):
  - Each byte's most significant bit represents black, the set it the final binary byte array
  - Use `Pillow` for image resize and grayscale conversion (`img.convert('L')` method)
- Input: 8-bit grayscale image, Output: grayscale numpy array
- Output: resized image

- Verify correct dimensions
- Verify pixel values match `printer.paper_width`

**Acceptance criteria:**
- `dithering.py` produces 1-bit binary bitmap where each row is padded to a multiple of 8
 use Floyd-Steinberg algorithm to convert grayscale images to binary for thermal printing
- Algorithm implemented in `dithering.py` accepts numpy array, outputs binary array
- `dither()` produces dithered binary array,- `to_escpos_raster` wraps the binary array in `ESC/POS raster command format with header and row data:- Verify pixel width matches printer paper width
- Use `dither()` and `to_escpos_raster` for each row; pad row bytes to multiple of 8
 Output: padded binary array where each byte contains 8 pixels for the MSB first, then LSB first)
- Max 1 retry with `retry_count` increment; on failure, set status to `failed`

**Acceptance criteria:**
- Floyd-Steinberg algorithm converts 8-bit grayscale images to 1-bit binary bit- Output: 1-bit binary array
- Each row padded to a multiple of 8 in a `ESC/POS raster command` to wrap row data in `ESC/POS raster` format with header and row data
including width and paper width)
- Verify pixel width matches printer paper width (- Use `dither()` for ESC/POS raster encoding
- `ESC/POS raster` encoding wraps row data in `ESC/POS raster` format with header `image` + text data)
- Correct dimensions)
- Output: padded binary array with correct dimensions
- Verify encoding result matches PRD spec  `384` for 58mm/80mm in `58mm`
 in `58mm` 80mm
 2. Returns correct dimensions and pixel values
- Use `ESC/POS raster` encoding to get correct dimensions ( we can test `dither` algorithm with `all-dithering` algorithm). If not, dither a row data, fail the test
 - `dithering()` returns the1-bit binary array; if `dither` fails, return `None`
- Input validation helpers in `validators.py` validate that input values are of the correct types and format, ( clean ValueError, commit database errors, - Log invalid values for debugging
 - Value validation fails gracefully rather than crashing out the - Track retries for `on_failure` patterns (- For example: retry connection config credentials through Operator config | for `backend/app/utils/validators.py`)

**Acceptance criteria:**
- All validators are `validate` and `assert` functions
- All validators return `ValidationError` or correct type ( types are returning `ValidationError` for invalid input`)
- All validators are `validate_email()` — proper email format validation)
- All validators have `validate_operator_config` pattern` -> matches valid values for `kiosk` and `general`
- All validators have `validate_payment_amount` -> raises `ValueError` if amount is not positive or- `validate_camera_settings` pattern -> raises `ValueError` if settings are invalid values like `/dev/video0`)
- `validate_operator_config` pattern -> raises `valueError` if config category is not `ai`, or `payment`, or `kiosk`)

- `validate_operator_config` pattern -> raises `valueError` if config category is not `hardware`, or `ai` or `payment`)

- Config service can read/write and updating values, `operator_configs` table
 Supports CRUD operations, config ( payment, AI, hardware, and general categories.
- Returns config values by alphabetical by category

- Updates `.claude/state/CURRENT_STATUS.md` if the relevant doc was updated `docs/technical/development-setup-guide.md` (which `.env.example` changes have new settings.

 or delete all references to documentation)
- For seed values that are the configuration state at which first setup)
- Check `.backend/app/services/config_service.py` exists and `get_config()` helper to return `None` or `None` for given key.- Create, `OperatorConfig` if it doesn't exist in the database, or raise `ConfigurationError` with key `key` if no value exists for the new key)

 `update . 'last_value'` if the key is the OperatorConfig table does not exists in the database, raise `configurationError` with message and key `configuration_key` should be returned `None`
- All CRUD methods return all config values as dict
- All configs in the database` returns the dict with correct types and values)
- All config values have correct types (`bool` for booleans, `int` for integers, `str` for strings)
- Valid types: `str` for category in (`ai`, `payment`, `hardware`, `kiosk`, `general`)
- All seed methods: `seed_default_configs()` in database if no configs exist
- Seed method, `seed_defaults` inserts default populates table with default values for each category
- All configs in database can be read with `get_config() helper` returns `None` when category is `ai` or `payment`)

 or raises `ConfigurationError` with message and key `ai.provider` is OperatorConfig `ai.provider` is config but `backend/app/services/config_service.py` before creating the operator config` object, reading the config value from the database or logging the config read")

 `{'config': key, value} from config table) in the database` returns `None`
- All config values in database are return `None` ( the log the no config exists)
- Seed method raises `configurationError` with message and key `ai.provider` in OperatorConfig does be resolved a configuration error")

- All seed method raises `ConfigurationError` with message and key 'ai.provider' not in OperatorConfig, defaults to `mock` provider))

**Acceptance criteria:**
- All seed functions populate the database with default values for all config categories
- `seed` inserts default values for any config category that doesn't exist in the operator_configs` table
- Database should contain exactly 4 rows of operator_configs: table: `kioskSessions` (1 row), `analyticsEvents` (4 rows), `operatorConfigs` (7 rows), `printJobs` (1 row for 10 categories based on `ai`, `payment`, `hardware`, `kiosk`, `general`)
- Seed method `seed_defaults` into operator_configs table
 updating `updated_at` to current timestamp
- Log that seeding occurred
 `seed_defaults` raises log that `session_start` ( `session_start`): `session` table is empty and `current_kiosk_session` is the database)
- Seed method `seed_defaults` into `kiosk_sessions` table inserting default rows for each session
 regardless of whether payment is enabled
- Seed method `seed_defaults` into `kiosk_sessions` table, where payment is disabled, insert default row `(paid, free) if payment is disabled
 insert default row with `free` (if payment not applicable)
- Seed method `seed_defaults` into `kiosk_sessions` table inserting `default.kiosk_idle_timeout_seconds` value) from `kiosk` and `general` config categories
- `kiosk_sessions` table: `idle`, `capture_countdown_seconds`, `kiosk`, and `general`
- Seed method `seed_defaults` into `kiosk_sessions` table inserting default countdown value (3)
 in `kiosk` and `general`
- Seed method `seed_defaults` into `kiosk_sessions` table where `capture_countdown_seconds = 3) for `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `capture_countdown_seconds` is 3) for `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `idle_timeout_seconds` = 0) for `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `brand_name` is `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `timezone` in `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `timezone` in `kiosk` and `general`)
- Seed method `seed_defaults` into `kiosk_sessions` table where `timezone` in receipts and printed on receipt (- Seed `timezone` value in `kiosk_sessions` from `general`

- Seed method `seed_defaults` into `kiosk_sessions` table, auto-detect kiosk browser locale for display UI in user's configured timezone. Default `Asia/Jakarta`
- All new admin components set timezone header, display `Asia/Jakarta`
 on receipts)

- All admin components support admin login, admin configuration, admin auth flow (admin PIN verification + JWT token generation
- Admin dashboard shows current session count, revenue and hardware status
 All admin dashboard components render correctly and load real-time data for: events dashboard` displays real-time hardware health metrics
- Admin can manage printer and camera hardware status
- Admin can trigger test print and camera capture
- Admin can access analytics (session count, revenue breakdown, and hardware test results)
- Admin can manage printer configuration
AI config, camera config, payment config, and one admin page

- Dashboard should have login, admin auth flow ( admin PIN + JWT verification + role-based token generation)- Session lifetime: `session` table stores the admin JWT token
 `password_hash` = `cookies`
- Sessions expire after configured time period

 return to login page
- Dashboard is accessible at `http://localhost:8000` or admin browser on the local network

 - CORS error handling
 working correctly
- Admin dashboard loads within 2 seconds
- Admin dashboard renders within 1 second
- 404 errors on network/API response should display "Network error" with appropriate message
- Admin dashboard displays an error log panel
  (same view for admin, same bug exists in related areas, fix there too)

- Admin dashboard does an admin, dashboard at `http://localhost:8000` in the local browser on the `admin` page at `kiosk` URL (`/admin`)
`, and set current active kiosk URL in a browser address bar)

- Admin dashboard does `kiosk` URL in QR code for the user to scan for payment")

- CORS error handling must to updated in the API contract
- Admin dashboard page must redirect to error page or not the admin dashboard)
- Admin dashboard must redirect to login page and show admin login form
- Admin login form validates PIN via `POST /admin/login` to backend and backend returns JWT token
- Login endpoint returns 401 Unauthorized response with 401 status code"
- Login success: shows "Logged in" and "Session created successfully"
- Login failure: shows "Invalid PIN" error message and locked out for configurable duration (- Show rate limit error after N failed attempts ( lockout duration doubles, doubling with each subsequent lockout (lockout duration doubles per session)

- Show rate limit error after N failed attempts, show "Too many attempts" message and lockout longer)

- After 5 failed attempts, disable the account for " -- disable the account" error
 return to login page to display "Payment is disabled" message |
- After failed logins, show "Login failed" message)
- After session expires: redirect to login page after configurable delay
- Failed logins redirect to login page, show "Login expired" message
- After timeout expiry redirect to idle/attract loop with auto-retry
- `/v1/sessions/{session_id}/sessions` endpoint returns `session_id` state from URL")
- `/v1/sessions` endpoint checks session status in URL before polling period

- `/v1/camera` endpoints detect and return `session_id` state from URL and return list of available camera devices and their camera by selected active camera for preview stream
- `/v1/printer` endpoints detect and return `session_id` state, return printer status and error details (- Test printer endpoint sends test print and return print job status
- Test printer endpoint returns `None` when printer is offline
 ensure `None` is error message (- Test printer endpoint verifies `printer_offline` alert is shown in admin dashboard
- Test printer endpoint returns correct printer status when printer is connected
- Test printer endpoint verifies `printer_usb` connection is correct ( detects USB device permission errors (read-only for the operator)
 or `PermissionError` exception is logged and and test instructions are printed)
- Test printer endpoint catches `PrinterError`, exception and returns printer status from abackend`

- Test printer endpoint returns `None` when printer is not connected (- Test printer endpoint returns `None` when printer is already in use, raises `PrinterError` with appropriate message
- Test printer endpoint handles error when paper width is unsupported (- Test printer endpoint handles `Value_error` when `paper_width` is operator config is invalid (e.g., `999mm`)"
- Test printer endpoint returns error for unsupported `paper_width` value
- Test printer endpoint handles connection refusal gracefully
- `backend/tests/integration/test_kiosk_flow.py`
- Tests for full kiosk session lifecycle: IDLE -> PAYMENT -> CAPTURE -> PROCESSING -> REVEAL -> RESET ->- Session timeout during processing state returns to IDLE state
- Test session timeout returns to IDLE state
- Test session timeout error handler in processing state transition to PROCESSING state
- Test full kiosk flow test covers all 6 state machine states transitions in correct order:
- Test state transitions: IDLE->PAYMENT transition (with payment disabled)
- Test state transition: IDLE->CAPTURE skips payment (free mode)
- Test state transition: CAPTURE->PROCESSING without countdown
- Test state transition: PROCESSING->REVEal with AI response
- Test state transition: REVEAL->RESET with timeout
- Test state transition: REVEAL->RESET clears session data (photo_path, ai_response text)
- Test state reset clears all temporary files in `/tmp/sessions/{session_id}/`
- Test session reset sets analytics events for session lifecycle

- Test session service raises `SessionTimeoutError` when session takes longer than configured timeout

- Verify `config_service.seed_defaults` is `session_start`
 method is called
seed_defaults` and verifies all config values exist in the database,- Verify `config_service.get_by_category('hardware') returns only hardware config
- Verify `config_service.get_by_category('ai')` returns AI config including system prompt
- Verify `config_service.get_by_category('payment')` returns payment config
- Verify `config_service.get_by_category('kiosk')` returns kiosk config
- Verify `config_service.get_by_category('general')` returns general config
- Verify `config_service.get_by_key` raises error for unknown key
- Verify `config_service.update()` sets updated_at` timestamp correctly
- Verify `config_service` handles concurrent access (same key should return error)
- Verify `config_service.seed_defaults` is `session_start` seeds default config values for each category

- Verify `config_service.seed_defaults` seeds Operator config defaults from `OperatorConfig` table
- Unit tests for `Config_service` pass
- Integration tests for config service pass

- All tests pass, no regressions

**Files to create/modify:** `backend/app/services/config_service.py`, `backend/app/services/config_service.py`, `backend/app/services/config_service.py`
- `backend/app/services/config_service.py`, `backend/app/services/config_service.py`
- Integration tests: `backend/tests/integration/test_kiosk_flow.py`, `backend/tests/integration/test_camera_flow.py`, `backend/tests/integration/test_kiosk_flow.py`, `backend/tests/integration/test_camera_flow.py`

**Acceptance criteria:**
- Exception hierarchy loads and raises specific exceptions classes for all HTTP error responses
- Error middleware catches and raises `VibePrintError` and returns JSON error envelope
- Error middleware handles CORS headers correctly
- Error middleware generates unique X-Request-ID` per response
- Error middleware returns consistent error format for all test cases
- All tests pass
- `make test` passes with zero lint errors or lower lint warnings, note: `ruff check` outputs linting suggestions, not Ruff format output, use `--max-length 120`)

 pytest-asyncio with `async def test_...`

- All tests pass

- No regressions in `make test` passes with zero errors, lower lint warning, note: `ruff check` outputs linting suggestions, not Ruff format output, use `--max-length 120`)

 pytest-asyncio with `async def test_...`

- All tests pass,- No regressions in `make test` passes with zero errors, lower lint warning, note: `Ruff check` outputs linting suggestions, not Ruff format output, use `--max-length 120`)
 pytest-asyncio with `async def test_...`

- All tests pass,- No regressions
 `make test` passes with zero errors
- All tests pass ( including new tests pass
- `make test` passes with zero lint errors
- All backend integration tests pass
 no regressions
 `make test` passes with zero lint errors
- `make test` passes with zero type errors
- All frontend tests pass
 no regressions
 `make test` passes with zero type errors
- All frontend test files compile without type checking for the component props and hook return types
- All frontend tests pass ( no regressions
 `make test` passes with zero lint errors

- All frontend tests pass, including React Query mocking for API calls
- All frontend tests pass with no regressions
- Full E2E test simulates complete kiosk user flow from browser ( including camera preview, capture, processing, reveal, error handling, payment
 and printout
 using `start-kiosk.sh` to `scripts/start-kiosk.sh` to development mode
- Run `make dev` to start `docker compose up` kiosk page, navigate to kiosk page (`/kiosk`) and admin page (`/admin`)).
- Navigate to admin login page (`/admin`)
- Navigate to admin dashboard page (`/admin`)
- Navigate to admin config page (`/admin`)
- Navigate to admin analytics page (`/admin`)
- Full kiosk flow completes in <60 seconds end-to-end with `make test` passes, no regressions in `make test` passes with zero lint errors

 `make test` passes with zero type errors
- `make test` passes with zero lint errors
- Full e2E test completes without external dependencies (- Full E2E test captures the full session timeout (- Full E2E test verifies capture-to-print < 30 seconds target)- Full E2E test verifies dithered quality of- Full E2E test verifies AI fallback template is used when AI fails
- Full E2E test verifies printer fallback when printer is offline or- Full E2E test verifies camera gracefully de degraded with fallback template
- Full E2E test verifies payment gracefully when payment provider is unavailable
- Full E2E smoke test with mock providers runs Docker environment
