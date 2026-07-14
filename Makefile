.PHONY: up down build bootstrap migrate seed test test-frontend lint typecheck e2e clean logs db-shell shell health

# Start all services
up:
	docker compose up --build -d

# Stop all services
down:
	docker compose down

# Build images only
build:
	docker compose build

# Full bootstrap: start, migrate, seed real data
bootstrap: up
	@echo "Waiting for database..."
	@sleep 5
	docker compose exec backend alembic upgrade head
	docker compose exec backend python scripts/ingest_real_data.py
	@echo "Bootstrap complete. Open http://localhost:3000"

# Run Alembic migrations
migrate:
	docker compose exec backend alembic upgrade head

# Seed real data (DB must be ready)
seed:
	docker compose exec backend python scripts/ingest_real_data.py

# Seed demo data only (DB must be ready)
seed-demo:
	docker compose exec backend python scripts/ingest_demo_data.py

# Run backend tests
test:
	docker compose exec backend pytest tests/ -v --tb=short

# Run frontend tests
test-frontend:
	npm run test

# Run backend linting
lint:
	docker compose exec backend ruff check app/ tests/ scripts/
	docker compose exec backend ruff format --check app/ tests/ scripts/

# Run type checks
typecheck:
	docker compose exec backend mypy app/
	npm run typecheck

# Run E2E tests (app must be running)
e2e:
	npm run e2e

# Clean up everything including volumes
clean:
	docker compose down -v --remove-orphans
	docker system prune -f

# View logs
logs:
	docker compose logs -f

# Open DB shell
db-shell:
	docker compose exec db psql -U postgres landscope

# Backend shell
shell:
	docker compose exec backend bash

# Check health
health:
	curl -s http://localhost:8000/health | python3 -m json.tool
	curl -s http://localhost:8000/ready | python3 -m json.tool
