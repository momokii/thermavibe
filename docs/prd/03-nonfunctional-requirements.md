# VibePrint OS -- Non-Functional Requirements

**Document Version:** 1.0
**Last Updated:** April 2026
**Status:** Active

---

## 1. Performance (NFR-PERF)

### NFR-PERF-001: State Transition Latency

**Requirement:** All kiosk state transitions must complete within 100 milliseconds of the triggering event (user touch, payment confirmation, AI response receipt, timeout expiry).

**Measurement:** Backend logs record the timestamp of each state entry and exit. The 99th percentile transition duration must be under 100ms.

**Rationale:** State transitions drive the user-facing experience. Delays between states create the perception of a sluggish, unresponsive system. A 100ms budget ensures that transitions feel instantaneous to the user.

---

### NFR-PERF-002: Capture-to-Print Total Duration

**Requirement:** The total time from photo capture to completed print must be under 30 seconds under normal operating conditions, with a target of 15 seconds.

**Measurement:** Backend logs record timestamps at capture, AI response received, and print job completed. The 90th percentile capture-to-print duration must be under 30 seconds. The 50th percentile (median) must be under 15 seconds.

**Breakdown by Phase:**
| Phase | Target Duration | Maximum Duration |
|-------|----------------|-----------------|
| Image compression and preprocessing | 500ms | 1,000ms |
| AI provider request (network round-trip + inference) | 8,000ms | 20,000ms |
| Response parsing and validation | 100ms | 500ms |
| Image dithering | 500ms | 1,000ms |
| Print job construction and transmission | 2,000ms | 5,000ms |
| Physical print output | 3,000ms | 8,000ms |
| **Total** | **~14,100ms** | **~35,500ms** |

**Rationale:** Users in a public kiosk setting have very low patience. Research on self-service kiosk abandonment shows that sessions exceeding 30 seconds from action to result experience significant drop-off. The 15-second target requires a responsive AI provider and a fast printer.

---

### NFR-PERF-003: Camera Preview Latency

**Requirement:** The camera preview displayed on the kiosk screen during the Capture state must have a maximum latency of 200 milliseconds from real-world event to screen display.

**Measurement:** A test rig displaying a known time source (e.g., a digital clock) in front of the camera is used to measure the difference between the clock's actual time and the time shown in the camera preview. The maximum observed latency must not exceed 200ms.

**Rationale:** Latency above 200ms creates a noticeable "delay" feeling that makes users uncomfortable and causes them to move during the countdown, resulting in blurred or mistimed captures.

---

### NFR-PERF-004: Admin Dashboard Page Load Time

**Requirement:** The admin dashboard must load its initial page within 2 seconds on the local network, and any subsequent navigation within the dashboard must complete within 1 second.

**Measurement:** Browser DevTools Network tab measures time to first contentful paint (FCP) for the initial load and navigation timing for subsequent page views.

**Rationale:** Operators access the dashboard briefly and frequently (daily check-ins). Slow load times discourage regular monitoring and reduce the operator's confidence in the system.

---

### NFR-PERF-005: Concurrent Session Handling

**Requirement:** The system must support a single active session at a time. If a second session attempt is made while one is in progress, the system must reject it gracefully.

**Measurement:** An automated test simulates concurrent session initiation attempts and verifies that only one session is active at any time.

**Rationale:** Single-session operation simplifies hardware resource management (one camera, one printer) and avoids complex concurrency issues in a kiosk setting.

---

## 2. Reliability (NFR-REL)

### NFR-REL-001: Auto-Recovery from Single Component Failure

**Requirement:** The system must automatically recover from the failure of any single component (backend crash, database disconnection, printer disconnection, camera disconnection) without requiring a full system reboot or manual intervention.

**Measurement:** Each component failure is simulated in an isolated test environment. The system must return to a fully operational state (Idle state with all hardware detected) within 60 seconds of the failure, or within 10 seconds of the failed component being restored (if the failure is persistent).

**Failure Scenarios and Expected Recovery:**
| Component Failure | Detection Time | Recovery Action | Recovery Time |
|-------------------|---------------|-----------------|---------------|
| FastAPI backend crash | Immediate (Docker health check) | Docker restarts container | 5-10 seconds |
| PostgreSQL connection lost | 5 seconds (connection pool check) | Queue writes, retry on reconnect | Automatic on reconnect |
| Thermal printer disconnected | 5 seconds (USB device monitor) | Mark offline, retry on reconnect | Automatic on reconnect |
| Webcam disconnected | 5 seconds (USB device monitor) | Mark offline, retry on reconnect | Automatic on reconnect |
| AI provider API unreachable | 30 seconds (health check) | Use fallback provider or template | Immediate (per session) |
| Payment provider API unreachable | 30 seconds (health check) | Disable payment, allow free sessions | Configurable |

