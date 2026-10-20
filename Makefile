# Perry: các lệnh tắt. Mỗi target chỉ gọi script trong scripts/ hoặc docker compose.
# Chạy `make` (hoặc `make help`) để xem danh sách.

SERVICE ?=
FILE ?=

.DEFAULT_GOAL := help
.PHONY: help setup up down restart logs ps update backup restore dev-infra dev-infra-down doctor build

help: ## Hiện danh sách lệnh
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-15s %s\n", $$1, $$2}'

setup: ## Tạo .env (hỏi token, tự sinh mật khẩu)
	./scripts/setup.sh

up: ## Build và chạy toàn bộ stack, chờ đến khi khỏe
	./scripts/deploy.sh

down: ## Dừng stack (giữ nguyên dữ liệu)
	docker compose down

restart: ## Khởi động lại các service
	docker compose restart

logs: ## Xem log (make logs SERVICE=bot)
	./scripts/logs.sh $(SERVICE)

ps: ## Trạng thái các container
	docker compose ps

update: ## Cập nhật phiên bản mới (tự sao lưu trước)
	./scripts/update.sh

backup: ## Sao lưu PostgreSQL vào backups/
	./scripts/backup.sh

restore: ## Khôi phục (make restore FILE=backups/perry-....dump)
	@test -n "$(FILE)" || { echo "Cách dùng: make restore FILE=backups/perry-YYYYmmdd-HHMMSS.dump" >&2; exit 1; }; ./scripts/restore.sh "$(FILE)"

dev-infra: ## Chạy Lavalink + Postgres + Redis cho npm run dev (chỉ 127.0.0.1)
	docker compose -f docker-compose.dev.yml --profile storage up -d

dev-infra-down: ## Dừng hạ tầng dev
	docker compose -f docker-compose.dev.yml --profile storage down

doctor: ## Chẩn đoán tình trạng triển khai
	./scripts/doctor.sh

build: ## Chỉ build image bot
	./scripts/deploy.sh --build-only
