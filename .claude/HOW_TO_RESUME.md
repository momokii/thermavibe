# How to Resume — Session Protocol

Follow these steps in order every time you start a new session.

---

## Step 1: Read `.claude/README.md`

Orient yourself. Understand what this project is, the tech stack, and where to find things.

---

## Step 2: Read `.claude/state/CURRENT_STATUS.md`

Understand the exact current state:
- What is completed
- What is in progress
- What is blocked and why
- Overall project phase and completion percentage

---

## Step 3: Read `.claude/state/TASK_QUEUE.md`

Identify the next task:
- Look for the first task with status `TODO`
- Note its ID, scope, dependencies, and acceptance criteria
- If all dependencies are met, proceed
- If dependencies are incomplete, identify what needs to happen first

---

## Step 4: Read `.claude/AGENT_RULES.md`

Re-internalize all behavioral rules. There are 36 non-negotiable rules covering workflow, safety, security, environment awareness, and session management.

---

## Step 5: Read `.claude/CODING_STANDARDS.md`

Re-internalize all conventions before writing any code. Pay special attention to naming, error handling, and forbidden patterns.

---

## Step 6: Read `.claude/SECURITY_STANDARDS.md`

Re-internalize all security requirements. Check the audit findings and remediation status.

---

## Step 7: Identify the Active Environment

Check `APP_ENV` in `.env` or ask the user. Consult `.claude/ENVIRONMENT_GUIDE.md` for environment-specific behavior.

- `development` — proceed with standard workflow
- `staging` or `production` — present a written plan before executing any change

---

## Step 8: Read Task-Relevant Docs

For your task, read the corresponding section(s) in `docs/prd/`:
- `02-functional-requirements.md` — functional requirements for your module
- `04-user-flows.md` — user flows if your task involves UI or API behavior
- `05-data-models.md` — data models if your task involves database changes
- `06-integration-map.md` — integration specs if your task involves external services

And the relevant technical docs in `docs/technical/`:
- `api-contract.md` — if implementing or modifying API endpoints
- `coding-standards.md` — for code style and pattern requirements
- `testing-strategy.md` — for testing requirements
- `architecture-overview.md` — for system design context

---

## Step 9: Verify the Environment

Start the development environment:

```bash
make dev
```

This starts PostgreSQL + backend (with hot-reload) + frontend (with HMR) in Docker containers.

Verify the backend is healthy:
```bash
curl http://localhost:8000/health
```

Verify all services are running:
```bash
make dev-logs
```

You should see:
- PostgreSQL accepting connections on port 5432
- Backend uvicorn running on port 8000
- Frontend Vite dev server running on port 5173

---

## Step 10: Confirm No Regressions

Before touching any code, run the existing test suite and confirm it passes:

```bash
make test
```

Or individually:
```bash
cd backend && python -m pytest tests/ -v
cd frontend && npm test
```

If tests fail, **do not proceed** — document the failure in `.claude/state/CURRENT_STATUS.md` and ask for guidance.

---

## Step 11: Begin Work

Now you're ready. Follow these rules while working:

1. **One task at a time.** Complete the current task before starting another.
2. **Follow the layer contract.** Routes -> Services -> Models. Never skip layers.
3. **Write tests.** Every service needs unit tests. Every endpoint needs integration tests.
4. **Update state.** When done (or partially done), update `.claude/state/CURRENT_STATUS.md`:
   - Move the task to "Completed" or note progress
   - Update the "Last updated" timestamp
   - Add a session summary
5. **Update task queue.** Mark the task as `DONE` in `.claude/state/TASK_QUEUE.md`.

---

## Quick Reference: Common Commands

| Action | Command |
|--------|---------|
| Start dev environment | `make dev` |
| Stop dev environment | `make dev-down` |
| View logs | `make dev-logs` |
| Run all tests | `make test` |
| Run backend tests | `cd backend && python -m pytest tests/ -v` |
| Run frontend tests | `cd frontend && npm test` |
| Lint all code | `make lint` |
| Lint backend | `cd backend && ruff check app/ tests/` |
| Lint frontend | `cd frontend && npm run lint` |
| Type check frontend | `cd frontend && npx tsc --noEmit` |
| Run migrations | `cd backend && alembic upgrade head` |
| Create migration | `cd backend && alembic revision --autogenerate -m "description"` |
| Shell into backend | `make shell-backend` |
| Shell into database | `make shell-db` |
| Clean everything | `make clean` |
| See all commands | `make help` |
