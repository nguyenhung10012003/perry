#!/usr/bin/env bash
# Perry: read-only health report of the deployment. Prints names and states, never secret values.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/doctor.sh

Kiểm tra (chỉ đọc) Docker, tệp .env (chỉ in TÊN biến, không in giá trị), trạng thái các
container, Lavalink + plugin, PostgreSQL + migration, Redis, bot và cổng đã publish.
Chạy được cả khi stack đang dừng. In bảng PASS / FAIL / WARN / SKIP.

Mã thoát: 0 không có lỗi nặng (có thể còn cảnh báo), 1 có ít nhất một lỗi.
EOF
}

case "${1:-}" in
  '') ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    err "Tham số không hợp lệ: $1"
    usage >&2
    exit 2
    ;;
esac

FAILS=0
WARNS=0

# row STATUS LABEL DETAIL   (STATUS: PASS | FAIL | WARN | SKIP)
# Tags and labels are ASCII so the columns line up (bash 3.2 pads by bytes).
row() {
  local status="$1" label="$2" detail="$3" color=""
  case "$status" in
    PASS) color='\033[32m' ;;
    FAIL)
      color='\033[31m'
      FAILS=$((FAILS + 1))
      ;;
    WARN)
      color='\033[33m'
      WARNS=$((WARNS + 1))
      ;;
    *) color='\033[2m' ;;
  esac
  if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then
    printf '%b%-6s\033[0m' "$color" "$status"
  else
    printf '%-6s' "$status"
  fi
  printf ' %-20s %s\n' "$label" "$detail"
}

printf 'Perry doctor - %s\n\n' "$(date '+%Y-%m-%d %H:%M:%S')"
printf '%-6s %-20s %s\n' 'STATUS' 'CHECK' 'CHI TIẾT'

# --- Docker -----------------------------------------------------------------
DOCKER_OK=0
if ! command -v docker >/dev/null 2>&1; then
  row FAIL "docker" "chưa cài Docker (https://docs.docker.com/engine/install/)"
elif ! docker info >/dev/null 2>&1; then
  row FAIL "docker" "daemon không phản hồi (bật Docker, kiểm tra quyền của user)"
else
  dver="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
  row PASS "docker" "Engine ${dver:-?}"
  cver="$(docker compose version --short 2>/dev/null || true)"
  cver="${cver#v}"
  if [ -z "$cver" ]; then
    row FAIL "docker compose" "chưa có Compose v2 (https://docs.docker.com/compose/install/)"
  elif [ "${cver%%.*}" -lt 2 ] 2>/dev/null; then
    row FAIL "docker compose" "phiên bản $cver quá cũ, cần v2 trở lên"
  else
    row PASS "docker compose" "v$cver"
    DOCKER_OK=1
  fi
fi

# --- .env -------------------------------------------------------------------
ENV_FILE="$(env_file_path)"
if [ ! -f "$ENV_FILE" ]; then
  row FAIL "env file" "chưa có $ENV_FILE (chạy ./scripts/setup.sh)"
else
  mode="$(file_mode "$ENV_FILE" || true)"
  case "$mode" in
    600 | 400) row PASS "env permissions" "$mode" ;;
    *) row WARN "env permissions" "đang là ${mode:-?}, nên là 600 (chmod 600 $ENV_FILE)" ;;
  esac
  missing="$(missing_env_names)"
  if [ -z "$missing" ]; then
    row PASS "env required" "đủ: $REQUIRED_ENV_NAMES"
  else
    row FAIL "env required" "thiếu hoặc trống: $missing"
  fi
  badpw=""
  for name in LAVALINK_PASSWORD POSTGRES_PASSWORD REDIS_PASSWORD; do
    value="$(env_get "$name")"
    if [ -n "$value" ] && ! matches '^[A-Za-z0-9_-]+$' "$value"; then
      badpw="$badpw $name"
    fi
  done
  if [ -z "$badpw" ]; then
    row PASS "password chars" "chỉ gồm [A-Za-z0-9_-]"
  else
    row FAIL "password chars" "có ký tự ngoài [A-Za-z0-9_-] (làm hỏng DATABASE_URL / REDIS_URL):$badpw"
  fi
  value="$(env_get DISCORD_TOKEN)"
  if [ -n "$value" ]; then
    if matches '^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$' "$value"; then
      row PASS "token shape" "đúng dạng (không kiểm tra được token còn hiệu lực)"
    else
      row WARN "token shape" "không giống token bot (3 phần cách nhau bởi dấu chấm); kiểm tra lại"
    fi
  fi
  value=""
fi

# --- Containers -------------------------------------------------------------
if [ "$DOCKER_OK" = "0" ]; then
  row SKIP "container" "bỏ qua vì Docker không dùng được"
  printf '\n'
  err "Có $FAILS lỗi. Sửa Docker rồi chạy lại ./scripts/doctor.sh."
  exit 1
fi

# service_row LABEL SERVICE -> sets STATE
service_row() {
  local label="$1" service="$2" restarts
  STATE="$(service_state "$service")"
  restarts="$(service_restarts "$service")"
  case "$STATE" in
    healthy | running) row PASS "$label" "$(state_label "$STATE") (khởi động lại: $restarts lần)" ;;
    starting) row WARN "$label" "đang khởi động (khởi động lại: $restarts lần)" ;;
    absent) row FAIL "$label" "chưa chạy (./scripts/deploy.sh)" ;;
    *) row FAIL "$label" "$(state_label "$STATE") (khởi động lại: $restarts lần)" ;;
  esac
}

