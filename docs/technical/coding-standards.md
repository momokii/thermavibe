# VibePrint OS -- Coding Standards

> This document defines the coding standards, conventions, and best practices for the VibePrint OS project. All contributors must follow these standards to maintain consistency, readability, and maintainability across the codebase.

---

## Table of Contents

1. [Python (Backend)](#1-python-backend)
2. [TypeScript (Frontend)](#2-typescript-frontend)
3. [Git](#3-git)
4. [Testing](#4-testing)

---

## 1. Python (Backend)

### 1.1 Style and Formatting

- **PEP 8 compliance** enforced by **Ruff** (replaces flake8, isort, and black).
- Maximum line length: **120 characters**.
- Indentation: **4 spaces** (no tabs).
- String quotes: **single quotes** for dict keys and short strings, **double quotes** for docstrings and strings containing single quotes.
- Trailing commas: **required** in multi-line collections and function signatures for clean diffs.
- Import sorting: enforced by Ruff's isort rules (stdlib, third-party, local).

Ruff configuration in `pyproject.toml`:

```toml
[tool.ruff]
target-version = "py312"
line-length = 120

[tool.ruff.lint]
select = [
    "E",    # pycodestyle errors
    "W",    # pycodestyle warnings
    "F",    # pyflakes
    "I",    # isort
    "N",    # pep8-naming
    "UP",   # pyupgrade
    "B",    # flake8-bugbear
    "SIM",  # flake8-simplify
    "RUF",  # ruff-specific rules
]

[tool.ruff.format]
quote-style = "single"
indent-style = "space"
```

### 1.2 Type Hints

Type hints are **mandatory** on all function signatures. This applies to parameters, return types, and variable annotations where the type is not immediately obvious.

```python
from datetime import datetime
from typing import Optional

# Correct: full type hints on all parameters and return type
async def create_session(
    db: AsyncSession,
    payment_enabled: bool = False,
) -> Session:
    session = Session(state="IDLE", payment_enabled=payment_enabled)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

# Incorrect: missing type hints
async def create_session(db, payment_enabled=False):
    ...
```

Use `Optional[X]` or `X | None` (Python 3.12+ union syntax) for nullable parameters. Prefer the `X | None` syntax:

```python
# Correct: modern union syntax
def get_device(device_id: str | None = None) -> DeviceConfig | None:
    ...

# Also acceptable: Optional syntax
from typing import Optional

def get_device(device_id: Optional[str] = None) -> Optional[DeviceConfig]:
    ...
```

Use `TYPE_CHECKING` guard for type-only imports to avoid circular imports:

```python
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.models.session import Session
```

### 1.3 Docstrings

All public functions, classes, and modules must have docstrings in **Google style** format.

```python
class KioskService:
    """Manages kiosk session lifecycle and state transitions.

    This service handles creating new sessions, transitioning between
    kiosk states, and cleaning up expired sessions.

    Attributes:
        db: Async SQLAlchemy database session for persistence operations.
    """

    async def create_session(self) -> Session:
        """Create a new kiosk session in the IDLE state.

        Generates a unique session ID, persists the session to the database,
        and returns the created Session object.

        Returns:
            Session: The newly created session with state set to IDLE.

        Raises:
            DatabaseError: If the session cannot be persisted due to a
                database connection issue.
        """
        session = Session(state=KioskState.IDLE)
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def transition(self, session_id: str, new_state: KioskState) -> Session:
        """Transition a session to a new state.

        Validates that the transition is allowed based on the current state
        and the state machine rules. Raises an exception if the transition
        is invalid.

        Args:
            session_id: The unique identifier of the session to transition.
            new_state: The target state to transition to.

        Returns:
            Session: The updated session object.

        Raises:
            SessionNotFoundError: If no session exists with the given ID.
            InvalidStateTransition: If the transition from the current state
                to the new state is not allowed.
        """
        ...
```

### 1.4 Async/Await

All I/O operations must use `async/await`. This includes:

- Database queries (SQLAlchemy async session)
- HTTP client requests to AI providers and payment gateways (`httpx.AsyncClient`)
- File I/O (use `aiofiles` instead of built-in `open()`)
- Time-based delays (use `asyncio.sleep()` instead of `time.sleep()`)

```python
import asyncio
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

# Correct: async for all I/O operations
async def analyze_image(self, image_bytes: bytes) -> str:
    """Send image to AI provider and return analysis text."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            self.provider_url,
            json={"image": base64.b64encode(image_bytes).decode()},
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        response.raise_for_status()
        return response.json()["analysis"]

# Correct: async database operations
async def get_session(self, session_id: str) -> Session | None:
    result = await self.db.execute(
        select(Session).where(Session.id == session_id)
    )
    return result.scalar_one_or_none()

# Incorrect: synchronous HTTP call in async context
def analyze_image(self, image_bytes: bytes) -> str:
    response = requests.post(self.provider_url, ...)  # blocks the event loop
    return response.json()["analysis"]
```

### 1.5 Pydantic for Configuration and Schemas

All configuration values and API request/response schemas must use Pydantic models.

**Configuration (Settings):**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Values are loaded from .env file and environment variables.
    Environment variables take precedence over .env file values.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    app_env: str = "development"
    app_port: int = 8000
    database_url: str = "postgresql+asyncpg://..."
    ai_provider: str = "mock"
    payment_enabled: bool = False
    admin_pin: str = "1234"
```

**Request/Response Schemas:**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class KioskState(str, Enum):
    IDLE = "IDLE"
    PAYMENT = "PAYMENT"
    CAPTURE = "CAPTURE"
    PROCESSING = "PROCESSING"
    REVEAL = "REVEAL"
    RESET = "RESET"


class SessionResponse(BaseModel):
    id: str
    state: KioskState
    created_at: datetime
    updated_at: datetime
    analysis_text: str | None = None

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    payment_enabled: bool = Field(default=False, description="Enable payment step")
```

### 1.6 Dependency Injection via FastAPI Depends()

Services and shared resources (database sessions, configuration) are injected into route handlers using FastAPI's `Depends()` mechanism.

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.deps import get_db, get_settings, get_kiosk_service
from backend.app.services.kiosk_service import KioskService
from backend.app.schemas.session import SessionResponse

router = APIRouter()


@router.post("/session", response_model=SessionResponse, status_code=201)
async def create_session(
    kiosk_service: KioskService = Depends(get_kiosk_service),
) -> SessionResponse:
    """Create a new kiosk session."""
    session = await kiosk_service.create_session()
    return SessionResponse.model_validate(session)
```

Dependency definitions in `backend/app/api/deps.py`:

```python
from functools import lru_cache
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from backend.app.core.config import Settings
from backend.app.core.database import async_session_factory
from backend.app.services.kiosk_service import KioskService


@lru_cache
def get_settings() -> Settings:
    return Settings()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_kiosk_service(
    db: AsyncSession = Depends(get_db),
) -> KioskService:
    return KioskService(db=db)
```

### 1.7 Service Layer Pattern

Route handlers (endpoints) must never contain business logic. Routes are responsible only for:

1. Receiving and validating the request (via Pydantic schemas)
2. Calling the appropriate service method
3. Returning the response (via Pydantic response models)

All business logic lives in the service layer.

```python
# backend/app/api/v1/endpoints/kiosk.py

@router.post("/session/{session_id}/capture")
async def capture_photo(
    session_id: str,
    kiosk_service: KioskService = Depends(get_kiosk_service),
    camera_service: CameraService = Depends(get_camera_service),
) -> SessionResponse:
    # Route handler: thin, delegates to services
    image_bytes = await camera_service.capture_frame()
    session = await kiosk_service.transition_with_capture(session_id, image_bytes)
    return SessionResponse.model_validate(session)


# backend/app/services/kiosk_service.py

class KioskService:
    async def transition_with_capture(
        self, session_id: str, image_bytes: bytes
    ) -> Session:
        # Service: contains the business logic
        session = await self._get_session_or_raise(session_id)
        self._validate_transition(session.state, KioskState.CAPTURE)

        session.captured_image = image_bytes
        session.state = KioskState.CAPTURE
        session.captured_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(session)
        return session

    def _validate_transition(self, current: KioskState, target: KioskState) -> None:
        valid = VALID_TRANSITIONS.get(current, set())
        if target not in valid:
            raise InvalidStateTransition(
                f"Cannot transition from {current} to {target}"
            )
```

### 1.8 Error Handling

Custom exception classes are defined in `backend/app/core/exceptions.py`. Routes and services must never raise raw Python exceptions (ValueError, KeyError, etc.) -- they must be caught and re-raised as application-specific exceptions.

```python
# backend/app/core/exceptions.py

class VibePrintError(Exception):
    """Base exception for all VibePrint OS errors."""

    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)


class NotFoundError(VibePrintError):
    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} with id '{resource_id}' not found",
            code="NOT_FOUND",
        )


class InvalidStateTransition(VibePrintError):
    def __init__(self, message: str):
        super().__init__(message=message, code="INVALID_STATE")


class PaymentError(VibePrintError):
    def __init__(self, message: str):
        super().__init__(message=message, code="PAYMENT_ERROR")


class PrinterError(VibePrintError):
    def __init__(self, message: str):
        super().__init__(message=message, code="PRINTER_ERROR")


class AIProviderError(VibePrintError):
    def __init__(self, message: str, provider: str = "unknown"):
        super().__init__(
            message=f"AI provider '{provider}' error: {message}",
            code="AI_PROVIDER_ERROR",
        )
```

Exception handlers registered in `backend/app/core/middleware.py` convert application exceptions to consistent JSON error responses:

```python
from fastapi import Request
from fastapi.responses import JSONResponse
from backend.app.core.exceptions import VibePrintError

async def vibeprint_exception_handler(request: Request, exc: VibePrintError) -> JSONResponse:
    return JSONResponse(
        status_code=_status_code_for_code(exc.code),
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )
```

### 1.9 Logging

Use structured JSON logging with correlation IDs. Every request is assigned a unique `request_id` that is included in all log entries for that request.

```python
import structlog

logger = structlog.get_logger(__name__)

# In middleware: set up request context
structlog.contextvars.clear_contextvars()
structlog.contextvars.bind_contextvars(request_id=request_id)

# In services: structured logging with context
logger.info(
    "session_created",
    session_id=session.id,
    state=session.state,
    payment_enabled=session.payment_enabled,
)

logger.error(
    "ai_provider_failed",
    provider=provider_name,
    error=str(exc),
    attempt=attempt,
    max_retries=max_retries,
)
```

Logging configuration in `backend/app/utils/logging.py`:

```python
import structlog
import logging


def setup_logging(log_level: str = "INFO") -> None:
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(log_level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )
```

---

## 2. TypeScript (Frontend)

### 2.1 TypeScript Configuration

Strict mode is **enabled**. The `tsconfig.json` must include:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### 2.2 ESLint and Prettier

ESLint with the flat config format (`eslint.config.js`) and Prettier are used for code quality.

**ESLint configuration:**

```javascript
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
);
```

**Prettier configuration (in `package.json`):**

```json
{
  "prettier": {
    "semi": false,
    "singleQuote": true,
    "trailingComma": "all",
    "printWidth": 100,
    "tabWidth": 2
  }
}
```

### 2.3 Formatting Rules

- Indentation: **2 spaces**
- Quotes: **single quotes**
- Semicolons: **no semicolons** (Prettier `semi: false`)
- Trailing commas: **required** (`trailingComma: "all"`)
- Max line width: **100 characters**
- Files must end with a newline

### 2.4 Functional Components with Hooks Only

All React components must be functional components using hooks. Class components are prohibited.

```tsx
// Correct: functional component with hooks
import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'

