# Coding Standards — VibePrint OS

Derived from `docs/technical/coding-standards.md`, `CLAUDE.md`, and actual code patterns observed in the repo.

---

## Project Structure

### Backend (`backend/`)

```
backend/
├── app/
│   ├── ai/                     # AI provider adapters (strategy pattern)
│   │   ├── base.py             # Abstract base class
│   │   ├── mock_provider.py    # Mock (always available)
│   │   ├── openai_provider.py
│   │   ├── anthropic_provider.py
│   │   ├── google_provider.py
│   │   └── ollama_provider.py
│   ├── api/
│   │   ├── deps.py             # Dependency injection
│   │   └── v1/
│   │       ├── router.py       # Route aggregation
│   │       └── endpoints/      # Individual endpoint modules
│   ├── core/
│   │   ├── config.py           # Pydantic BaseSettings
│   │   ├── database.py         # SQLAlchemy async engine
│   │   ├── exceptions.py       # Custom exception hierarchy
│   │   ├── middleware.py       # CORS, error handling, request ID
│   │   ├── security.py         # PIN auth + JWT
│   │   ├── events.py           # Startup/shutdown events
│   │   └── lifecycle.py        # Lifecycle management
│   ├── models/                  # SQLAlchemy ORM models
│   ├── payment/                 # Payment provider adapters (strategy pattern)
│   ├── schemas/                 # Pydantic request/response schemas
│   ├── services/                # Business logic layer
│   ├── utils/                   # Utilities (dithering, image, logging, validators)
│   └── main.py                  # FastAPI application factory
├── alembic/                     # Database migrations
├── tests/
│   ├── conftest.py             # Shared fixtures
│   ├── unit/                   # Unit tests per service
│   └── integration/            # Integration tests per endpoint
├── alembic.ini
└── pyproject.toml              # Dependencies and tool config
```

### Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── api/                    # API client + endpoint functions
│   │   ├── client.ts           # Axios instance
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── kioskApi.ts
│   │   ├── paymentApi.ts
│   │   ├── adminApi.ts
│   │   └── cameraApi.ts
│   ├── components/
│   │   ├── admin/              # Admin dashboard components
│   │   ├── kiosk/              # Kiosk UI components (one per state)
│   │   └── ui/                 # shadcn/ui components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities (cn, constants, formatters)
│   ├── pages/                  # Page-level components
│   ├── stores/                 # Zustand state stores
│   │   ├── kioskStore.ts       # Kiosk state machine mirror
│   │   └── adminStore.ts       # Admin dashboard state
│   ├── App.tsx                 # Root component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── components.json            # shadcn/ui config
```

### Where New Files Go

| Artifact | Location | Example |
|----------|----------|---------|
| New API endpoint | `backend/app/api/v1/endpoints/` | `payment.py` |
| New service | `backend/app/services/` | `payment_service.py` |
| New model | `backend/app/models/` | `payment.py` |
| New schema | `backend/app/schemas/` | `payment.py` |
| New provider adapter | `backend/app/ai/` or `backend/app/payment/` | `openai_provider.py` |
| New kiosk component | `frontend/src/components/kiosk/` | `IdleScreen.tsx` |
| New admin component | `frontend/src/components/admin/` | `HardwareSetup.tsx` |
| New hook | `frontend/src/hooks/` | `useCamera.ts` |
| New page | `frontend/src/pages/` | `KioskPage.tsx` |
| New store | `frontend/src/stores/` | `kioskStore.ts` |

---

## Python Conventions

### Style (enforced by Ruff)
- **Formatter:** Ruff format
- **Line length:** 120 characters max
- **Quotes:** Single quotes for strings, double quotes for docstrings
- **Indent:** 4 spaces
- **Trailing commas:** No
- **Type hints:** Required on ALL function signatures (arguments and return types)

### Naming
- **Files:** `snake_case.py` — lowercase with underscores
- **Classes:** `PascalCase` — e.g., `KioskSession`, `AIProvider`
- **Functions/methods:** `snake_case` — e.g., `create_session`, `get_provider`
- **Constants:** `UPPER_SNAKE_CASE` — e.g., `MAX_RETRIES`, `DEFAULT_TIMEOUT`
- **Pydantic models:** `PascalCase` with suffix — e.g., `SessionCreateRequest`, `SessionResponse`
- **Private methods:** Prefix with `_` — e.g., `_validate_state_transition`

### Error Handling
- Use the custom exception hierarchy from `backend/app/core/exceptions.py`:
  - `VibePrintError` (base)
  - `SessionError`, `StateTransitionError`
  - `AIProviderError`, `AIFallbackExhausted`
  - `PaymentError`, `PaymentTimeoutError`
  - `PrinterError`, `PrinterOfflineError`
  - `CameraError`, `CameraNotFoundError`
  - `ConfigurationError`
- Never raise raw `Exception` or `HTTPException` directly — use specific subclasses
- All errors logged with structured logging before raising

### Response Envelope Format
All API responses follow a consistent JSON envelope:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO-8601"
  }
}
```

