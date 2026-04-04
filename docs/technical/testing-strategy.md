# VibePrint OS -- Testing Strategy

> This document defines the comprehensive testing strategy for VibePrint OS, covering the testing pyramid, backend and frontend testing approaches, test data management, coverage targets, CI pipeline design, and manual testing procedures for hardware-dependent features.

---

## Table of Contents

1. [Testing Pyramid](#1-testing-pyramid)
2. [Backend Testing](#2-backend-testing)
3. [Frontend Testing](#3-frontend-testing)
4. [Test Data Management](#4-test-data-management)
5. [Coverage Targets](#5-coverage-targets)
6. [CI Pipeline](#6-ci-pipeline)
7. [Manual Testing Checklist](#7-manual-testing-checklist)

---

## 1. Testing Pyramid

VibePrint OS follows the testing pyramid model, emphasizing a large base of fast unit tests, a middle layer of integration tests, and a small number of end-to-end tests.

```
            /\
           /  \
          / E2E \          Few, slow, high confidence
         /--------\        Full kiosk flow with real services
        /  Integra- \      Moderate count, medium speed
       /   tion     \      API endpoints with test database
      /--------------\
     /                \
    /    Unit Tests    \   Many, fast, focused
   /                    \  Individual functions, components, services
  /______________________\
```

### Layer Definitions

| Layer | Scope | Speed | Count | Isolation | Location |
|-------|-------|-------|-------|-----------|----------|
| **Unit** | Individual functions, methods, components | < 1ms per test | High (~70% of tests) | Full mocking | `backend/tests/unit/`, `frontend/src/__tests__/` |
| **Integration** | API endpoints, component integration | 10-100ms per test | Medium (~25% of tests) | Real DB, mocked external services | `backend/tests/integration/` |
| **E2E** | Full kiosk flow, hardware interaction | 1-10s per test | Low (~5% of tests) | Real services or manual | `tests/e2e/`, manual |

### What Gets Tested at Each Layer

**Unit Tests:**
- Service layer business logic (state machine transitions, validation rules)
- Utility functions (dithering algorithms, ESC/POS command builders, image processing)
- Pydantic schema validation
- Zustand store state transitions
- Custom hook logic (countdown timer, polling)
- Pure TypeScript utility functions

**Integration Tests:**
- API endpoint request/response contracts
- Database query correctness (real PostgreSQL or SQLite test DB)
- Error handling chains (exception raised in service, caught in middleware, returned as JSON)
- React component rendering with mock API responses
- React Query hook behavior with MSW API mocking

**End-to-End Tests:**
- Complete kiosk flow: IDLE to REVEAL to RESET
- Payment flow: QR creation, webhook callback, session transition
- Print flow: capture, AI analysis, receipt assembly, print output
- Admin flow: login, configuration change, hardware test

---

## 2. Backend Testing

### 2.1 Framework and Dependencies

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **pytest** | Test runner and assertion library | `pyproject.toml` `[tool.pytest.ini_options]` |
| **pytest-asyncio** | Async test support | `asyncio_mode = "auto"` |
| **pytest-cov** | Coverage measurement | `--cov=backend/app` |
| **httpx** | Async HTTP test client for FastAPI | `ASGITransport` |
| **factory-boy** | Test data generation (optional) | Model factories |

### 2.2 Test Database Configuration

Integration tests use a real database to ensure queries work correctly against PostgreSQL. Unit tests do not require a database (all dependencies are mocked).

Two approaches are supported:

**Option A: SQLite in-memory (fast, for CI)**

```python
# backend/tests/conftest.py
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.core.database import Base

TEST_DATABASE_URL = "sqlite+aiosqlite://"

@pytest_asyncio.fixture(scope="session")
def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()
```

**Option B: Test PostgreSQL container (accurate, for local dev)**

```yaml
# docker-compose.test.yml (separate from main compose)
services:
  test-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vibeprint_test
      POSTGRES_USER: vibeprint_test
      POSTGRES_PASSWORD: vibeprint_test
    tmpfs:
      - /var/lib/postgresql/data
```

```python
# backend/tests/conftest.py
TEST_DATABASE_URL = "postgresql+asyncpg://vibeprint_test:vibeprint_test@localhost:5433/vibeprint_test"
```

### 2.3 Test Client Fixture

The test client wraps FastAPI's ASGI app in an httpx AsyncClient, providing the same interface as a real HTTP client without needing a running server:

```python
# backend/tests/conftest.py
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.database import get_db
from backend.app.api.deps import get_db as override_get_db

@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db_session():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

    app.dependency_overrides.clear()
```

### 2.4 Mocking AI Providers

AI providers are mocked to return deterministic responses, enabling reliable assertions without network calls or API costs:

```python
# backend/tests/conftest.py
from unittest.mock import AsyncMock
from backend.app.ai.base import AIProvider
from backend.app.ai.mock_provider import MockAIProvider

@pytest.fixture
def mock_ai_provider() -> MockAIProvider:
    provider = MockAIProvider()
    provider.set_response(
        "Based on the energy in this photo, you radiate warmth and creativity."
    )
    return provider


# Override AI provider in tests
@pytest_asyncio.fixture
async def client_with_mock_ai(client: AsyncClient, mock_ai_provider: AIProvider):
    from backend.app.api.deps import get_ai_service
    from backend.app.services.ai_service import AIService

    async def override_ai_service():
        service = AIService()
        service._provider = mock_ai_provider
        return service

    app.dependency_overrides[get_ai_service] = override_ai_service
    yield client
    app.dependency_overrides.clear()
```

**MockAIProvider implementation:**

```python
# backend/app/ai/mock_provider.py
from backend.app.ai.base import AIProvider


class MockAIProvider(AIProvider):
    """Mock AI provider for testing. Returns deterministic responses."""

    def __init__(self):
        self._response = "This is a mock AI analysis response."
        self._latency_ms = 100
        self._call_count = 0
        self._should_fail = False

    def set_response(self, response: str) -> None:
        self._response = response

    def set_latency(self, latency_ms: int) -> None:
        self._latency_ms = latency_ms

    def set_should_fail(self, should_fail: bool) -> None:
        self._should_fail = should_fail

    @property
    def call_count(self) -> int:
        return self._call_count

    async def analyze_image(self, image_bytes: bytes, prompt: str) -> dict:
        self._call_count += 1

        if self._should_fail:
            raise ConnectionError("Mock AI provider is configured to fail")

        import asyncio
        await asyncio.sleep(self._latency_ms / 1000)

        return {
            "analysis_text": self._response,
            "provider": "mock",
            "model": "mock-model",
            "latency_ms": self._latency_ms,
        }
```

### 2.5 Mocking Payment Gateway

Payment providers are mocked to simulate the complete payment lifecycle (create, pending, confirmed, expired):

```python
# backend/tests/conftest.py
@pytest.fixture
def mock_payment_provider():
    provider = MockPaymentProvider()
    return provider


# backend/app/payment/mock_provider.py
class MockPaymentProvider:
    """Mock payment provider for testing. Simulates QRIS payment flow."""

    def __init__(self):
        self._auto_confirm_delay = 0  # 0 = confirm immediately on create
        self._payments: dict[str, dict] = {}

    async def create_qris(self, session_id: str, amount: int, currency: str) -> dict:
        payment_id = f"mock_pay_{session_id[:8]}"
        payment = {
            "payment_id": payment_id,
            "session_id": session_id,
            "status": "PENDING",
            "amount": amount,
            "currency": currency,
            "qr_string": f"MOCK_QR_{payment_id}",
            "qr_code_url": f"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=MOCK_QR_{payment_id}",
            "created_at": "2025-01-01T00:00:00Z",
            "expires_at": "2025-01-01T00:15:00Z",
        }
        self._payments[payment_id] = payment

        if self._auto_confirm_delay == 0:
            payment["status"] = "PAID"
            payment["paid_at"] = "2025-01-01T00:00:01Z"

        return payment

    async def verify_webhook(self, payload: dict, signature: str) -> dict:
        payment_id = payload.get("order_id", "").replace("PAY-", "")
        if payment_id in self._payments:
            self._payments[payment_id]["status"] = "PAID"
            return self._payments[payment_id]
        raise ValueError("Invalid payment reference")

    async def get_status(self, payment_id: str) -> dict:
        return self._payments.get(payment_id, {"status": "NOT_FOUND"})
```

### 2.6 Mocking the Thermal Printer

Printer tests capture the ESC/POS byte stream for assertion without requiring physical hardware:

```python
# backend/tests/conftest.py
@pytest.fixture
def mock_printer():
    printer = MockPrinter()
    return printer


# backend/tests/utils/test_print_mock.py
class MockPrinter:
    """Mock thermal printer that captures ESC/POS bytes instead of printing."""

    def __init__(self):
        self.captured_data: list[bytes] = []
        self._is_connected = True
        self._paper_ok = True

    def set_connected(self, connected: bool) -> None:
        self._is_connected = connected

    def set_paper_out(self, paper_out: bool) -> None:
        self._paper_ok = not paper_out

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def write(self, data: bytes) -> None:
        if not self._is_connected:
            raise ConnectionError("Printer not connected")
        self.captured_data.append(data)

    def text(self, text: str) -> None:
        encoded = text.encode("cp437", errors="replace")
        self.write(encoded)

    def image(self, img) -> None:
        # Capture that an image was sent (without actual dithering)
        self.write(b"[IMAGE]")

    def cut(self) -> None:
        self.write(b"\x1d\x56\x01")  # GS V 1 (partial cut)

    @property
    def all_bytes(self) -> bytes:
        return b"".join(self.captured_data)

    def reset(self) -> None:
        self.captured_data.clear()
```

**Example test using mock printer:**

```python
from backend.tests.utils.test_print_mock import MockPrinter
from backend.app.services.print_service import PrintService


class TestPrintService:
    async def test_print_receipt_includes_header_and_footer(self, mock_printer: MockPrinter):
        service = PrintService(printer=mock_printer)

        await service.print_receipt(
            title="VibePrint OS",
            body_lines=["Your vibe is electric!", "Confidence: 92%"],
            session_id="test-123",
            include_image=False,
        )

        output = mock_printer.all_bytes
        assert b"VibePrint OS" in output
        assert b"Your vibe is electric!" in output
        # Verify cut command was sent
        assert b"\x1d\x56" in output

    async def test_print_receipt_disconnected_raises_error(self, mock_printer: MockPrinter):
        mock_printer.set_connected(False)
        service = PrintService(printer=mock_printer)

        with pytest.raises(PrinterError, match="not connected"):
            await service.print_receipt(
                title="Test",
                body_lines=["Line 1"],
                session_id="test-456",
                include_image=False,
            )
```

### 2.7 Example Unit Test: Kiosk Service

```python
# backend/tests/unit/test_kiosk_service.py
import pytest
from backend.app.services.kiosk_service import KioskService, VALID_TRANSITIONS
from backend.app.core.exceptions import InvalidStateTransition, SessionNotFoundError


class TestKioskServiceCreate:
    async def test_create_session_returns_idle_state(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session(payment_enabled=False)

        assert session.id is not None
        assert session.state == "IDLE"
        assert session.payment_enabled is False

    async def test_create_session_with_payment_enabled(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session(payment_enabled=True)

        assert session.payment_enabled is True
        assert session.state == "IDLE"


class TestKioskServiceTransition:
    async def test_valid_transition_succeeds(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session()

        updated = await service.transition(session.id, "CAPTURE")
        assert updated.state == "CAPTURE"

    async def test_invalid_transition_raises_error(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session()

        with pytest.raises(InvalidStateTransition, match="Cannot transition from IDLE to REVEAL"):
            await service.transition(session.id, "REVEAL")

    async def test_transition_nonexistent_session_raises_error(self, db_session):
        service = KioskService(db=db_session)

        with pytest.raises(SessionNotFoundError):
            await service.transition("nonexistent-id", "CAPTURE")


class TestKioskServiceReset:
    async def test_reset_clears_session_data(self, db_session):
        service = KioskService(db=db_session)
        session = await service.create_session()
        await service.transition(session.id, "CAPTURE")

        await service.reset_session(session.id)

        # Verify session was returned to IDLE
        updated = await service.get_session(session.id)
        assert updated.state == "IDLE"
```

### 2.8 Example Integration Test: API Endpoints

```python
# backend/tests/integration/test_kiosk_endpoints.py
import pytest


class TestCreateSessionEndpoint:
    async def test_create_session_returns_201(self, client):
        response = await client.post("/api/v1/kiosk/session", json={})

        assert response.status_code == 201
        data = response.json()
        assert data["state"] == "IDLE"
        assert "id" in data
        assert "created_at" in data

    async def test_create_session_with_payment_enabled(self, client):
        response = await client.post(
            "/api/v1/kiosk/session",
            json={"payment_enabled": True},
        )

        assert response.status_code == 201
        assert response.json()["payment_enabled"] is True


class TestGetSessionEndpoint:
    async def test_get_existing_session(self, client):
        # Create a session first
        create_response = await client.post("/api/v1/kiosk/session", json={})
        session_id = create_response.json()["id"]

        # Get the session
        response = await client.get(f"/api/v1/kiosk/session/{session_id}")

        assert response.status_code == 200
        assert response.json()["id"] == session_id

    async def test_get_nonexistent_session_returns_404(self, client):
        response = await client.get("/api/v1/kiosk/session/nonexistent-id")

        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"


class TestCaptureEndpoint:
    async def test_capture_valid_transition(self, client):
        # Create session
        create_response = await client.post("/api/v1/kiosk/session", json={})
        session_id = create_response.json()["id"]

        # Trigger capture (requires mocked camera)
        response = await client.post(f"/api/v1/kiosk/session/{session_id}/capture")

        assert response.status_code == 200
        assert response.json()["state"] == "PROCESSING"

    async def test_capture_from_idle_returns_409(self, client):
        create_response = await client.post("/api/v1/kiosk/session", json={})
        session_id = create_response.json()["id"]

        # Cannot capture from IDLE state (must be in CAPTURE state)
        # This test depends on the state machine implementation
```

---

## 3. Frontend Testing

### 3.1 Framework and Dependencies

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Vitest** | Test runner (Vite-native) | `vitest.config.ts` |
| **React Testing Library** | Component rendering and interaction | `@testing-library/react` |
| **userEvent** | Simulate user interactions (click, type, touch) | `@testing-library/user-event` |
| **MSW** | API request mocking | `msw` (browser + node) |
| **jsdom** | DOM implementation for tests | Built into Vitest |

### 3.2 Vitest Configuration

```typescript
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts', 'src/main.tsx'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 3.3 MSW Setup

Mock Service Worker intercepts API requests at the network level, providing realistic API mocking without modifying component code:

```typescript
// frontend/src/__tests__/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest'
import { setupServer } from 'msw/node'
import { handlers } from './mocks/handlers'

export const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```typescript
// frontend/src/__tests__/mocks/handlers.ts
import { http, HttpResponse, delay } from 'msw'

export const handlers = [
  // Kiosk session endpoints
  http.post('/api/v1/kiosk/session', async ({ request }) => {
    const body = await request.json() as { payment_enabled?: boolean }
    return HttpResponse.json(
      {
        id: 'test-session-mock-id',
        state: 'IDLE',
        payment_enabled: body.payment_enabled ?? false,
        payment_status: null,
        captured_at: null,
        analysis_text: null,
        analysis_provider: null,
        printed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
      { status: 201 },
    )
  }),

  http.get('/api/v1/kiosk/session/:id', async ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'REVEAL',
      payment_enabled: false,
      payment_status: null,
      captured_at: new Date(Date.now() - 60000).toISOString(),
      analysis_text: 'Your energy radiates confidence and warmth!',
      analysis_provider: 'openai',
      printed_at: null,
      created_at: new Date(Date.now() - 120000).toISOString(),
      updated_at: new Date(Date.now() - 10000).toISOString(),
      expires_at: new Date(Date.now() + 3540000).toISOString(),
    })
  }),

  http.post('/api/v1/kiosk/session/:id/capture', async ({ params }) => {
    await delay(100) // Simulate capture delay
    return HttpResponse.json({
      id: params.id,
      state: 'PROCESSING',
      captured_at: new Date().toISOString(),
    })
  }),

  http.post('/api/v1/kiosk/session/:id/print', async ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      state: 'REVEAL',
      printed_at: new Date().toISOString(),
      print_success: true,
    })
  }),

  // Payment endpoints
  http.post('/api/v1/payment/create-qr', async () => {
    return HttpResponse.json(
      {
        payment_id: 'mock-pay-123',
        session_id: 'test-session-mock-id',
        status: 'PENDING',
        amount: 10000,
        currency: 'IDR',
        qr_code_url: 'https://example.com/qr-test.png',
        expires_at: new Date(Date.now() + 900000).toISOString(),
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    )
  }),

  http.get('/api/v1/payment/status/:sessionId', async ({ params }) => {
    return HttpResponse.json({
      payment_id: 'mock-pay-123',
      session_id: params.sessionId,
      status: 'PAID',
      amount: 10000,
      paid_at: new Date().toISOString(),
    })
  }),

  // Admin endpoints
  http.post('/api/v1/admin/login', async ({ request }) => {
    const body = await request.json() as { pin: string }
    if (body.pin === '1234') {
      return HttpResponse.json({
        token: 'mock-jwt-token-for-testing',
        token_type: 'Bearer',
        expires_in: 86400,
      })
    }
    return HttpResponse.json(
      { error: { code: 'AUTH_INVALID_PIN', message: 'Invalid PIN' } },
      { status: 401 },
    )
  }),
]
```

### 3.4 Component Testing

Components are tested using React Testing Library, which emphasizes testing user behavior over implementation details:

```tsx
// frontend/src/__tests__/components/kiosk/IdleScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IdleScreen } from '@/components/kiosk/IdleScreen'

describe('IdleScreen', () => {
  const mockOnStart = vi.fn()

  beforeEach(() => {
    mockOnStart.mockClear()
  })

  it('renders the welcome message', () => {
    render(<IdleScreen onStart={mockOnStart} />)
    expect(screen.getByText(/strike a pose/i)).toBeInTheDocument()
  })

  it('renders the start button', () => {
    render(<IdleScreen onStart={mockOnStart} />)
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
  })

  it('calls onStart when the start button is clicked', async () => {
    const user = userEvent.setup()
    render(<IdleScreen onStart={mockOnStart} />)

    await user.click(screen.getByRole('button', { name: /start/i }))

    expect(mockOnStart).toHaveBeenCalledOnce()
  })

  it('does not call onStart on double-click (debounced)', async () => {
    const user = userEvent.setup()
    render(<IdleScreen onStart={mockOnStart} />)

    const button = screen.getByRole('button', { name: /start/i })
    await user.dblClick(button)

    expect(mockOnStart).toHaveBeenCalledOnce()
  })

  it('displays payment information when payment is enabled', () => {
    render(<IdleScreen onStart={mockOnStart} paymentEnabled={true} paymentAmount={10000} />)
    expect(screen.getByText(/rp 10\.000/i)).toBeInTheDocument()
  })
})
```

```tsx
// frontend/src/__tests__/components/kiosk/RevealScreen.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RevealScreen } from '@/components/kiosk/RevealScreen'

describe('RevealScreen', () => {
  it('displays the analysis text', () => {
    render(
      <RevealScreen
        analysisText="Your vibe is electric and full of energy!"
        onPrint={vi.fn()}
        onFinish={vi.fn()}
        imageAvailable={true}
      />,
    )

    expect(screen.getByText(/your vibe is electric/i)).toBeInTheDocument()
  })

  it('calls onPrint when print button is clicked', async () => {
    const mockOnPrint = vi.fn()
    const user = userEvent.setup()

    render(
      <RevealScreen
        analysisText="Test analysis"
        onPrint={mockOnPrint}
        onFinish={vi.fn()}
        imageAvailable={true}
      />,
    )

    await user.click(screen.getByRole('button', { name: /print/i }))
    expect(mockOnPrint).toHaveBeenCalledOnce()
  })

  it('calls onFinish when finish button is clicked', async () => {
    const mockOnFinish = vi.fn()
    const user = userEvent.setup()

    render(
      <RevealScreen
        analysisText="Test analysis"
        onPrint={vi.fn()}
        onFinish={mockOnFinish}
        imageAvailable={false}
      />,
    )

    await user.click(screen.getByRole('button', { name: /finish|done/i }))
    expect(mockOnFinish).toHaveBeenCalledOnce()
  })

  it('shows print button only when image is available', () => {
    const { rerender } = render(
      <RevealScreen
        analysisText="Test"
        onPrint={vi.fn()}
        onFinish={vi.fn()}
        imageAvailable={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument()

    rerender(
      <RevealScreen
        analysisText="Test"
        onPrint={vi.fn()}
        onFinish={vi.fn()}
        imageAvailable={true}
      />,
    )

    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
  })
})
```

### 3.5 Hook Testing

Custom hooks are tested using `renderHook` from React Testing Library:

```tsx
// frontend/src/__tests__/hooks/useCountdown.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with the initial seconds value', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialSeconds: 10, autoStart: false }),
    )

    expect(result.current.seconds).toBe(10)
    expect(result.current.isRunning).toBe(false)
  })

  it('counts down when started', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialSeconds: 3, autoStart: false }),
    )

    act(() => {
      result.current.start()
    })
    expect(result.current.isRunning).toBe(true)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.seconds).toBe(2)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.seconds).toBe(1)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.seconds).toBe(0)
    expect(result.current.isRunning).toBe(false)
  })

  it('calls onComplete when countdown reaches zero', () => {
    const onComplete = vi.fn()
    renderHook(() =>
      useCountdown({ initialSeconds: 1, onComplete, autoStart: true }),
    )

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('resets to initial value', () => {
    const { result } = renderHook(() =>
      useCountdown({ initialSeconds: 5, autoStart: true }),
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.seconds).toBe(2)

    act(() => {
      result.current.reset()
    })
    expect(result.current.seconds).toBe(5)
    expect(result.current.isRunning).toBe(false)
  })
})
```

### 3.6 Store Testing (Zustand)

```tsx
// frontend/src/__tests__/stores/kioskStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useKioskStore } from '@/stores/kioskStore'

describe('kioskStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useKioskStore.getState().reset()
  })

  it('initializes with IDLE state', () => {
    const state = useKioskStore.getState()
    expect(state.currentState).toBe('IDLE')
    expect(state.sessionId).toBeNull()
  })

  it('transitions to PAYMENT state', () => {
    const store = useKioskStore.getState()
    store.transition('PAYMENT')
    expect(useKioskStore.getState().currentState).toBe('PAYMENT')
  })

  it('transitions through complete flow', () => {
    const store = useKioskStore.getState()

    store.transition('PAYMENT')
    expect(useKioskStore.getState().currentState).toBe('PAYMENT')

    store.transition('CAPTURE')
    expect(useKioskStore.getState().currentState).toBe('CAPTURE')

    store.transition('PROCESSING')
    expect(useKioskStore.getState().currentState).toBe('PROCESSING')

    store.transition('REVEAL')
    expect(useKioskStore.getState().currentState).toBe('REVEAL')

    store.transition('RESET')
    expect(useKioskStore.getState().currentState).toBe('IDLE')
  })

  it('sets session ID', () => {
    const store = useKioskStore.getState()
    store.setSessionId('test-session-123')
    expect(useKioskStore.getState().sessionId).toBe('test-session-123')
  })

  it('resets to initial state', () => {
    const store = useKioskStore.getState()
    store.transition('CAPTURE')
    store.setSessionId('test-session-456')
    store.setAnalysisText('Test analysis')

    store.reset()

    const state = useKioskStore.getState()
    expect(state.currentState).toBe('IDLE')
    expect(state.sessionId).toBeNull()
    expect(state.analysisText).toBeNull()
  })
})
```

---

## 4. Test Data Management

### 4.1 Factory Pattern (Backend)

Use factory functions to generate test data with sensible defaults and easy customization:

```python
# backend/tests/factories.py
import uuid
from datetime import datetime, timezone, timedelta
from backend.app.models.session import Session
from backend.app.models.payment import Payment
from backend.app.models.config import Config


def create_test_session(
    state: str = "IDLE",
    session_id: str | None = None,
    payment_enabled: bool = False,
    created_at: datetime | None = None,
    **overrides,
) -> Session:
    """Create a Session instance for testing without persisting to the database."""
    now = created_at or datetime.now(timezone.utc)
    defaults = {
        "id": session_id or str(uuid.uuid4()),
        "state": state,
        "payment_enabled": payment_enabled,
        "payment_status": None,
        "captured_at": now + timedelta(seconds=15) if state in ("CAPTURE", "PROCESSING", "REVEAL") else None,
        "analysis_text": "Test analysis text" if state in ("REVEAL",) else None,
        "analysis_provider": "mock" if state in ("REVEAL",) else None,
        "printed_at": now + timedelta(seconds=30) if state == "REVEAL" and overrides.get("print_success") else None,
        "created_at": now,
        "updated_at": now,
        "expires_at": now + timedelta(hours=1),
    }
    defaults.update(overrides)
    return Session(**defaults)


def create_test_payment(
    session_id: str | None = None,
    status: str = "PENDING",
    amount: int = 10000,
    **overrides,
) -> Payment:
    """Create a Payment instance for testing."""
    now = datetime.now(timezone.utc)
    defaults = {
        "id": str(uuid.uuid4()),
        "session_id": session_id or str(uuid.uuid4()),
        "provider": "mock",
        "amount": amount,
        "currency": "IDR",
        "status": status,
        "external_transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "created_at": now,
        "paid_at": now + timedelta(seconds=5) if status == "PAID" else None,
        "expires_at": now + timedelta(minutes=15),
    }
    defaults.update(overrides)
    return Payment(**defaults)
```

### 4.2 Factory Functions (Frontend)

```typescript
// frontend/src/__tests__/factories.ts
import type { SessionResponse, PaymentStatusResponse, DeviceInfo } from '@/api/types'

let counter = 0

function uniqueId(): string {
  counter++
  return `test-${Date.now()}-${counter}`
}

export function createTestSession(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    id: uniqueId(),
    state: 'IDLE',
    payment_enabled: false,
    payment_status: null,
    captured_at: null,
    analysis_text: null,
    analysis_provider: null,
    printed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    ...overrides,
  }
}

export function createTestPaymentStatus(overrides: Partial<PaymentStatusResponse> = {}): PaymentStatusResponse {
  return {
    payment_id: uniqueId(),
    session_id: uniqueId(),
    provider: 'mock',
    amount: 10000,
    currency: 'IDR',
    status: 'PENDING',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900000).toISOString(),
    ...overrides,
  }
}
```

### 4.3 Seed Data

For integration tests that require pre-populated data (e.g., analytics queries, configuration reads), seed data fixtures are provided:

```python
# backend/tests/seed.py
from backend.tests.factories import create_test_session, create_test_payment


def seed_sessions(db, count: int = 10, state: str = "REVEAL"):
    """Insert test sessions into the database."""
    for i in range(count):
        session = create_test_session(
            state=state,
            created_at=datetime.now(timezone.utc) - timedelta(hours=i),
        )
        db.add(session)
    db.commit()


def seed_payments(db, session_count: int = 10, paid_ratio: float = 0.9):
    """Insert test payment records."""
    for i in range(session_count):
        status = "PAID" if i / session_count < paid_ratio else "PENDING"
        payment = create_test_payment(
            status=status,
            amount=10000,
            created_at=datetime.now(timezone.utc) - timedelta(hours=i),
        )
        db.add(payment)
    db.commit()
```

---

## 5. Coverage Targets

### Coverage Requirements

| Area | Target | Rationale |
|------|--------|-----------|
| Backend services (`backend/app/services/`) | 80% | Core business logic: state machine, payment verification, AI orchestration |
| Backend utilities (`backend/app/utils/`) | 90% | Pure functions (dithering, ESC/POS, image processing) are easy to test comprehensively |
| Backend API endpoints (`backend/app/api/`) | 70% | Integration tests covering request validation, response format, error handling |
| Backend AI providers (`backend/app/ai/`) | 80% | Provider implementations must handle various response formats and errors |
| Backend payment providers (`backend/app/payment/`) | 80% | Payment logic must be reliable: signature verification, status mapping, error handling |
| Backend models and schemas (`backend/app/models/`, `backend/app/schemas/`) | 60% | Mostly declarative; validated indirectly through service and endpoint tests |
| Frontend kiosk components (`components/kiosk/`) | 70% | State transitions, user interactions, conditional rendering |
| Frontend admin components (`components/admin/`) | 60% | CRUD operations, form validation |
| Frontend hooks (`hooks/`) | 80% | Custom hooks encapsulate reusable logic and must handle edge cases |
| Frontend stores (`stores/`) | 90% | State machine logic is critical for correct kiosk flow |
| Frontend API client (`api/`) | 50% | Thin wrappers around HTTP calls; validated through integration tests |

### Running Coverage Reports

**Backend:**
```bash
# Terminal report
docker compose exec backend python -m pytest tests/ \
    --cov=backend/app \
    --cov-report=term-missing \
    --cov-report=html

# HTML report opens in backend/htmlcov/index.html
```

**Frontend:**
```bash
cd frontend
npx vitest run --coverage
# HTML report opens in frontend/coverage/index.html
```

### Coverage Exclusions

The following files are excluded from coverage tracking because they contain configuration, initialization code, or generated code:

- `backend/app/main.py` (application factory, side effects)
- `backend/app/core/database.py` (engine setup)
- `backend/app/core/config.py` (settings class, read from env)
- `backend/alembic/` (generated migration files)
- `frontend/src/main.tsx` (entry point, side effects)
- `frontend/src/vite-env.d.ts` (type declarations)
- `frontend/src/components/ui/` (third-party shadcn/ui components)
- `frontend/src/lib/utils.ts` (shadcn/ui utility, `cn` function)

---

## 6. CI Pipeline

### GitHub Actions Workflow

The following workflow runs on every push and pull request to the `main` branch:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-backend:
    name: Lint Backend (Ruff)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: pip install ruff
      - name: Check formatting
        run: ruff format --check backend/
      - name: Check linting
        run: ruff check backend/

  lint-frontend:
    name: Lint Frontend (ESLint + TypeScript)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Type check
        run: cd frontend && npx tsc --noEmit
      - name: Lint
        run: cd frontend && npx eslint src/

  test-backend:
    name: Test Backend
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: vibeprint_test
          POSTGRES_USER: vibeprint_test
          POSTGRES_PASSWORD: vibeprint_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install dependencies
        run: |
          pip install -r backend/requirements/production.txt
          pip install -r backend/requirements/development.txt
      - name: Run migrations
        env:
          DATABASE_URL: postgresql+asyncpg://vibeprint_test:vibeprint_test@localhost:5432/vibeprint_test
        run: cd backend && alembic upgrade head
      - name: Run tests with coverage
        env:
          DATABASE_URL: postgresql+asyncpg://vibeprint_test:vibeprint_test@localhost:5432/vibeprint_test
          AI_PROVIDER: mock
          APP_SECRET_KEY: test-secret-key
          ADMIN_PIN: 1234
        run: |
          cd backend
          python -m pytest tests/ -v \
            --cov=backend/app \
            --cov-report=term-missing \
            --cov-report=xml:coverage.xml
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage
          path: backend/coverage.xml

  test-frontend:
    name: Test Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Run tests with coverage
        run: cd frontend && npx vitest run --coverage
      - name: Upload coverage
        uses: actions/upload-artifact@v4
        with:
          name: frontend-coverage
          path: frontend/coverage/

  build-docker:
    name: Build Docker Image
    runs-on: ubuntu-latest
    needs: [lint-backend, lint-frontend, test-backend, test-frontend]
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile
          push: false
          tags: vibeprint-os:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Pipeline Flow

```
Push to main / Pull Request
    |
    +---> lint-backend (Ruff: format + check)
    +---> lint-frontend (ESLint + TypeScript)
    |
    +---> test-backend (pytest + coverage)
    |         |
    |         +---> PostgreSQL service container
    |         +---> Runs migrations
    |         +---> Runs unit + integration tests
    |
    +---> test-frontend (Vitest + coverage)
    |
    +---> build-docker (only if all above pass)
              |
              +---> Multi-stage Docker build
              +---> Validates production image builds
```

---

## 7. Manual Testing Checklist

Hardware-dependent features cannot be fully tested in CI. The following checklist must be completed manually when setting up a new kiosk machine or after significant changes to hardware integration code.

### Thermal Printer

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|----------------|
| 1 | Printer connection | Connect printer via USB, check `GET /api/v1/print/status` | `connected: true`, correct vendor/model displayed |
| 2 | Test receipt | Call `POST /api/v1/print/test` | Physical receipt prints with test content |
| 3 | Text alignment | Print a receipt with long text, short text, and special characters | Text is word-wrapped correctly within paper width |
| 4 | Image quality | Print a receipt with photo thumbnail | Dithered image is recognizable, no vertical line artifacts |
| 5 | Paper cutting | Print any receipt | Paper is cut cleanly at the end |
| 6 | Paper out | Remove paper, attempt to print | Error is caught, `paper_ok: false` reported |
| 7 | Reconnection | Disconnect USB, reconnect, attempt to print | Printer is re-detected, print succeeds |
| 8 | Multiple prints | Print 10 receipts in succession | All receipts print without USB timeout or buffer overflow |
| 9 | Non-Latin characters | Print receipt with emoji or non-ASCII text | Characters render correctly (or fallback glyph) |
| 10 | Speed | Measure time from `POST` to paper cut | Print completes within 5 seconds |

### Camera

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|----------------|
| 1 | Camera detection | Connect camera via USB, call `GET /api/v1/camera/devices` | Camera appears in device list with correct name |
| 2 | MJPEG stream | Open `GET /api/v1/camera/stream` in browser | Live video stream displays with minimal latency (< 200ms) |
| 3 | Stream quality | Observe stream at configured resolution (1280x720) | Image is clear, not pixelated or compressed |
| 4 | Photo capture | Call `POST /api/v1/admin/hardware/camera/test` | Returns a JPEG image of acceptable quality |
| 5 | Framing | Position subject 1-2 meters from camera, capture photo | Subject is well-framed (head and upper body visible) |
| 6 | Lighting | Test under various lighting conditions (bright, dim, backlight) | Image is usable under normal indoor lighting |
| 7 | Camera switch | Connect second camera, call `POST /api/v1/camera/select` | Stream switches to the selected camera |
| 8 | Reconnection | Disconnect USB, reconnect, attempt capture | Camera is re-detected, capture succeeds |
| 9 | Timeout | Disconnect camera, trigger capture via kiosk flow | Error handled gracefully, user sees error message |
| 10 | Performance | Observe CPU/memory during streaming | System remains responsive, no memory leaks |

### Payment Flow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|----------------|
| 1 | QR code generation | Start session with payment enabled | QRIS QR code is displayed, scannable by payment app |
| 2 | Successful payment | Scan QR code, complete payment | Webhook received, session transitions to CAPTURE |
| 3 | Payment timeout | Display QR code, wait 15 minutes | Session returns to IDLE with "expired" message |
| 4 | Payment cancellation | User taps "Cancel" during payment | Session returns to IDLE, payment record marked cancelled |
| 5 | Polling fallback | Complete payment but block webhook | Polling detects payment and transitions session |
| 6 | Invalid webhook | Send malformed webhook to `POST /api/v1/payment/webhook/midtrans` | Returns 400, does not modify payment status |
| 7 | Duplicate webhook | Send same webhook twice | Second request is idempotent, no duplicate processing |
| 8 | Wrong amount | Pay different amount than QR code specifies | Payment gateway handles (Midtrans rejects mismatched amounts) |

### Kiosk Mode

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|----------------|
| 1 | Fullscreen | Launch Chromium in kiosk mode | No address bar, tabs, or system UI visible |
| 2 | Shortcut blocking | Press Ctrl+Q, Alt+F4, F11, Ctrl+W, Alt+Tab | No browser response (shortcuts are blocked) |
| 3 | Right-click blocking | Right-click on the kiosk UI | No context menu appears |
| 4 | Text selection | Attempt to drag-select text on the screen | Text selection is disabled |
| 5 | Zoom blocking | Attempt Ctrl+/- zoom gestures | No zoom change |
| 6 | URL bar | Attempt any method to access URL bar | URL bar is not accessible |
| 7 | Auto-restart | Kill Chromium process | systemd restarts Chromium automatically within 5 seconds |
| 8 | Boot startup | Reboot the kiosk machine | X11 starts, auto-login occurs, Chromium launches in kiosk mode |
| 9 | Touch responsiveness | Tap buttons on the kiosk UI | Buttons respond within 100ms of touch |
| 10 | Display resolution | Check display at 1080p, 4K | UI renders correctly, no layout breaks |

### Complete Kiosk Flow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|----------------|
| 1 | Full flow (no payment) | IDLE -> Start -> CAPTURE -> PROCESSING -> REVEAL -> Print -> RESET -> IDLE | Complete flow with no errors |
| 2 | Full flow (with payment) | IDLE -> Start -> PAYMENT -> scan QR -> CAPTURE -> PROCESSING -> REVEAL -> Print -> RESET -> IDLE | Complete flow with payment step |
| 3 | AI timeout | CAPTURE -> PROCESSING (AI takes > 30s) | Fallback text displayed, flow continues to REVEAL |
| 4 | AI error | CAPTURE -> PROCESSING (AI returns error) | Fallback text displayed, flow continues to REVEAL |
| 5 | Printer error during print | REVEAL -> tap Print -> printer disconnected | Error message shown, retry option offered |
| 6 | Camera error during capture | CAPTURE -> camera disconnected | Error message shown, return to IDLE |
| 7 | Inactivity timeout | REVEAL -> wait 30 seconds | Auto-transition to RESET -> IDLE |
| 8 | Multiple sessions | Complete 3 consecutive sessions | Each session completes independently, no state leakage |
| 9 | Admin unlock | While in IDLE, enter admin PIN | Switches to admin dashboard at /admin |
| 10 | Admin return | Exit admin dashboard | Returns to IDLE screen |

### Reporting Manual Test Results

When completing manual testing, record results in a structured format:

```
Manual Test Report - 2025-06-15
Kiosk Machine: kiosk-01
Tester: Operator Name

[PASS] Printer connection detected correctly
[FAIL] Image quality on 58mm paper - dithering too dark
[PASS] MJPEG stream latency < 200ms
[WARN] Camera reconnection takes 8 seconds
[PASS] Complete kiosk flow (no payment) - 3/3 sessions successful
[SKIP] Payment flow - no QRIS testing available today

Issues:
1. (Bug) Dithering algorithm produces too-dark output on 58mm paper.
   Workaround: Use 80mm paper or reduce dithering contrast.
   Ticket: #123
```