interface CountdownOverlayProps {
  seconds: number
  onComplete: () => void
}

export function CountdownOverlay({ seconds, onComplete }: CountdownOverlayProps) {
  const [count, setCount] = useState(seconds)

  useEffect(() => {
    if (count <= 0) {
      onComplete()
      return
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [count, onComplete])

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.5, opacity: 0 }}
      className="flex h-full w-full items-center justify-center bg-black/50"
    >
      <span className="text-9xl font-bold text-white">{count}</span>
    </motion.div>
  )
}

// Incorrect: class component
class CountdownOverlay extends React.Component {
  // Prohibited in this project
}
```

### 2.5 State Management

**Zustand** for global client state (kiosk state machine, admin auth).

**React Query** for server state (session data, payment status, configuration).

Do not use React's built-in `useState` or `useReducer` for state that could be managed by Zustand or React Query.

```tsx
// Zustand: kiosk state machine
import { create } from 'zustand'
import type { KioskState } from '@/api/types'

interface KioskStore {
  currentState: KioskState
  sessionId: string | null
  transition: (newState: KioskState) => void
  reset: () => void
}

export const useKioskStore = create<KioskStore>((set) => ({
  currentState: 'IDLE',
  sessionId: null,
  transition: (newState) => set({ currentState: newState }),
  reset: () => set({ currentState: 'IDLE', sessionId: null }),
}))