---

### NFR-REL-002: Zero Data Loss for Paid Sessions

**Requirement:** No financial transaction data (payment amount, transaction ID, timestamp) may be lost under any failure condition. If the database is unreachable when a paid session completes, the session record must be queued and written when connectivity is restored.

**Measurement:** The database is disconnected during an active paid session. After the session completes, the database is reconnected. All session records must be present and accurate in the database within 30 seconds of reconnection.

**Rationale:** Financial records are legally and operationally critical. Losing a transaction record means the operator cannot reconcile their payment gateway statements with kiosk activity.

---

### NFR-REL-003: Uptime Target

**Requirement:** The kiosk system must achieve a monthly uptime of 99.5% or higher, excluding planned maintenance windows.

**Measurement:** Uptime is calculated as (total minutes in month - unplanned downtime minutes) / total minutes in month. Downtime is defined as any period where the kiosk screen is not displaying the attract loop or an active session. Docker health checks report uptime metrics every 60 seconds.

**99.5% Uptime Budget:**
For a 30-day month (43,200 minutes):
- Maximum unplanned downtime: 216 minutes (3.6 hours)
- This allows for approximately 1 significant incident per month or multiple brief incidents

**Rationale:** Operators depend on the kiosk for passive income. Every minute of unplanned downtime is lost revenue and diminished customer trust. The 99.5% target is achievable with Docker restart policies and proper error handling, without requiring redundant hardware.

---

### NFR-REL-004: Graceful Degradation

**Requirement:** When external dependencies (AI provider, payment provider) are unavailable, the system must degrade gracefully rather than failing completely. The kiosk must remain functional with reduced capabilities.

**Measurement:** Each external dependency is independently removed. The system must remain operational with the following degraded behavior:
- AI provider unavailable: Sessions proceed with fallback templates. Users still receive printed receipts.
- Payment provider unavailable: Payment is automatically disabled. Sessions proceed as free.
- Both unavailable: Sessions proceed as free with fallback templates.
- Database unavailable: Sessions proceed normally. Records are queued for later insertion.

---

## 3. Security (NFR-SEC)

### NFR-SEC-001: Session Data Wiping

**Requirement:** All user photo data must be wiped from volatile memory within 2 seconds of the session completing (Reset state). No user photo data may persist in memory, on disk, or in any cache beyond the active session.

