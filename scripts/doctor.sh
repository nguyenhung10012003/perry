#!/usr/bin/env bash
# Perry: read-only health report of the deployment. Prints names and states, never secret values.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/doctor.sh

Checks (read-only) Docker, the .env file (prints variable NAMES only, never values), the state
of the containers, Lavalink + plugins, PostgreSQL + migrations, Redis, the bot, the optional web
dashboard (COMPOSE_PROFILES=web) and published ports.
Works even when the stack is stopped. Prints a PASS / FAIL / WARN / SKIP table.

Exit codes: 0 no serious errors (warnings may remain), 1 at least one error.
EOF
}

case "${1:-}" in
  '') ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    err "Invalid argument: $1"
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
printf '%-6s %-20s %s\n' 'STATUS' 'CHECK' 'DETAIL'

# --- Docker -----------------------------------------------------------------
DOCKER_OK=0
if ! command -v docker >/dev/null 2>&1; then
  row FAIL "docker" "Docker is not installed (https://docs.docker.com/engine/install/)"
elif ! docker info >/dev/null 2>&1; then
  row FAIL "docker" "the daemon is not responding (start Docker, check the user's permissions)"
else
  dver="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
  row PASS "docker" "Engine ${dver:-?}"
  cver="$(docker compose version --short 2>/dev/null || true)"
  cver="${cver#v}"
  if [ -z "$cver" ]; then
    row FAIL "docker compose" "Compose v2 is not available (https://docs.docker.com/compose/install/)"
  elif [ "${cver%%.*}" -lt 2 ] 2>/dev/null; then
    row FAIL "docker compose" "version $cver is too old, v2 or newer is required"
  else
    row PASS "docker compose" "v$cver"
    DOCKER_OK=1
  fi
fi

# --- .env -------------------------------------------------------------------
ENV_FILE="$(env_file_path)"
if [ ! -f "$ENV_FILE" ]; then
  row FAIL "env file" "$ENV_FILE does not exist (run ./scripts/setup.sh)"
else
  mode="$(file_mode "$ENV_FILE" || true)"
  case "$mode" in
    600 | 400) row PASS "env permissions" "$mode" ;;
    *) row WARN "env permissions" "currently ${mode:-?}, should be 600 (chmod 600 $ENV_FILE)" ;;
  esac
  missing="$(missing_env_names)"
  if [ -z "$missing" ]; then
    row PASS "env required" "all set: $REQUIRED_ENV_NAMES"
  else
    row FAIL "env required" "missing or empty: $missing"
  fi
  badpw=""
  for name in LAVALINK_PASSWORD POSTGRES_PASSWORD REDIS_PASSWORD; do
    value="$(env_get "$name")"
    if [ -n "$value" ] && ! matches '^[A-Za-z0-9_-]+$' "$value"; then
      badpw="$badpw $name"
    fi
  done
  if [ -z "$badpw" ]; then
    row PASS "password chars" "only [A-Za-z0-9_-]"
  else
    row FAIL "password chars" "contains characters outside [A-Za-z0-9_-] (breaks DATABASE_URL / REDIS_URL):$badpw"
  fi
  value="$(env_get DISCORD_TOKEN)"
  if [ -n "$value" ]; then
    if matches '^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}$' "$value"; then
      row PASS "token shape" "looks valid (whether the token still works cannot be checked)"
    else
      row WARN "token shape" "does not look like a bot token (3 parts separated by dots); check it"
    fi
  fi
  value=""
  if web_enabled; then
    missing_web=""
    for name in $WEB_REQUIRED_ENV_NAMES; do
      [ -n "$(env_get "$name")" ] || missing_web="$missing_web $name"
    done
    if [ -z "$missing_web" ]; then
      row PASS "env web" "all set: $WEB_REQUIRED_ENV_NAMES"
    else
      row FAIL "env web" "missing or empty:$missing_web (./scripts/setup.sh --web)"
    fi
    value="$(env_get PUBLIC_URL)"
    if [ -n "$value" ]; then
      if public_url_valid "$value"; then
        row PASS "public url" "an https origin (or http on loopback), no path"
      else
        row FAIL "public url" "must be an origin like https://perry.example.com (http only for localhost), no path or trailing slash, port 1-65535"
      fi
    fi
    value="$(env_get SESSION_SECRET)"
    if [ -n "$value" ] && [ "${#value}" -lt 32 ]; then
      row FAIL "session secret" "shorter than 32 characters (./scripts/setup.sh generates 64 hex characters)"
    elif [ -n "$value" ]; then
      row PASS "session secret" "${#value} characters"
    fi
    value=""
  else
    row SKIP "web" "the dashboard is not enabled (COMPOSE_PROFILES has no web)"
  fi
