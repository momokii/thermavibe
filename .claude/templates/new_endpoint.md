# Template: Adding a New API Endpoint

Checklist for implementing a new API endpoint in VibePrint OS.

---

## Pre-Implementation

- [ ] **Check the API contract.** Read `docs/technical/api-contract.md` to see if this endpoint is already specified. If yes, implement as specified.
- [ ] **Check the PRD.** Read the relevant section of `docs/prd/02-functional-requirements.md` for requirements.
- [ ] **If not specified in either,** ask the user before proceeding. Do not invent endpoints.

---

## Implementation Checklist

### 1. Define the Route

File: `backend/app/api/v1/endpoints/{domain}.py`

- [ ] Create route handler with proper HTTP method and path
- [ ] Add route to the domain router (or create new router file)
- [ ] Ensure router is included in `backend/app/api/v1/router.py`

### 2. Create Pydantic Schemas

File: `backend/app/schemas/{domain}.py`

- [ ] Define request schema (input validation)
- [ ] Define response schema (output shape)
- [ ] Add JSDoc-style docstrings to all schema classes
- [ ] Follow existing schema patterns in `backend/app/schemas/`

### 3. Implement the Handler

- [ ] Handler should be thin: validate input -> call service -> return response
- [ ] Use dependency injection for DB session (`get_db` from `api/deps.py`)
- [ ] Use proper HTTP status codes (201 for creation, 200 for OK, etc.)
- [ ] Return response in the standard envelope format:
  ```json
  {
    "data": { ... },
    "meta": { "request_id": "...", "timestamp": "..." }
  }
  ```

### 4. Add Authentication (if admin endpoint)

- [ ] Use `get_current_admin` dependency for admin-only endpoints
- [ ] Verify PIN/JWT token is checked before processing

### 5. Error Handling

- [ ] Use specific `VibePrintError` subclasses (never raw `Exception`)
- [ ] Return error envelope format:
  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human-readable message",
      "request_id": "..."
    }
  }
  ```
- [ ] Handle all error cases documented in the API contract
- [ ] Log errors with structured logging before raising

### 6. Service Layer

- [ ] Business logic lives in the corresponding service file
- [ ] Service receives `AsyncSession` via dependency injection
- [ ] Service handles all business rules and validation
- [ ] Service returns domain objects (not HTTP responses)

---

## Post-Implementation

### 7. Write Tests

- [ ] **Unit test** for the service method in `backend/tests/unit/test_{service_name}.py`
  - Test happy path
  - Test all error cases
  - Mock external dependencies (AI, payment, camera, printer)
- [ ] **Integration test** for the endpoint in `backend/tests/integration/test_{endpoint_name}.py`
  - Test HTTP method, path, status codes
  - Test request/response shape matches schemas
  - Test authentication/authorization if applicable

### 8. Update Documentation

- [ ] Update `docs/technical/api-contract.md` if the API contract changed
- [ ] Update `.env.example` if new configuration was added (also update `docs/technical/development-setup-guide.md`)
- [ ] Update `docs/prd/` if requirements changed

### 9. Verify

- [ ] Run `cd backend && ruff check app/ tests/` — zero lint errors
- [ ] Run `cd backend && python -m pytest tests/ -v` — all tests pass (including existing)
- [ ] Run `make lint` — no regressions
