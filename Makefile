# VibePrint OS — Common Commands
# Run `make <target>` from the repository root.

# ---- Development ----

.PHONY: dev
dev: ## Start the full development environment
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
	@echo "Backend:  http://localhost:8000"
	@echo "API Docs: http://localhost:8000/docs"
	@echo "Frontend: cd frontend && npm run dev  (http://localhost:5173)"

.PHONY: dev-down
dev-down: ## Stop the development environment
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

.PHONY: dev-logs
dev-logs: ## Tail development environment logs
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# ---- Build ----

.PHONY: build
build: ## Build production Docker images
	docker compose build

# ---- Testing ----

.PHONY: test
test: test-backend test-frontend ## Run all tests

.PHONY: test-backend
test-backend: ## Run backend tests
	docker compose exec -T app python -m pytest tests/ -v

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	cd frontend && npm test

# ---- Linting ----

.PHONY: lint
lint: lint-backend lint-frontend ## Run all linters

.PHONY: lint-backend
lint-backend: ## Lint backend Python code
	docker compose exec -T app ruff check app/ tests/

.PHONY: lint-frontend
lint-frontend: ## Lint frontend TypeScript code
	cd frontend && npm run lint

# ---- Database ----

.PHONY: migrate
migrate: ## Run database migrations
	docker compose exec -T app alembic upgrade head

.PHONY: migrate-down
migrate-down: ## Rollback last database migration
	docker compose exec -T app alembic downgrade -1

.PHONY: migrate-create
migrate-create: ## Create a new migration (usage: make migrate-create msg="description")
	docker compose exec -T app alembic revision --autogenerate -m "$(msg)"

# ---- Shell ----

.PHONY: shell-backend
shell-backend: ## Open a shell in the backend container
	docker compose exec app bash

.PHONY: shell-db
shell-db: ## Open psql shell in the database container
	docker compose exec postgres psql -U thermavibe -d thermavibe

# ---- Local Development (non-Docker) ----

.PHONY: local-backend
local-backend: ## Run backend with hot reload (no Docker)
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

.PHONY: local-migrate
local-migrate: ## Run database migrations locally
	cd backend && .venv/bin/alembic upgrade head

.PHONY: local-migrate-create
local-migrate-create: ## Create a new migration locally (usage: make local-migrate-create msg="description")
	cd backend && .venv/bin/alembic revision --autogenerate -m "$(msg)"

.PHONY: local-test
local-test: ## Run backend tests locally (no Docker)
	cd backend && .venv/bin/python -m pytest tests/ -v

.PHONY: local-lint
local-lint: ## Lint backend Python code locally (no Docker)
	cd backend && .venv/bin/ruff check app/ tests/

# ---- Utilities ----

.PHONY: logs
logs: ## Tail all container logs
	docker compose logs -f

.PHONY: clean
clean: ## Remove all Docker containers, volumes, and built artifacts
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v --rmi local
	rm -rf frontend/node_modules frontend/dist

.PHONY: help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
