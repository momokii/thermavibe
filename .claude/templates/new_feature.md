# Template: New Feature Implementation

Checklist for implementing a new feature in VibePrint OS. Follow every applicable step.

---

## Before Starting

- [ ] Task exists in `.claude/state/TASK_QUEUE.md` with clear acceptance criteria
- [ ] All task dependencies are complete
- [ ] Relevant PRD section has been read (`docs/prd/`)
- [ ] Relevant technical docs have been read (`docs/technical/`)
- [ ] Current test suite passes — run `make test` to confirm
- [ ] Active environment identified and confirmed as `development`

## Design

- [ ] Full scope defined — list every file to be created or modified
- [ ] Edge cases identified and documented before implementation begins
- [ ] Security implications assessed (consult `.claude/SECURITY_STANDARDS.md`)
- [ ] If new dependency required:
  - [ ] Vulnerability check performed: `pip audit` (backend) or `npm audit` (frontend)
  - [ ] Check logged in `.claude/state/DECISIONS_LOG.md`
  - [ ] User confirmation received
- [ ] If schema change required:
  - [ ] Proposal submitted to user and confirmed
  - [ ] New Alembic migration planned: `cd backend && alembic revision --autogenerate -m "description"`

## Implementation

### Backend (if applicable)

- [ ] New files placed in correct directories (see `.claude/CODING_STANDARDS.md`)
- [ ] Route handler registered in the correct router file
- [ ] Handler is thin: validate input -> call service -> return response
- [ ] Business logic lives in a service file, not in the route handler
- [ ] Pydantic schemas defined for request and response
- [ ] Error handling uses `VibePrintError` subclasses (never raw `Exception`)
- [ ] All functions have full type hints (arguments and return types)
- [ ] Async patterns used for all I/O operations (`AsyncSession`, `await`)

### Frontend (if applicable)

- [ ] Component placed in correct directory (`components/kiosk/`, `components/admin/`, or `components/ui/`)
- [ ] Uses shadcn/ui primitives as building blocks
- [ ] State managed in Zustand store if needed
- [ ] API calls go through `frontend/src/api/client.ts` (never directly to external services)
- [ ] TypeScript types defined matching backend schemas

### Cross-Cutting

- [ ] All code follows conventions in `.claude/CODING_STANDARDS.md`
- [ ] Error handling covers all failure paths
- [ ] Logging added at appropriate levels (no sensitive data logged)
- [ ] No secrets, tokens, or credentials hardcoded anywhere

## Security Review

- [ ] No secrets, tokens, or credentials in new code
- [ ] All external input validated at the boundary layer (`backend/app/api/v1/endpoints/`)
- [ ] Auth and permission checks enforced on protected routes (default deny)
- [ ] No sensitive data exposed in logs, error messages, or API responses
- [ ] `.env.example` updated if new environment variables were introduced
- [ ] `docs/technical/development-setup-guide.md` updated if env vars changed

## Testing

### Backend Tests
- [ ] Unit tests for new service logic: `backend/tests/unit/test_{service}.py`
- [ ] Integration tests for new endpoints: `backend/tests/integration/test_{flow}.py`
- [ ] External dependencies mocked (AI, payment, camera, printer)
- [ ] Happy path, error cases, and edge cases all covered

### Frontend Tests
- [ ] Component tests: `frontend/src/__tests__/components/{Name}.test.tsx`
- [ ] Hook tests if applicable: `frontend/src/__tests__/hooks/{hook}.test.ts`
- [ ] API mocking with MSW for component tests
- [ ] Store tests if state shape changed

### Verification
- [ ] All new tests pass
- [ ] All existing tests still pass: `make test`
- [ ] Lint clean: `make lint`

## Completion

- [ ] `.claude/state/TASK_QUEUE.md` updated — task marked DONE
- [ ] `.claude/state/CURRENT_STATUS.md` updated with session summary
- [ ] `.claude/state/DECISIONS_LOG.md` updated if significant decisions were made
- [ ] Affected documentation updated (API contract, PRD, technical docs)