fi

# --- Containers -------------------------------------------------------------
if [ "$DOCKER_OK" = "0" ]; then
  row SKIP "container" "skipped because Docker is not usable"
  printf '\n'
  err "$FAILS error(s). Fix Docker and run ./scripts/doctor.sh again."
  exit 1
fi

# service_row LABEL SERVICE -> sets STATE
service_row() {
  local label="$1" service="$2" restarts
  STATE="$(service_state "$service")"
  restarts="$(service_restarts "$service")"
  case "$STATE" in
    healthy | running) row PASS "$label" "$(state_label "$STATE") (restarts: $restarts)" ;;
    starting) row WARN "$label" "starting (restarts: $restarts)" ;;
    absent) row FAIL "$label" "not running (./scripts/deploy.sh)" ;;
    *) row FAIL "$label" "$(state_label "$STATE") (restarts: $restarts)" ;;
  esac
}

init_state="$(service_state lavalink-init)"
if [ "$init_state" = "absent" ]; then
  row FAIL "lavalink-init" "not running (./scripts/deploy.sh)"
else
  init_code="$(service_exit_code lavalink-init || true)"
  if [ "$init_state" = "exited" ] && [ "${init_code:-1}" = "0" ]; then
    row PASS "lavalink-init" "completed (exit 0), plugin directory permissions are correct"
  else
    row FAIL "lavalink-init" "state $(state_label "$init_state"), exit ${init_code:-?} (see: ./scripts/logs.sh lavalink-init)"
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
WEB_STATE="absent"
if web_enabled; then
  service_row "container web" web
  WEB_STATE="$STATE"
fi

is_up() { [ "$1" = "healthy" ] || [ "$1" = "running" ] || [ "$1" = "unhealthy" ] || [ "$1" = "starting" ]; }

# --- Lavalink ---------------------------------------------------------------
if is_up "$LL_STATE"; then
  # The password is expanded INSIDE the container; the response is only grepped.
  # shellcheck disable=SC2016  # expanded by sh inside the container on purpose
  info_json="$(svc_exec lavalink sh -c 'curl -fsS --max-time 5 -H "Authorization: $LAVALINK_SERVER_PASSWORD" http://localhost:2333/v4/info' 2>/dev/null || true)"
  if [ -z "$info_json" ]; then
    row FAIL "lavalink api" "/v4/info did not respond (wrong password or Lavalink is not ready yet)"
  else
    row PASS "lavalink api" "/v4/info responded"
    missing_plugins=""
    for plugin in youtube-plugin lavasrc-plugin lavalyrics-plugin; do
      case "$info_json" in
        *"\"$plugin\""*) ;;
        *) missing_plugins="$missing_plugins $plugin" ;;
      esac
    done
    info_json=""
    if [ -z "$missing_plugins" ]; then
      row PASS "lavalink plugins" "youtube, lavasrc, lavalyrics loaded"
    else
      row FAIL "lavalink plugins" "not loaded:$missing_plugins (the first download takes 30-90 seconds; see the lavalink logs)"
    fi
  fi
else
  row SKIP "lavalink api" "skipped because lavalink is not running"
fi

# --- Postgres ---------------------------------------------------------------
if is_up "$PG_STATE"; then
  if svc_exec postgres pg_isready -U perry -d perry >/dev/null 2>&1; then
    row PASS "postgres ready" "pg_isready: accepting connections"
    count="$(svc_exec postgres psql -U perry -d perry -Atc 'select count(*) from drizzle.__drizzle_migrations' 2>/dev/null || true)"
    if matches '^[0-9]+$' "$count" && [ "$count" -gt 0 ]; then
      row PASS "postgres migrations" "$count migration(s) applied"
    else
      row FAIL "postgres migrations" "no migrations applied (did the bot fail to start?); see the bot logs"
    fi
  else
    row FAIL "postgres ready" "pg_isready: not ready"
  fi