// React Query: server state
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { kioskApi } from '@/api/kioskApi'

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => kioskApi.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const state = query.state.data?.state
      if (state === 'PAYMENT' || state === 'PROCESSING') return 3000
      return false
    },
  })
}
```

### 2.6 Animations with Framer Motion

All animations use Framer Motion's declarative API. Avoid CSS animations for complex transitions (prefer Framer Motion for anything involving enter/exit, layout changes, or gesture-driven animations).

```tsx
import { motion, AnimatePresence } from 'framer-motion'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export function RevealScreen() {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-screen flex-col items-center justify-center gap-8 p-8"
    >
      <AnimatePresence mode="wait">
        {/* Animated content here */}
      </AnimatePresence>
    </motion.div>
  )
}
```

### 2.7 shadcn/ui Components

Base UI components are installed using the shadcn/ui CLI and are copied into `frontend/src/components/ui/`. These components serve as the foundation for all UI elements.

```bash
# Install a new component
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
```

When building custom components, compose shadcn/ui primitives rather than building from raw HTML:

```tsx
// Correct: compose shadcn/ui components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ResultCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

// Avoid: raw HTML elements for complex UI
export function ResultCard({ title, description }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}
```

### 2.8 Custom Hooks

Reusable logic is extracted into custom hooks in `frontend/src/hooks/`. Hooks follow the naming convention `use<Name>`.

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'

interface UseCountdownOptions {
  initialSeconds: number
  onComplete?: () => void
  autoStart?: boolean
}

export function useCountdown({ initialSeconds, onComplete, autoStart = true }: UseCountdownOptions) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(autoStart)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!isRunning || seconds <= 0) {
      if (seconds <= 0 && isRunning) {
        setIsRunning(false)
        onCompleteRef.current?.()
      }
      return
    }

    const timer = setInterval(() => {
      setSeconds((s) => s - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning, seconds])

  const start = useCallback(() => setIsRunning(true), [])
  const reset = useCallback(() => {
    setSeconds(initialSeconds)
    setIsRunning(false)
  }, [initialSeconds])

  return { seconds, isRunning, start, reset }
}
```