**Measurement:** A memory inspection tool (e.g., Python's `tracemalloc` or `objgraph`) is used to verify that no references to the photo byte array remain after the Reset state. A filesystem scan verifies that no photo files are written to disk during or after the session.

**Implementation Requirements:**
- Photos are captured into a Python variable and never written to a file path.
- After printing, the photo variable is set to `None` and `del` is called to release the reference.
- The AI provider's HTTP response containing the image (if cached by the HTTP library) is explicitly cleared.
- No logging statements include the photo data (even base64-encoded).

---

### NFR-SEC-002: Admin Dashboard PIN Protection with Rate Limiting

**Requirement:** The admin dashboard must be protected by a PIN code of 4-8 digits. Failed PIN attempts must be rate-limited to prevent brute-force attacks.

**Measurement:** An automated test attempts PIN entry at high frequency. After 5 failed attempts, the system must lock out further attempts for 5 minutes. The lockout duration doubles with each subsequent lockout period (5 min, 10 min, 20 min, etc.).

**Implementation Requirements:**
- The PIN is stored as a bcrypt hash in the database (never in plaintext).
- Failed attempts are tracked per IP address and per session.
- The admin login page does not reveal whether the username/PIN combination is partially correct.
- The default PIN is set during initial setup and must be changed on first login.

---

### NFR-SEC-003: API Key Isolation from Frontend

**Requirement:** All third-party API keys (AI providers, payment gateways) must be stored server-side only. No API key may be transmitted to the frontend, included in JavaScript bundles, or exposed in HTTP responses.

**Measurement:** A network traffic inspection (browser DevTools Network tab, mitmproxy) verifies that no API key appears in any frontend-requested resource (HTML, JavaScript, CSS, API responses, WebSocket messages).

**Implementation Requirements:**
- API keys are stored in environment variables or the database (encrypted at rest).
- The backend API never returns API key values in any endpoint response, even to authenticated admin users. Admins see masked values (e.g., `sk-...a1b2`).
- Frontend code never constructs API calls directly to third-party services; all AI and payment requests are proxied through the backend.

---

### NFR-SEC-004: No Persistent Storage of User Photos

**Requirement:** User photos must never be stored in the PostgreSQL database, the filesystem, any object storage, or any external service other than the configured AI provider's API endpoint (over HTTPS, for the duration of the request only).

**Measurement:** A full filesystem audit after 100 consecutive sessions confirms zero photo files on disk. A database query confirms zero binary large objects (BLOBs) in any table. A network audit confirms that photo data is transmitted only to the configured AI provider endpoint.

---

### NFR-SEC-005: HTTPS for External Communications

**Requirement:** All communications with external services (AI provider APIs, payment provider APIs) must use HTTPS with TLS 1.2 or higher. HTTP (unencrypted) connections must be rejected.

**Measurement:** A network proxy intercepts traffic and verifies that all outbound requests use HTTPS. Any HTTP request attempt is logged as a security violation.

---

### NFR-SEC-006: Input Sanitization

**Requirement:** All user-supplied input (touch events, payment webhook payloads, admin form data) must be sanitized and validated before processing. No raw user input may be passed to database queries, shell commands, or rendered as HTML without escaping.

**Measurement:** Automated security scanning (OWASP ZAP or equivalent) tests for SQL injection, XSS, and command injection vulnerabilities. Zero high or critical vulnerabilities must be present.

---

## 4. User Experience (NFR-UX)

### NFR-UX-001: Fully Touch-Operable Interface

**Requirement:** The kiosk interface must be fully operable via touchscreen input only. No keyboard, mouse, or physical button is required for end-user interaction.

**Measurement:** A usability test with 10 participants who have never seen the kiosk before confirms that 100% of participants complete a full session using only touch input, with no assistance and no reference to instructions.

**Implementation Requirements:**
- All interactive elements (buttons, checkboxes) have a minimum touch target size of 48x48 CSS pixels (following WCAG 2.5.8 guidelines).
- No hover-dependent interactions exist in the kiosk UI.
- Text input fields are not used in the kiosk UI (end-users never type anything).
- The kiosk UI is displayed in fullscreen mode with no browser chrome, address bar, or system notifications visible.

---

### NFR-UX-002: Minimum Font Size on Kiosk UI

**Requirement:** All text displayed on the kiosk screen during end-user interaction must use a minimum of 24pt (32px) font size for body text and 36pt (48px) for headings and primary calls-to-action.

**Measurement:** A CSS audit of the kiosk frontend confirms that no text element in the kiosk-facing UI uses a font size below 24pt. The admin dashboard is exempt from this requirement (it is designed for desktop use).

**Rationale:** Kiosks are viewed at arm's length (approximately 60-80cm). Text smaller than 24pt is difficult to read at this distance, particularly for users with mild visual impairments or in environments with glare or suboptimal lighting.

---

### NFR-UX-003: Maximum Three Taps Per Action

**Requirement:** No user action in the kiosk flow may require more than 3 taps. The ideal session requires only 1 tap (touch to start; all subsequent actions are automatic).

**Measurement:** A task analysis of the kiosk flow confirms the tap count for each action:
| Action | Taps Required |
|--------|--------------|
| Start session | 1 (touch screen) |
| Complete payment | 0 (user scans QR with their phone, not the kiosk) |
| Photo capture | 0 (automatic after countdown) |
| Collect receipt | 0 (automatic) |
| Dismiss result / return to idle | 0 (automatic after timeout) or 1 (tap to skip) |
| **Total session taps** | **1-2** |

---

### NFR-UX-004: Clear Error Recovery for Public Users

**Requirement:** Any error state encountered during the kiosk flow must present the user with a clear, non-technical message and an obvious path to try again. The user must never feel "stuck" or uncertain about what to do.

**Measurement:** An error injection test triggers each possible error state (camera failure, AI timeout, printer failure, payment timeout). For each error, the screen must display: (a) a friendly message in the user's language, (b) a visual indicator that something went wrong (icon, color), and (c) either an automatic transition back to the attract loop within 5 seconds or a prominent "Try Again" button.

**Error Message Guidelines:**
- No technical jargon (no "API Error," "ESC/POS timeout," "HTTP 503").
- No blame language (no "You took too long," "Payment failed because you didn't scan").
- Positive framing: "We couldn't print your receipt this time. Please try again!" rather than "Print error."
- Language: default messages in English; operator can configure localized messages.

---

### NFR-UX-005: Visual Feedback for All Interactions

**Requirement:** Every user interaction must produce immediate visual feedback (within 100ms). This includes touch events, state transitions, countdown animations, and receipt printing.

**Measurement:** A high-speed camera recording of the kiosk screen at 120fps confirms that visual feedback (button color change, animation start, screen transition) begins within 100ms of the triggering event.

**Examples:**
- Touching the screen: instant ripple effect or color change on the touch point.
- Entering Capture state: camera feed appears with a smooth fade-in.
- Countdown: large, animated numbers (3, 2, 1) with a visual flash on capture.
- AI processing: engaging loading animation (not a static spinner).
- Printing: visual confirmation message ("Your vibe reading is printing...").
- Error: smooth transition to error screen (no jarring cut).

---

## 5. Compatibility (NFR-COMP)

### NFR-COMP-001: UVC-Compliant USB Webcam Support

**Requirement:** The system must work with any USB webcam that complies with the USB Video Class (UVC) standard, without requiring manufacturer-specific drivers or software.

**Measurement:** The system is tested with at least 5 different webcam models from at least 3 different manufacturers (e.g., Logitech C270, Logitech C920, Microsoft LifeCam, generic Chinese UVC webcams). All tested webcams must successfully provide a preview stream and capture images at the configured resolution.

**Implementation Requirements:**
- Camera access is implemented through OpenCV's `VideoCapture` interface, which abstracts UVC devices.
- No vendor-specific SDKs or libraries are used for camera access.
- The system queries the camera's supported resolutions and frame rates using OpenCV and uses this information to validate the operator's configuration.
- Camera auto-detection scans `/dev/video*` devices and enumerates their capabilities via V4L2 (Video4Linux2).

**Verified Hardware:**
| Webcam | Interface | Tested Resolutions | Status |
|--------|-----------|-------------------|--------|
| Logitech C270 | USB 2.0 | 640x480, 1280x720 | Verified |
| Logitech C920 | USB 2.0 | 640x480, 1280x720, 1920x1080 | Verified |
| Microsoft LifeCam HD-3000 | USB 2.0 | 640x480, 1280x720 | Verified |
| Generic ELP USB webcam | USB 2.0 | 640x480, 1280x720 | Verified |

---

### NFR-COMP-002: ESC/POS-Compatible Thermal Printer Support

**Requirement:** The system must work with any thermal printer that supports the ESC/POS command protocol, in both 58mm and 80mm paper widths.

**Measurement:** The system is tested with at least 3 different ESC/POS thermal printer models from at least 2 different manufacturers. All tested printers must successfully print image and text content with correct formatting and paper cutting.

**Implementation Requirements:**
- Printer communication is implemented through the `python-escpos` library, which provides a USB backend for ESC/POS printers.
- The printer is accessed via its USB vendor ID and product ID for reliable device identification across reboots.
- The system auto-detects the printer's paper width (58mm or 80mm) and adjusts image dithering and text formatting accordingly.
- No vendor-specific SDKs or proprietary drivers are required.

**Verified Hardware:**
| Printer | Width | Interface | Status |
|---------|-------|-----------|--------|
| Epson TM-T20III | 80mm | USB | Verified |
| Xprinter XP-58IIH | 58mm | USB | Verified |
| Generic POS-58 (Chinese) | 58mm | USB | Verified |

---

### NFR-COMP-003: Linux Ubuntu 22.04+ Compatibility

**Requirement:** The system must run on Ubuntu 22.04 LTS (Jammy Jellyfish) and Ubuntu 24.04 LTS (Noble Numbat) without modification. Debian 12 (Bookworm) compatibility is a secondary target.

**Measurement:** A clean installation of each target OS is provisioned, Docker is installed, and the `docker compose up` command is executed. The system must start successfully, detect hardware, and complete a full test session on each OS.

**System Requirements:**
| Component | Minimum | Recommended |
|-----------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 cores (ARM or x86_64) | 4 cores |
| RAM | 2 GB | 4 GB |
| Storage | 8 GB (SSD recommended) | 16 GB SSD |
| USB | 1x USB 2.0 port (for webcam), 1x USB port (for printer) | USB 3.0 ports |
| Network | WiFi or Ethernet (for AI API and payment) | Wired Ethernet |
| Display | HDMI or USB-C display output | Touchscreen HDMI display |

---

### NFR-COMP-004: Browser Compatibility for Admin Dashboard

**Requirement:** The admin dashboard must function correctly on the latest versions of Chrome, Firefox, Safari, and Edge. It must be accessible from any device on the local network (desktop, tablet, phone).

**Measurement:** The admin dashboard is tested on each browser using automated cross-browser testing (Playwright or Selenium). All CRUD operations, analytics views, and test print/camera functions must work correctly on each browser.

---

## 6. Maintainability (NFR-MAINT)

### NFR-MAINT-001: Docker-Based Deployment Only

**Requirement:** The system must be deployable exclusively via Docker Compose. No bare-metal installation, manual Python environment setup, or system service configuration is required or supported.

**Measurement:** A fresh provisioned machine with only Docker and Docker Compose installed must be able to run the complete system by executing `docker compose up -d` after cloning the repository and copying the `.env` file.

**Implementation Requirements:**
- The repository includes a `docker-compose.yml` file that defines all services (backend, frontend, database).
- Each service is defined in its own `Dockerfile` with pinned base image versions.
- No host-level dependencies are required beyond Docker Engine and Docker Compose.
- All build steps are encapsulated in the Dockerfiles; no `pip install` or `npm install` commands need to be run on the host.

---

### NFR-MAINT-002: Configuration via Environment Variables

**Requirement:** All runtime configuration (API keys, hardware settings, feature toggles, timeouts) must be provided through environment variables. No configuration values may be hardcoded in source code.

**Measurement:** A search of the codebase confirms zero hardcoded API keys, database credentials, IP addresses, or configuration constants. All configurable values reference environment variables with sensible defaults.

**Environment Variable Categories:**
| Category | Example Variables |
|----------|------------------|
| AI Provider | `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_FALLBACK_PROVIDER` |
| Payment | `PAYMENT_ENABLED`, `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_MERCHANT_ID` |
| Camera | `CAMERA_DEVICE_ID`, `CAMERA_CAPTURE_RESOLUTION`, `CAMERA_PREVIEW_RESOLUTION` |
| Printer | `PRINTER_VENDOR_ID`, `PRINTER_PRODUCT_ID`, `PRINTER_PAPER_WIDTH` |
| Admin | `ADMIN_PIN`, `ADMIN_SESSION_TIMEOUT` |
| Database | `DATABASE_URL`, `DATABASE_POOL_SIZE` |
| General | `SESSION_TIMEOUT`, `LOG_LEVEL`, `LOCALE` |

A `.env.example` file must be provided in the repository root with all configurable variables, their defaults, and documentation comments.

---

### NFR-MAINT-003: Database Migrations via Alembic

**Requirement:** All database schema changes must be managed through Alembic migrations. No manual SQL scripts or schema modifications outside of Alembic are permitted.

**Measurement:** A test that applies all migrations to a fresh database (via `alembic upgrade head`) results in a schema that matches the expected production schema. A test that applies all migrations, then runs `alembic downgrade base`, then runs `alembic upgrade head` again succeeds without errors.

**Implementation Requirements:**
- Every schema change is accompanied by a new Alembic migration file.
- Migrations are auto-generated using `alembic revision --autogenerate` and then reviewed and edited by a developer before committing.
- Migrations include both `upgrade()` and `downgrade()` functions for full reversibility.
- The migration history is linear (no merge migrations) to simplify rollbacks.

---

### NFR-MAINT-004: Logging and Observability

**Requirement:** The system must produce structured JSON logs for all significant events (state transitions, API calls, errors, hardware events). Logs must be configurable by severity level.

**Measurement:** A log analysis confirms that every state transition, every external API call, every error, and every hardware event produces a structured log entry. Log entries include: timestamp (ISO 8601), level, service name, event type, session ID (if applicable), and relevant metadata.

**Implementation Requirements:**
- Python backend uses the `structlog` library for structured JSON logging.
- React frontend logs to the browser console in development mode; in production, errors are reported to the backend via an error boundary API.
- Log level is configurable via the `LOG_LEVEL` environment variable (default: `INFO`).
- Logs are written to stdout/stderr (consumed by Docker's logging driver) and can be forwarded to any log aggregation service.

---

### NFR-MAINT-005: Code Quality Standards

**Requirement:** The codebase must maintain a minimum standard of code quality as measured by automated tools.

**Measurement:**
| Tool | Target | Enforcement |
|------|--------|-------------|
| Ruff (Python linter) | Zero errors, zero warnings | CI pipeline fails on violation |
| Ruff format (Python formatter) | 100% formatted | CI pipeline fails on violation |
| ESLint (TypeScript/React linter) | Zero errors | CI pipeline fails on violation |
| Prettier (TypeScript/React formatter) | 100% formatted | CI pipeline fails on violation |
| mypy (Python type checker) | Strict mode, zero errors | CI pipeline fails on violation |
| TypeScript strict mode | Zero type errors | CI pipeline fails on violation |
| pytest (Python tests) | 80%+ code coverage | CI warning at <80%, failure at <60% |
| Vitest (React tests) | 70%+ component coverage | CI warning at <70% |

---

## 7. Scalability (NFR-SCALE)

### NFR-SCALE-001: Architecture for Future Multi-Kiosk Support

**Requirement:** While v1.0 supports a single kiosk instance per deployment, the software architecture must not contain fundamental design decisions that would prevent future multi-kiosk support (a single operator managing multiple kiosks from one admin dashboard).

**Measurement:** An architectural review confirms the following:
- The state machine is instance-scoped, not globally scoped, allowing multiple instances to run concurrently.
- The database schema includes a `kiosk_id` column in all session-related tables, allowing records from multiple kiosks to be stored in a single database.
- The admin dashboard's API endpoints accept an optional `kiosk_id` parameter, enabling future filtering by kiosk.
- No global singletons or process-level state prevent running multiple kiosk instances on the same machine or network.

**Out of Scope for v1.0:** Centralized multi-kiosk management, remote monitoring, kiosk fleet provisioning, and load balancing. These are explicitly deferred to a future version.

---

### NFR-SCALE-002: PostgreSQL-Ready Architecture

**Requirement:** The database layer must use PostgreSQL for all persistent storage. The ORM (SQLAlchemy) must be configured to use PostgreSQL-specific features where beneficial (JSONB columns, full-text search) without introducing SQLite compatibility requirements.

**Measurement:** The `DATABASE_URL` environment variable must point to a PostgreSQL connection string. The system must not function correctly with SQLite (which is intentionally unsupported to prevent accidental use in production).

**Rationale:** SQLite's limitations (single-writer concurrency, limited data types, no full-text search) make it unsuitable for production use, even for a single kiosk. PostgreSQL provides robust concurrency, reliable write durability, and advanced query capabilities that future features (analytics, multi-kiosk) will require.

---

### NFR-SCALE-003: Database Performance Under Load

**Requirement:** The database must handle at least 500 session insertions per hour (approximately 1 session every 7 seconds, sustained) with no significant performance degradation.

**Measurement:** A load test inserts 500 session records per hour for 24 hours (12,000 total records). During this period, the admin dashboard analytics queries must complete within 2 seconds and the session log query must complete within 1 second.

**Implementation Requirements:**
- Database connection pooling is configured with a minimum of 2 and maximum of 10 connections.
- Session records use appropriate indexing (timestamp, outcome, kiosk_id) to support common query patterns.
- Old session records are archived or deleted based on the configured retention policy to prevent unbounded table growth.

---

### NFR-SCALE-004: Frontend Asset Optimization

**Requirement:** The kiosk frontend must be optimized for fast initial load on the target hardware (which may have limited CPU and memory).

**Measurement:**
| Metric | Target |
|--------|--------|
| Total JavaScript bundle size (kiosk UI) | Under 200 KB (gzipped) |
| Total CSS bundle size | Under 50 KB (gzipped) |
| First Contentful Paint | Under 1.5 seconds |
| Time to Interactive | Under 2 seconds |
| Number of HTTP requests on initial load | Under 10 |

**Implementation Requirements:**
- React/Vite build with code splitting for the admin dashboard (loaded separately from the kiosk UI).
- Static assets served with appropriate cache headers.
- No runtime dependencies that are not tree-shaken and bundled.
- Images and fonts are optimized and served in modern formats (WebP, WOFF2).
