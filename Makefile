# Perry: shortcut commands. Every target only calls a script in scripts/ or docker compose.
# Run `make` (or `make help`) to see the list.

SERVICE ?=
FILE ?=

.DEFAULT_GOAL := help
.PHONY: help setup up down restart logs ps update backup restore dev-infra dev-infra-down doctor build

help: ## Show the list of commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-15s %s\n", $$1, $$2}'

setup: ## Create .env (asks for the token, generates passwords)
	./scripts/setup.sh

up: ## Build and start the whole stack, wait until healthy
	./scripts/deploy.sh

down: ## Stop the stack (data is kept)
	docker compose down

restart: ## Restart the services
	docker compose restart

logs: ## Show logs (make logs SERVICE=bot)
	./scripts/logs.sh $(SERVICE)

ps: ## Container status
	docker compose ps

update: ## Update to a new version (backs up first)
	./scripts/update.sh

backup: ## Back up PostgreSQL to backups/
	./scripts/backup.sh

restore: ## Restore (make restore FILE=backups/perry-....dump)
	@test -n "$(FILE)" || { echo "Usage: make restore FILE=backups/perry-YYYYmmdd-HHMMSS.dump" >&2; exit 1; }; ./scripts/restore.sh "$(FILE)"

dev-infra: ## Start Lavalink + Postgres + Redis for npm run dev (127.0.0.1 only)
	docker compose -f docker-compose.dev.yml --profile storage up -d

dev-infra-down: ## Stop the dev infrastructure
	docker compose -f docker-compose.dev.yml --profile storage down

doctor: ## Diagnose the deployment
	./scripts/doctor.sh

build: ## Only build the bot image
	./scripts/deploy.sh --build-only