---

## 3. Git

### 3.1 Conventional Commits

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. The format is:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(kiosk): add countdown overlay animation` |
| `fix` | Bug fix | `fix(printer): handle USB disconnection during print job` |
| `docs` | Documentation only | `docs(api): update payment endpoint response schema` |
| `chore` | Maintenance tasks | `chore(deps): update fastapi to 0.115.0` |
| `refactor` | Code restructuring without behavior change | `refactor(ai): extract retry logic into separate function` |
| `test` | Adding or updating tests | `test(kiosk): add integration tests for session state transitions` |
| `perf` | Performance improvement | `perf(camera): reduce MJPEG stream memory allocation` |
| `ci` | CI/CD configuration | `ci(github): add Docker build action` |

**Scopes (optional but encouraged):**

`kiosk`, `admin`, `camera`, `printer`, `ai`, `payment`, `api`, `db`, `config`, `deps`, `docker`, `frontend`, `backend`

**Examples:**

```
feat(kiosk): implement payment screen with QR code display

- Add PaymentScreen component with animated QR code
- Implement payment status polling via React Query
- Handle payment timeout after 15 minutes
- Transition to CAPTURE state on payment confirmation

Closes #42
```

```
fix(printer): retry USB connection on ENODEV error

When the thermal printer is disconnected and reconnected, the USB
device path may change. This change reinitializes the USB connection
using vendor/product ID instead of cached device path.
```

### 3.2 Branch Strategy

- The `main` branch is always deployable.
- Feature branches are created from `main` and named using the convention: `<type>/<short-description>`.
- Branch names use kebab-case.

```
feat/payment-qris-integration
fix/printer-usb-reconnection
refactor/ai-provider-abstraction
docs/api-contract-specification
```

### 3.3 Pull Request Description Template

All pull requests must include a description with the following sections:

```markdown
## What
Brief description of the changes made.

## Why
The motivation, context, or issue that these changes address.

## How
Summary of the technical approach taken.

## Testing
- [ ] Unit tests pass (`make test-backend`)
- [ ] Integration tests pass (`make test`)
- [ ] Frontend tests pass (`make test-frontend`)
- [ ] Linting passes (`make lint`)
- [ ] Manual testing performed: [describe what was tested]
- [ ] Hardware testing performed: [describe if applicable]

## Screenshots
[If applicable, add screenshots of UI changes]

## Breaking Changes
[If applicable, describe any breaking changes and migration steps]
```

---

## 4. Testing

### 4.1 Backend Testing with pytest

**Framework:** pytest with pytest-asyncio for async test support.

**Test structure:**

```
backend/tests/
|-- conftest.py              # Shared fixtures
|-- unit/                    # Fast tests, no external dependencies
|   |-- test_kiosk_service.py
|   |-- test_ai_service.py
|   |-- test_dithering.py
|   `-- ...
`-- integration/             # Tests with real database, mocked external services
    |-- test_kiosk_endpoints.py
    |-- test_payment_endpoints.py
    `-- ...
```

**Shared fixtures in `conftest.py`:**

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.app.main import app
from backend.app.core.database import Base, get_db