else
  row SKIP "postgres ready" "skipped because postgres is not running"
fi

# --- Redis ------------------------------------------------------------------
if is_up "$REDIS_STATE"; then
  pong="$(svc_exec redis redis-cli ping 2>/dev/null || true)"
  if [ "$pong" = "PONG" ]; then
    row PASS "redis ping" "PONG"
  else
    row FAIL "redis ping" "did not answer PONG"
  fi
else
  row SKIP "redis ping" "skipped because redis is not running"
fi

# --- Bot --------------------------------------------------------------------
if [ "$BOT_STATE" != "absent" ]; then
  bot_logs="$(show_logs bot 200)"
  case "$bot_logs" in
    *'Login failed'*)
      row FAIL "bot login" "logs contain 'Login failed': the token is wrong or was reset; fix DISCORD_TOKEN in .env, then ./scripts/deploy.sh"
      ;;
    *)
      if [ "$BOT_STATE" = "healthy" ]; then
        row PASS "bot login" "recent heartbeat, the bot is connected to Discord"
      else
        row WARN "bot login" "no heartbeat yet; if this persists, see ./scripts/logs.sh bot"
      fi
      ;;
  esac
  bot_logs=""
else
  row SKIP "bot login" "skipped because the bot is not running"
fi

# --- Web dashboard ----------------------------------------------------------
if web_enabled; then
  if is_up "$WEB_STATE"; then
    health="$(svc_exec web wget -q -T 5 -O - http://127.0.0.1:3000/healthz 2>/dev/null || true)"
    case "$health" in
      *'"status":"ok"'*) row PASS "web health" "/healthz: Postgres and Redis reachable" ;;
      *) row FAIL "web health" "/healthz is not ok (see ./scripts/logs.sh web)" ;;
    esac
  else
    row SKIP "web health" "skipped because web is not running"
  fi
  if is_up "$REDIS_STATE"; then
    prefix="$(effective_env REDIS_KEY_PREFIX)"
    matches '^[a-z0-9_-]{1,32}$' "${prefix:-perry}" || prefix="perry"
    ttl="$(svc_exec redis redis-cli TTL "${prefix:-perry}:v1:botguilds" 2>/dev/null || true)"
    if matches '^[0-9]+$' "$ttl" && [ "$ttl" -gt 0 ]; then
      row PASS "web bridge" "the bot publishes its guild list for the dashboard"
    else
      row WARN "web bridge" "the bot has not published its guild list; it is offline or older than 1.4 (the dashboard answers 503)"
    fi
  else
    row SKIP "web bridge" "skipped because redis is not running"
  fi
fi

# --- Published ports --------------------------------------------------------
published=""
for service in bot lavalink postgres redis lavalink-init web; do
  cid="$(service_cid "$service")"
  if [ -n "$cid" ]; then
    ports="$(docker port "$cid" 2>/dev/null || true)"
    if [ -z "$ports" ]; then
      continue
    fi
    # Only the web may publish, and only on 127.0.0.1 (for a reverse proxy on this host).
    if [ "$service" = "web" ] && ! printf '%s\n' "$ports" | grep -vqE -- '-> 127\.0\.0\.1:[0-9]+$'; then
      continue
    fi
    published="$published $service"
  fi
done
if [ -z "$published" ]; then
  row PASS "published ports" "nothing is exposed beyond 127.0.0.1 (only the web may bind 127.0.0.1)"
else
  row FAIL "published ports" "services publishing ports to the host:$published (production exposes only the web, on 127.0.0.1)"
fi

printf '\n'
if [ "$FAILS" -gt 0 ]; then
  err "$FAILS error(s), $WARNS warning(s). See ./scripts/logs.sh <service> for details."
  exit 1
fi
if [ "$WARNS" -gt 0 ]; then
  warn "No serious errors, $WARNS warning(s)."
else
  ok "All checks passed."
fi