Error responses:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "detail": "Additional context (optional)",
    "request_id": "uuid"
  }
}
```

### Async Patterns
- All database operations use `AsyncSession` from SQLAlchemy
- Services receive `AsyncSession` via dependency injection
- Never use `sync_session` or `sessionmaker` (sync variants)
- Use `async with` for session management

### Logging
- Use `structlog` for structured JSON logging
- Log level configurable via `LOG_LEVEL` env var (default: `INFO`)
- Always include: timestamp, level, event type, session_id (if applicable)
- Never log photo data, API keys, or sensitive information

### Docstrings
- All public functions and classes must have Google-style docstrings
- Format: `"""Brief description.\n\nArgs:\n    ...\n\nReturns:\n    ...\n\nRaises:\n    ...\n"""`

---

## TypeScript / React Conventions

### Style (enforced by ESLint + Prettier)
- **Indent:** 2 spaces
- **Quotes:** Single quotes
- **Semicolons:** No
- **Trailing commas:** Yes (where valid)
- **Strict mode:** TypeScript strict mode enabled

### Naming
- **Files:** `PascalCase.tsx` for components, `camelCase.ts` for utilities
- **Components:** Named exports only — `export function ComponentName()`
- **Hooks:** `usePascalCase` — e.g., `useKioskState`, `useCamera`
- **Stores:** `PascalCase` + "Store" suffix — e.g., `useKioskStore`
- **Types/Interfaces:** `PascalCase` — e.g., `SessionResponse`, `PaymentStatus`
- **Constants:** `UPPER_SNAKE_CASE` — e.g., `API_BASE_URL`, `SESSION_STATES`

### Components
- Functional components only — no class components
- Component file structure: JSDoc header -> imports -> component -> exports
- Props defined as `interface ComponentNameProps`
- Use shadcn/ui primitives as building blocks
- Framer Motion for animations

### State Management
- **Zustand** for client-side state (kiosk state machine, UI state)
- **React Query** for server state (API data, caching, background refetch)
- Stores in `frontend/src/stores/`
- Never store derived state — compute it

### API Integration
- All API calls go through `frontend/src/api/client.ts` (Axios instance)
- One file per domain: `kioskApi.ts`, `paymentApi.ts`, `adminApi.ts`, `cameraApi.ts`
- Frontend NEVER calls external APIs directly (AI, payment gateways) — always proxied through backend

---

## Testing Requirements

### Backend (pytest)
- **Runner:** pytest with pytest-asyncio (mode: auto)
- **Location:** `backend/tests/`
- **Unit tests:** `tests/unit/test_{service_name}.py`
- **Integration tests:** `tests/integration/test_{endpoint_name}.py`
- **Coverage target:** 80%+ overall, 60% minimum
- **Fixtures:** Defined in `tests/conftest.py`
- **Mocking:** Mock all external services (AI, payment, camera, printer)
- **Every service** must have unit tests
- **Every endpoint** must have integration tests

### Frontend (Vitest)
- **Runner:** Vitest with jsdom environment
- **Location:** `frontend/src/__tests__/`
- **Component tests:** `__tests__/components/{ComponentName}.test.tsx`
- **Hook tests:** `__tests__/hooks/{hookName}.test.ts`
- **Store tests:** `__tests__/stores/{storeName}.test.ts`
- **API mocking:** MSW (Mock Service Worker) for API mocks
- **Coverage target:** 70%+ component coverage

---

## Git Conventions

### Commit Messages
- **Format:** Conventional Commits
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `refactor:` code refactoring
- `test:` adding or updating tests
- `chore:` maintenance tasks (dependencies, config)
- `ci:` CI/CD changes

### Branch Naming
- `feat/{task-id}-{brief-description}`
- `fix/{issue-description}`
- `chore/{description}`

---

## Forbidden Patterns

These patterns are explicitly disallowed:

1. **Sync database calls** — Always use `AsyncSession`
2. **Class components in React** — Use functional components with hooks
3. **Raw `Exception` or `HTTPException`** — Use specific `VibePrintError` subclasses
4. **Hardcoded API keys or secrets** — All via environment variables
5. **Direct external API calls from frontend** — Always proxy through backend
6. **Storing user photos in database** — Photos are temporary files only
7. **Vendor-locked hardware code** — Always use generic interfaces (UVC, ESC/POS)
8. **Skipping the service layer** — Routes must call services, never models directly
9. **Modifying `.env.example` without updating `docs/technical/development-setup-guide.md`**
10. **Removing API endpoints without updating `docs/technical/api-contract.md`**
11. **Changing database column types without a new Alembic migration**