# Test database (in-memory SQLite for speed, or test PostgreSQL)
TEST_DATABASE_URL = "sqlite+aiosqlite:///test.db"

test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionFactory = async_sessionmaker(test_engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionFactory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def mock_ai_provider():
    return MockAIProvider(response="Test analysis result")
```

**Unit test example:**

```python
from backend.app.services.kiosk_service import KioskService
from backend.app.core.exceptions import InvalidStateTransition

class TestKioskService:
    async def test_create_session_returns_idle_state(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session()
        assert session.state == "IDLE"
        assert session.id is not None

    async def test_invalid_transition_raises_error(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session()
        with pytest.raises(InvalidStateTransition):
            await service.transition(session.id, "REVEAL")
```

**Integration test example:**

```python
class TestKioskEndpoints:
    async def test_create_session(self, client: AsyncClient):
        response = await client.post("/api/v1/kiosk/session")
        assert response.status_code == 201
        data = response.json()
        assert data["state"] == "IDLE"
        assert "id" in data

    async def test_get_session_not_found(self, client: AsyncClient):
        response = await client.get("/api/v1/kiosk/session/nonexistent-id")
        assert response.status_code == 404
```

### 4.2 Frontend Testing with Vitest

**Framework:** Vitest for unit tests, React Testing Library for component tests, MSW for API mocking.

**Test structure:**

```
frontend/src/
|-- __tests__/                # Test files colocated or in dedicated directory
|   |-- components/
|   |   |-- kiosk/
|   |   |   |-- IdleScreen.test.tsx
|   |   |   `-- CountdownOverlay.test.tsx
|   |   `-- admin/
|   |-- hooks/
|   |   |-- useCountdown.test.ts
|   |   `-- useKioskState.test.ts
|   `-- stores/
|       `-- kioskStore.test.ts
`-- ...
```

**MSW setup for API mocking:**

```typescript
// frontend/src/__tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.post('/api/v1/kiosk/session', async () => {
    return HttpResponse.json(
      { id: 'test-session-123', state: 'IDLE', created_at: '2025-01-01T00:00:00Z' },
      { status: 201 },
    )
  }),
  http.get('/api/v1/kiosk/session/:id', async ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'REVEAL',
      analysis_text: 'Your vibe is electric!',
      created_at: '2025-01-01T00:00:00Z',
    })
  }),
]
```

```typescript
// frontend/src/__tests__/setup.ts
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers'

export const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

**Component test example:**

```tsx
// IdleScreen.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { IdleScreen } from '@/components/kiosk/IdleScreen'

describe('IdleScreen', () => {
  it('renders the start button', () => {
    render(<IdleScreen onStart={vi.fn()} />)
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
  })

  it('calls onStart when the start button is clicked', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()
    render(<IdleScreen onStart={onStart />)

    await user.click(screen.getByRole('button', { name: /start/i }))
    expect(onStart).toHaveBeenCalledOnce()
  })
})
```

### 4.3 Coverage Targets

| Area | Target | Rationale |
|------|--------|-----------|
| Backend services | 80% | Services contain critical business logic (state machine, payment verification, AI orchestration) |
| Backend utilities (dithering, ESC/POS) | 90% | Pure functions that are easy to test and critical for correct hardware output |
| Backend API endpoints | 70% | Integration tests covering happy paths and major error cases |
| Frontend components (kiosk screens) | 70% | State transitions, user interactions, and animation triggers |
| Frontend hooks | 80% | Custom hooks encapsulate reusable logic and must be thoroughly tested |
| Frontend stores (Zustand) | 90% | State machine logic must have near-complete coverage |

Coverage is measured using:
- Backend: `pytest --cov=backend/app --cov-report=term-missing`
- Frontend: `vitest --coverage` (via `@vitest/coverage-v8`)

### 4.4 Test Data Management

Use factory functions for generating test data rather than hardcoded fixtures:

```python
# backend/tests/factories.py
from datetime import datetime, timezone
from backend.app.models.session import Session, KioskState
import uuid


def create_test_session(
    state: KioskState = KioskState.IDLE,
    **overrides,
) -> Session:
    """Create a Session instance for testing without persisting to database."""
    defaults = {
        "id": str(uuid.uuid4()),
        "state": state,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    defaults.update(overrides)
    return Session(**defaults)
```

```typescript
// frontend/src/__tests__/factories.ts
import type { SessionResponse } from '@/api/types'

export function createTestSession(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    id: 'test-session-' + Math.random().toString(36).slice(2),
    state: 'IDLE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    analysis_text: null,
    ...overrides,
  }
}
```
