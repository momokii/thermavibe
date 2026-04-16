# Security Standards — VibePrint OS

Derived from the Phase 1 security audit (2026-04-16). All future code must comply with these requirements.

---

## Audit Findings Summary

**Overall Posture: YELLOW** (good foundations, production hardening needed)

### Confirmed Safe
- No hardcoded secrets, API keys, or tokens in source code
- `.env` is properly gitignored (not tracked in version control)
- All queries use SQLAlchemy ORM with parameterized statements (no SQL injection risk)
- JWT authentication with constant-time PIN comparison (`hmac.compare_digest`)
- Rate limiting on admin login endpoint (5 attempts per IP per 60 seconds)
- Input validation via Pydantic v2 on all request bodies
- Photo files saved with UUID names, deleted after session completion
- Port binding limited to localhost (`127.0.0.1:8000`)

### Issues Requiring Remediation

| ID | Issue | Severity | File |
|----|-------|----------|------|
| SEC-001 | Docker container runs as root (no `USER` directive) | Medium | `Dockerfile` |
| SEC-002 | No API rate limiting beyond auth endpoint | Medium | `backend/app/core/middleware.py` |
| SEC-003 | No request/response size limits | Low | FastAPI app config |
| SEC-004 | CORS allows all methods/headers; should restrict in production | Low | `backend/app/core/middleware.py` |

### Acceptable for Development, Must Change for Production
- Default `APP_SECRET_KEY="change-me-in-production"` — acceptable for dev, mandatory to change in prod
- Default `ADMIN_PIN="1234"` — acceptable for dev, mandatory to change in prod
- In-memory rate limiter — acceptable for single-kiosk deployment
- In-memory payment store — acceptable for single-kiosk deployment

---

## Secrets & Environment Variable Management

- **Never** hardcode secrets, API keys, tokens, passwords, or any sensitive value in source code — not in test files, not in fixtures, not in comments
- All secrets are managed via environment variables loaded from `.env` files
- `.env` is excluded from version control via `.gitignore`
- `.env.example` at the repository root is the source of truth for all required environment variables — it contains all variable names with placeholder values and descriptions
- **If a new environment variable is introduced**, both `.env.example` and `docs/technical/development-setup-guide.md` must be updated
- **Never** log, print, or expose environment variable values in output, error messages, or debug statements

### Required Environment Variables

| Category | Variables | Purpose |
|----------|-----------|---------|
| App | `APP_ENV`, `APP_SECRET_KEY`, `APP_DEBUG` | Environment, JWT signing key, debug mode |
| Database | `DATABASE_URL` | PostgreSQL connection string |
| AI | `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_BASE_URL`, `AI_MODEL`, `AI_SYSTEM_PROMPT` | AI provider selection and configuration |
| Payment | `PAYMENT_ENABLED`, `PAYMENT_PROVIDER`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, `XENDIT_API_KEY`, `PAYMENT_AMOUNT`, `PAYMENT_CURRENCY`, `PAYMENT_TIMEOUT_SECONDS` | Payment gateway configuration |
| Hardware | `PRINTER_VENDOR_ID`, `PRINTER_PRODUCT_ID`, `PRINTER_PAPER_WIDTH`, `CAMERA_DEVICE_INDEX`, `CAMERA_RESOLUTION_WIDTH`, `CAMERA_RESOLUTION_HEIGHT` | USB device configuration |
| Kiosk | `KIOSK_IDLE_TIMEOUT_SECONDS`, `KIOSK_CAPTURE_COUNTDOWN_SECONDS`, `KIOSK_PROCESSING_TIMEOUT_SECONDS`, `KIOSK_REVEAL_DISPLAY_SECONDS` | Kiosk timing configuration |
| Admin | `ADMIN_PIN` | Admin dashboard access PIN |
| CORS | `CORS_ALLOWED_ORIGINS` | Allowed cross-origin domains |

---

## Input Validation & Sanitization

- All external input must be validated and sanitized at the **boundary layer** before reaching any business logic
- The boundary layer for this project is: `backend/app/api/v1/endpoints/` — every request enters through endpoint handlers
- **Validation mechanism:** Pydantic v2 `BaseModel` schemas with `Field()` constraints (min_length, ge, le, regex patterns)
- **File uploads:** Validated as images by PIL, saved with UUID filenames to `/tmp/sessions/{id}/`
- **Never** trust client-supplied data for authorization decisions
- **Never** pass raw user input to SQL queries (all queries use SQLAlchemy ORM)

