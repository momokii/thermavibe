# Template: Adding a New Test

Checklist for writing tests in VibePrint OS.

---

## Determine the Test Type

| Type | Location | When to Use |
|------|----------|-------------|
| Unit test | `backend/tests/unit/` | Testing a single service, utility, or provider in isolation |
| Integration test | `backend/tests/integration/` | Testing an API endpoint end-to-end through the HTTP layer |
| Frontend test | `frontend/src/__tests__/` | Testing components, hooks, or stores |

---

## Backend Test Checklist

### 1. Create the Test File

- [ ] **Unit tests:** `backend/tests/unit/test_{module_name}.py`
- [ ] **Integration tests:** `backend/tests/integration/test_{flow_name}.py`

### 2. Test File Structure

```python
"""Tests for {module_name}.

Covers:
    - Happy path for {functionality}
    - Error handling for {error scenarios}
    - Edge cases for {edge cases}
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Fixtures specific to this test module here
# Shared fixtures are in tests/conftest.py


class Test{ClassName}:
    """Tests for {ClassName}."""

    async def test_happy_path(self):
        """Test the normal successful operation."""
        ...

    async def test_error_case(self):
        """Test handling of expected errors."""
        ...

    async def test_edge_case(self):
        """Test boundary or unusual conditions."""
        ...
```

### 3. Test Data

- [ ] Use factory functions or fixtures to create test data
- [ ] Never hardcode UUIDs, timestamps, or other generated values — use factories
- [ ] Define module-specific fixtures at the top of the test file
- [ ] Shared fixtures go in `tests/conftest.py`

### 4. Mocking External Dependencies

- [ ] **AI providers:** Mock with `unittest.mock.AsyncMock` — never call real AI APIs in tests
- [ ] **Payment gateways:** Mock — never create real charges
- [ ] **Camera:** Mock OpenCV `VideoCapture` — never require real hardware
- [ ] **Printer:** Mock python-escpos — never send real print jobs
- [ ] **Database:** Use the async test session from `conftest.py` (test database)
- [ ] **HTTP client:** Mock `httpx.AsyncClient` for external API calls

### 5. Test Coverage Requirements

- [ ] **Happy path:** Test the normal successful operation
- [ ] **Error cases:** Test all documented error scenarios
- [ ] **Edge cases:** Test boundary conditions (empty input, max values, null fields)
- [ ] **Validation:** Test that invalid input is rejected
- [ ] **State transitions:** If testing a state machine, test all valid and invalid transitions

### 6. Async Testing

- [ ] Use `pytest-asyncio` with `async def test_...` syntax
- [ ] All async fixtures use `@pytest_asyncio.fixture`
- [ ] Async mode is set to `auto` in `pyproject.toml` — no need for `@pytest.mark.asyncio`

### 7. Run and Verify

- [ ] Run the specific test: `cd backend && python -m pytest tests/unit/test_{module}.py -v`
- [ ] Run the full suite: `cd backend && python -m pytest tests/ -v`
- [ ] All existing tests still pass — zero regressions

---

## Frontend Test Checklist

### 1. Create the Test File

- [ ] **Component tests:** `frontend/src/__tests__/components/{ComponentName}.test.tsx`
- [ ] **Hook tests:** `frontend/src/__tests__/hooks/{hookName}.test.ts`
- [ ] **Store tests:** `frontend/src/__tests__/stores/{storeName}.test.ts`

### 2. Test File Structure

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComponentName } from '../../components/domain/ComponentName'

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />)
    expect(screen.getByText(/expected text/i)).toBeInTheDocument()
  })
})
```

### 3. API Mocking

- [ ] Use MSW (Mock Service Worker) for API mocking
- [ ] Define handlers in `frontend/src/__tests__/mocks/handlers.ts`
- [ ] Server setup in `frontend/src/__tests__/mocks/server.ts`

### 4. Run and Verify

- [ ] Run specific test: `cd frontend && npx vitest run src/__tests__/path/to/test.tsx`
- [ ] Run full suite: `cd frontend && npm test`
- [ ] All existing tests still pass — zero regressions
