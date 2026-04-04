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