### Validation Pattern

```python
# In schemas/ — define validation rules
class LoginRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=6)

# In endpoints/ — enforce validation via type hints
async def login(request: LoginRequest) -> LoginResponse:
    # request is already validated by Pydantic
    ...
```

---

## Authentication & Authorization

### Current Implementation
- **Method:** PIN-based authentication with JWT tokens (HS256 algorithm)
- **PIN verification:** Constant-time comparison via `hmac.compare_digest()` (timing attack prevention)
- **JWT expiry:** 24 hours default
- **Rate limiting:** 5 failed login attempts per IP per 60-second window
- **Token storage:** JWT stored in browser localStorage, attached via Axios interceptor as `Authorization: Bearer <token>`

### Protected Routes
- All `/api/v1/admin/*` routes require valid JWT via `get_current_admin` dependency
- Kiosk routes (`/api/v1/kiosk/*`) are intentionally unprotected (public-facing kiosk)
- Health check (`/health`) is intentionally unprotected

### Rules
- **Default deny** posture: all new routes must be protected unless explicitly designed for public access
- **Never** implement an auth bypass "to be fixed later" — incomplete auth is a blocker
- Admin PIN must be configurable via environment variable, never hardcoded
- Rate limiting must be preserved and extended when new auth endpoints are added

---

## Dependency Security

### Current Approach
- **Backend:** Dependencies defined in `backend/pyproject.toml` with minimum version pins (e.g., `fastapi>=0.115.0`)
- **Frontend:** Dependencies defined in `frontend/package.json` with exact version pins, lockfile via npm

### Rules
- **Before adding any new dependency:**
  1. Check for known vulnerabilities: `pip audit` (backend) / `npm audit` (frontend)
  2. Log the check result in `DECISIONS_LOG.md`
  3. Receive user confirmation before proceeding
- **Pin versions** — minimum version pins for backend (`>=`), exact pins for frontend
- **Prefer stdlib** — only add a dependency when the stdlib cannot meet the requirement
- **Review licenses** — all dependencies must be compatible with MIT license

---

## Docker & Container Security

### Current Posture (from audit)
- PostgreSQL container: runs as non-root (default postgres user)
- App container: **runs as root** (no `USER` directive in Dockerfile)
- Port binding: limited to localhost (`127.0.0.1:8000`)
- Health checks: implemented for PostgreSQL
- USB devices: passthrough configured for camera and printer
- Volumes: isolated for data persistence

### Requirements for All Future Docker Changes
- All containers must run as non-root users
- Never expose debug ports, seed scripts, or development tooling in production configuration
- `.env` files must never be included in Docker images
- Use multi-stage builds to minimize attack surface
- Keep health checks up to date

---

## Stack-Specific Security Guidance

### SQL Injection Prevention
- All database queries use SQLAlchemy ORM with parameterized statements
- `text()` is only used for safe SQL literals (column names in ORDER BY, literal queries like `SELECT 1`)
- **Never** use `text()` with user-supplied values
- **Never** use f-strings or string concatenation for SQL queries

### CORS Configuration
- Origins configured via `CORS_ALLOWED_ORIGINS` environment variable
- Default: `http://localhost:5173,http://localhost:8000` (development only)
- **Production:** Must restrict to the actual kiosk and admin URLs
- Currently allows all methods and headers — should be narrowed for production

### File Upload Security
- Uploaded images validated by PIL (must be valid image format)
- Files saved to `/tmp/sessions/{session_id}/` with UUID filenames
- No path traversal risk (UUID-based paths, not user-supplied names)
- Files automatically deleted during session RESET/finish

### Session Data Privacy
- Photos are never stored in the database
- Photos are temporary files, deleted after session completion
- AI response text is stored in database for analytics but contains no PII
- Payment references stored for reconciliation but payment details are not
- Matches Indonesia PDP Law compliance requirements (NFR-SEC-001, NFR-SEC-004)

### Frontend Security
- No use of dangerous DOM injection patterns in the codebase
- JWT stored in localStorage (acceptable for kiosk context, vulnerable to XSS in web apps)
- All API calls proxied through backend (frontend never calls external services directly)
- React's default escaping prevents XSS in rendered content