init_state="$(service_state lavalink-init)"
if [ "$init_state" = "absent" ]; then
  row FAIL "lavalink-init" "chưa chạy (./scripts/deploy.sh)"
else
  init_code="$(service_exit_code lavalink-init || true)"
  if [ "$init_state" = "exited" ] && [ "${init_code:-1}" = "0" ]; then
    row PASS "lavalink-init" "đã chạy xong (exit 0), quyền thư mục plugin đã đúng"
  else
    row FAIL "lavalink-init" "trạng thái $(state_label "$init_state"), exit ${init_code:-?} (xem: ./scripts/logs.sh lavalink-init)"
  fi
fi
service_row "container postgres" postgres
PG_STATE="$STATE"
service_row "container redis" redis
REDIS_STATE="$STATE"
service_row "container lavalink" lavalink
LL_STATE="$STATE"
service_row "container bot" bot
BOT_STATE="$STATE"

is_up() { [ "$1" = "healthy" ] || [ "$1" = "running" ] || [ "$1" = "unhealthy" ] || [ "$1" = "starting" ]; }

# --- Lavalink ---------------------------------------------------------------
if is_up "$LL_STATE"; then
  # The password is expanded INSIDE the container; the response is only grepped.
  # shellcheck disable=SC2016  # expanded by sh inside the container on purpose
  info_json="$(svc_exec lavalink sh -c 'curl -fsS --max-time 5 -H "Authorization: $LAVALINK_SERVER_PASSWORD" http://localhost:2333/v4/info' 2>/dev/null || true)"
  if [ -z "$info_json" ]; then
    row FAIL "lavalink api" "/v4/info không trả lời (sai mật khẩu hoặc Lavalink chưa sẵn sàng)"
  else
    row PASS "lavalink api" "/v4/info trả lời"
    missing_plugins=""
    for plugin in youtube-plugin lavasrc-plugin lavalyrics-plugin; do
      case "$info_json" in
        *"\"$plugin\""*) ;;
        *) missing_plugins="$missing_plugins $plugin" ;;
      esac
    done
    info_json=""
    if [ -z "$missing_plugins" ]; then
      row PASS "lavalink plugins" "youtube, lavasrc, lavalyrics đã nạp"
    else
      row FAIL "lavalink plugins" "chưa nạp:$missing_plugins (lần đầu tải mất 30-90 giây; xem log lavalink)"
    fi
  fi
else
  row SKIP "lavalink api" "bỏ qua vì lavalink chưa chạy"
fi

# --- Postgres ---------------------------------------------------------------
if is_up "$PG_STATE"; then
  if svc_exec postgres pg_isready -U perry -d perry >/dev/null 2>&1; then
    row PASS "postgres ready" "pg_isready: sẵn sàng nhận kết nối"
    count="$(svc_exec postgres psql -U perry -d perry -Atc 'select count(*) from drizzle.__drizzle_migrations' 2>/dev/null || true)"
    if matches '^[0-9]+$' "$count" && [ "$count" -gt 0 ]; then
      row PASS "postgres migrations" "$count migration đã áp dụng"
    else
      row FAIL "postgres migrations" "chưa có migration nào (bot chưa khởi động thành công?); xem log bot"
    fi
  else
    row FAIL "postgres ready" "pg_isready không sẵn sàng"
  fi
else
  row SKIP "postgres ready" "bỏ qua vì postgres chưa chạy"
fi

# --- Redis ------------------------------------------------------------------
if is_up "$REDIS_STATE"; then
  pong="$(svc_exec redis redis-cli ping 2>/dev/null || true)"
  if [ "$pong" = "PONG" ]; then
    row PASS "redis ping" "PONG"
  else
    row FAIL "redis ping" "không trả lời PONG"
  fi
else
  row SKIP "redis ping" "bỏ qua vì redis chưa chạy"
fi

# --- Bot --------------------------------------------------------------------
if [ "$BOT_STATE" != "absent" ]; then
  bot_logs="$(show_logs bot 200)"
  case "$bot_logs" in
    *'Login failed'*)
      row FAIL "bot login" "log có 'Login failed': token sai hoặc bị reset; sửa DISCORD_TOKEN trong .env rồi ./scripts/deploy.sh"
      ;;
    *)
      if [ "$BOT_STATE" = "healthy" ]; then
        row PASS "bot login" "heartbeat mới, bot đã kết nối Discord"
      else
        row WARN "bot login" "chưa thấy heartbeat; nếu kéo dài hãy xem ./scripts/logs.sh bot"
      fi
      ;;
  esac
  bot_logs=""
else
  row SKIP "bot login" "bỏ qua vì bot chưa chạy"
fi

# --- Published ports --------------------------------------------------------
published=""
for service in bot lavalink postgres redis lavalink-init; do
  cid="$(service_cid "$service")"
  if [ -n "$cid" ]; then
    ports="$(docker port "$cid" 2>/dev/null || true)"
    if [ -n "$ports" ]; then
      published="$published $service"
    fi
  fi
done
if [ -z "$published" ]; then
  row PASS "published ports" "không có cổng nào mở ra máy host"
else
  row FAIL "published ports" "dịch vụ đang publish cổng ra host:$published (production không nên mở cổng)"
fi

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  err "Có $FAILS lỗi, $WARNS cảnh báo. Xem ./scripts/logs.sh <service> để biết chi tiết."
  exit 1
fi
if [ "$WARNS" -gt 0 ]; then
  warn "Không có lỗi nặng, $WARNS cảnh báo."
else
  ok "Mọi kiểm tra đều đạt."
fi
