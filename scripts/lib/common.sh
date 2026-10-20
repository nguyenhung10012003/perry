# shellcheck shell=bash
# Shared helpers for the Perry deployment scripts. Source it, do not execute it.
# Bash 3.2 (macOS) and GNU compatible. It never sources .env: values are untrusted
# and are read with grep/sed and written with awk (ENVIRON, no escape processing).

if [ -n "${PERRY_COMMON_LOADED:-}" ]; then
  return 0
fi
PERRY_COMMON_LOADED=1

ROOT_DIR="$(CDPATH='' cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export ROOT_DIR

# Names that docker-compose.yml refuses to start without.
REQUIRED_ENV_NAMES="DISCORD_TOKEN DISCORD_CLIENT_ID LAVALINK_PASSWORD POSTGRES_PASSWORD REDIS_PASSWORD"
# Services of the production stack, in start order.
STACK_SERVICES="lavalink-init postgres redis lavalink bot"
# Only backup files with exactly this name are ever pruned by the retention logic.
BACKUP_NAME_RE='^perry-[0-9]{8}-[0-9]{6}\.dump$'
# shellcheck disable=SC2034  # used by the scripts that source this file
DEFAULT_BACKUP_KEEP=14
# shellcheck disable=SC2034
DEFAULT_WAIT_TIMEOUT=300

# ---------------------------------------------------------------------------
# Output (colors only on a TTY and when NO_COLOR is unset)
# ---------------------------------------------------------------------------

_say() {
  local fd="$1" color="$2" tag="$3"
  shift 3
  if [ -z "${NO_COLOR:-}" ] && [ -t "$fd" ]; then
    printf '%b%s\033[0m %s\n' "$color" "$tag" "$*" >&"$fd"
  else
    printf '%s %s\n' "$tag" "$*" >&"$fd"
  fi
}

info() { _say 1 '\033[34m' '[i]' "$@"; }
ok() { _say 1 '\033[32m' '[ok]' "$@"; }
warn() { _say 2 '\033[33m' '[!]' "$@"; }
err() { _say 2 '\033[31m' '[x]' "$@"; }
die() {
  err "$@"
  exit 1
}

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

require_docker() {
  local version major
  if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed."
    err "Install Docker Engine: https://docs.docker.com/engine/install/"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    die "Cannot connect to the Docker daemon. Start Docker (Docker Desktop or: sudo systemctl start docker) and make sure the current user is allowed to use docker."
  fi
  if ! version="$(docker compose version --short 2>/dev/null)"; then
    err "Docker Compose v2 (the 'docker compose' command) is not available."
    err "Install Compose: https://docs.docker.com/compose/install/"
    exit 1
  fi
  version="${version#v}"
  major="${version%%.*}"
  case "$major" in
    '' | *[!0-9]*) major=0 ;;
  esac
  if [ "$major" -lt 2 ]; then
    err "Docker Compose v2 or newer is required (found: $version)."
    err "Install Compose: https://docs.docker.com/compose/install/"
    exit 1
  fi
}

# Path of the env file: PERRY_ENV_FILE or <repo>/.env
env_file_path() {
  printf '%s\n' "${PERRY_ENV_FILE:-$ROOT_DIR/.env}"
}

# docker compose bound to this repository. Honors COMPOSE_PROJECT_NAME and PERRY_ENV_FILE.
compose() {
  if [ -n "${PERRY_ENV_FILE:-}" ]; then
    docker compose --project-directory "$ROOT_DIR" --env-file "$PERRY_ENV_FILE" -f "$ROOT_DIR/docker-compose.yml" "$@"
  else
    docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/docker-compose.yml" "$@"
  fi
}

# ---------------------------------------------------------------------------
# .env access (never sourced)
# ---------------------------------------------------------------------------

# env_get KEY: last value of KEY in the env file, one pair of surrounding quotes removed.
env_get() {
  local file line value
  file="$(env_file_path)"
  [ -f "$file" ] || return 0
  line="$(grep -E "^$1=" "$file" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s\n' "$value"
}

# effective_env KEY: the process environment wins (like docker compose), then the env file.
effective_env() {
  local current="${!1:-}"
  if [ -n "$current" ]; then
    printf '%s\n' "$current"
  else
    env_get "$1"
  fi
}

# env_set KEY VALUE: replace (or append) KEY=VALUE atomically, mode 600.
env_set() {
  local key="$1" value="$2" file dir tmp
  case "$value" in
    *$'\n'* | *$'\r'*) return 1 ;;
  esac
  file="$(env_file_path)"
  dir="$(dirname "$file")"
  tmp="$(umask 077 && mktemp "$dir/.perry-env.XXXXXX")"
  if [ -f "$file" ]; then
    ENV_SET_KEY="$key" ENV_SET_VALUE="$value" awk '
      BEGIN { k = ENVIRON["ENV_SET_KEY"]; v = ENVIRON["ENV_SET_VALUE"]; done = 0 }
      index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 }; next }
      { print }
      END { if (!done) print k "=" v }
    ' "$file" >"$tmp" || { rm -f "$tmp"; return 1; }
  else
    printf '%s=%s\n' "$key" "$value" >"$tmp"
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

# missing_env_names: space separated required names that are absent or empty.
missing_env_names() {
  local name missing=""
  for name in $REQUIRED_ENV_NAMES; do
    if [ -z "$(env_get "$name")" ]; then
      missing="$missing $name"
    fi
  done
  printf '%s\n' "${missing# }"
}

# require_env_file: stop with an error message unless the env file has all required names.
require_env_file() {
  local file missing
  file="$(env_file_path)"
  if [ ! -f "$file" ]; then
    die "The config file ($file) does not exist. Run ./scripts/setup.sh first."
  fi
  missing="$(missing_env_names)"
  if [ -n "$missing" ]; then
    err "The config file is missing values for: $missing"
    die "Run ./scripts/setup.sh again to fill in the missing values."
  fi
}

# matches REGEX VALUE: ERE match in the C locale (no locale-dependent ranges).
matches() {
  (
    LC_ALL=C
    export LC_ALL
    [[ $2 =~ $1 ]]
  )
}

# random_hex BYTES: BYTES random bytes as hex. openssl when available, else /dev/urandom.
random_hex() {
  local bytes="${1:-24}" out
  if command -v openssl >/dev/null 2>&1; then
    if out="$(openssl rand -hex "$bytes" 2>/dev/null)" && [ "${#out}" -eq $((bytes * 2)) ]; then
      printf '%s\n' "$out"
      return 0
    fi
  fi
  out="$(od -An -N"$bytes" -tx1 /dev/urandom | tr -d ' \n')"
  if [ "${#out}" -ne $((bytes * 2)) ]; then
    die "Could not generate random bytes (openssl or /dev/urandom is required)."
  fi
  printf '%s\n' "$out"
}

# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------

# file_mode FILE: octal permissions (GNU stat first, BSD stat second).
file_mode() {
  stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"
}

file_size() {
  local n
  n="$(wc -c <"$1")"
  printf '%s\n' "$((n))"
}

human_size() {
  awk -v b="$1" 'BEGIN {
    if (b < 1024) printf "%d B\n", b
    else if (b < 1048576) printf "%.1f KB\n", b / 1024
    else printf "%.1f MB\n", b / 1048576
  }'
}

# ---------------------------------------------------------------------------
# Versions and build metadata
# ---------------------------------------------------------------------------

read_version() {
  local v
  v="$(sed -n '/"version"/{s/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p;q;}' "$ROOT_DIR/package.json" 2>/dev/null || true)"
  printf '%s\n' "${v:-dev}"
}

# is_git_checkout: a git working tree rooted at ROOT_DIR with at least one commit.
is_git_checkout() {
  [ -e "$ROOT_DIR/.git" ] && command -v git >/dev/null 2>&1 &&
    git -C "$ROOT_DIR" rev-parse --verify -q HEAD >/dev/null 2>&1
}

# export_build_metadata: PERRY_VERSION, PERRY_REVISION, PERRY_SOURCE_URL for the compose build args.
export_build_metadata() {
  local rev="unknown" url=""
  PERRY_VERSION="$(read_version)"
  if is_git_checkout; then
    rev="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    url="$(git -C "$ROOT_DIR" config --get remote.origin.url 2>/dev/null || true)"
    # Drop credentials: scheme://user:token@host/... and git@host:owner/repo.
    url="$(printf '%s\n' "$url" | sed -E -e 's#^([A-Za-z][A-Za-z0-9+.-]*://)[^/@]*@#\1#' -e 's#^[^/@:]+@([^:/]+):#https://\1/#')"
  fi
  PERRY_REVISION="${rev:-unknown}"
  PERRY_SOURCE_URL="$url"
  export PERRY_VERSION PERRY_REVISION PERRY_SOURCE_URL
}

# project_name: the compose project name (env, .env, `name:` of the compose file, default perry).
project_name() {
  local name="${COMPOSE_PROJECT_NAME:-}"
  if [ -z "$name" ]; then
    name="$(env_get COMPOSE_PROJECT_NAME)"
  fi
  if [ -z "$name" ]; then
    name="$(sed -n 's/^name:[[:space:]]*\([A-Za-z0-9_-]*\).*/\1/p' "$ROOT_DIR/docker-compose.yml" 2>/dev/null | head -n 1 || true)"
  fi
  printf '%s\n' "$(printf '%s' "${name:-perry}" | tr '[:upper:]' '[:lower:]')"
}

# ---------------------------------------------------------------------------
# Containers (looked up by compose labels, so they work even when .env is incomplete)
# ---------------------------------------------------------------------------

service_cid() {
  docker ps -a -q \
    --filter "label=com.docker.compose.project=$(project_name)" \
    --filter "label=com.docker.compose.service=$1" \
    --filter "label=com.docker.compose.oneoff=False" 2>/dev/null | head -n 1 || true
}

# service_state SERVICE: absent | created | running | healthy | unhealthy | starting |
# restarting | paused | exited | dead
service_state() {
  local cid out status health
  cid="$(service_cid "$1")"
  if [ -z "$cid" ]; then
    printf 'absent\n'
    return 0
  fi
  out="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true)"
  status="${out%% *}"
  health=""
  case "$out" in
    *' '*) health="${out#* }" ;;
  esac
  case "$status" in
    '') printf 'absent\n' ;;
    running)
      if [ -n "$health" ]; then printf '%s\n' "$health"; else printf 'running\n'; fi
      ;;
    *) printf '%s\n' "$status" ;;
  esac
}

service_restarts() {
  local cid n
  cid="$(service_cid "$1")"
  if [ -z "$cid" ]; then
    printf '0\n'
    return 0
  fi
  n="$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || true)"
  printf '%s\n' "${n:-0}"
}

service_exit_code() {
  local cid
  cid="$(service_cid "$1")"
  [ -n "$cid" ] || return 1
  docker inspect -f '{{.State.ExitCode}}' "$cid" 2>/dev/null
}

# svc_exec SERVICE CMD...: run a command in the running container (stdin closed).
svc_exec() {
  local cid
  cid="$(service_cid "$1")"
  [ -n "$cid" ] || return 1
  shift
  docker exec "$cid" "$@" </dev/null
}

# svc_exec_i SERVICE CMD...: same, but forwards stdin (for dump/restore streams).
svc_exec_i() {
  local cid
  cid="$(service_cid "$1")"
  [ -n "$cid" ] || return 1
  shift
  docker exec -i "$cid" "$@"
}

state_label() {
  case "$1" in
    healthy) printf 'healthy\n' ;;
    unhealthy) printf 'unhealthy\n' ;;
    starting) printf 'starting\n' ;;
    running) printf 'running\n' ;;
    restarting) printf 'restarting repeatedly\n' ;;
    exited) printf 'stopped\n' ;;
    created) printf 'created\n' ;;
    paused) printf 'paused\n' ;;
    dead) printf 'failed (dead)\n' ;;
    absent) printf 'not running\n' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# WAIT_FAILED_SERVICE is set by wait_healthy when it returns non-zero.
WAIT_FAILED_SERVICE=""
# "restart" when wait_healthy gave up because the service kept restarting, else "".
WAIT_FAILED_REASON=""

# _classify SERVICE STATE -> ok | wait | bad
_classify() {
  local service="$1" state="$2" code
  if [ "$service" = "lavalink-init" ]; then
    case "$state" in
      exited)
        code="$(service_exit_code "$service" || true)"
        if [ "${code:-1}" = "0" ]; then printf 'ok\n'; else printf 'bad\n'; fi
        ;;
      created | running) printf 'wait\n' ;;
      *) printf 'bad\n' ;;
    esac
    return 0
  fi
  case "$state" in
    healthy | running) printf 'ok\n' ;;
    starting | created) printf 'wait\n' ;;
    *) printf 'bad\n' ;;
  esac
}

# wait_healthy TIMEOUT SERVICES...: poll every 3 s. Returns 0 when every service is ready,
# 1 as soon as one is unhealthy / stopped / restarting, 2 on timeout.
wait_healthy() {
  local timeout="$1" services=() service state kind i start now pending
  local last=() base=() restarts
  shift
  for service in "$@"; do
    services+=("$service")
  done
  i=0
  for service in "${services[@]}"; do
    base[i]="$(service_restarts "$service")"
    last[i]=""
    i=$((i + 1))
  done
  start="$(date +%s)"
  WAIT_FAILED_SERVICE=""
  WAIT_FAILED_REASON=""
  while :; do
    pending=""
    i=0
    for service in "${services[@]}"; do
      state="$(service_state "$service")"
      if [ "$state" != "${last[i]}" ]; then
        info "  $service: $(state_label "$state")"
        last[i]="$state"
      fi
      kind="$(_classify "$service" "$state")"
      restarts="$(service_restarts "$service")"
      if [ "$service" != "lavalink-init" ] && [ "$restarts" -gt "${base[i]}" ]; then
        kind="bad"
        WAIT_FAILED_REASON="restart"
        info "  $service: restarted $((restarts - base[i])) time(s) while waiting"
      fi
      if [ "$kind" = "bad" ]; then
        WAIT_FAILED_SERVICE="$service"
        return 1
      fi
      if [ "$kind" = "wait" ]; then
        pending="${pending:-$service}"
      fi
      i=$((i + 1))
    done
    if [ -z "$pending" ]; then
      return 0
    fi
    now="$(date +%s)"
    if [ $((now - start)) -ge "$timeout" ]; then
      WAIT_FAILED_SERVICE="$pending"
      return 2
    fi
    sleep 3
  done
}

# show_logs SERVICE N: last N log lines of the service (best effort).
show_logs() {
  local cid
  cid="$(service_cid "$1")"
  if [ -z "$cid" ]; then
    warn "No container for service '$1' to read logs from."
    return 0
  fi
  docker logs --tail "$2" "$cid" 2>&1 || true
}

# wait_stack_ready TIMEOUT: wait for the whole stack; on failure print the failing
# service's last 30 log lines. Returns the wait_healthy status.
wait_stack_ready() {
  local rc=0
  info "Waiting for the services to become ready (up to $1 seconds)..."
  # shellcheck disable=SC2086
  wait_healthy "$1" $STACK_SERVICES || rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "All services are ready."
    return 0
  fi
  if [ "$rc" -eq 2 ]; then
    err "Timed out: service '$WAIT_FAILED_SERVICE' is not ready yet."
  elif [ "$WAIT_FAILED_REASON" = "restart" ]; then
    err "Service '$WAIT_FAILED_SERVICE' keeps restarting (crash loop)."
  else
    err "Service '$WAIT_FAILED_SERVICE' is not healthy ($(state_label "$(service_state "$WAIT_FAILED_SERVICE")"))."
  fi
  err "Last 30 log lines of '$WAIT_FAILED_SERVICE':"
  show_logs "$WAIT_FAILED_SERVICE" 30 >&2
  return "$rc"
}

# build_or_pull: build the bot image from source, or pull BOT_IMAGE when it is set.
build_or_pull() {
  local image
  export_build_metadata
  image="$(effective_env BOT_IMAGE)"
  if [ -n "$image" ]; then
    info "Pulling prebuilt image: $image"
    compose pull bot
  else
    info "Building the bot image from source (version $PERRY_VERSION, revision $PERRY_REVISION)..."
    compose build bot
  fi
}

# ---------------------------------------------------------------------------
# Interaction
# ---------------------------------------------------------------------------

ASSUME_YES="${ASSUME_YES:-0}"

# confirm MESSAGE [strict]: true when ASSUME_YES=1 or the user agrees on a TTY.
# strict requires typing the word "yes". Without a TTY it returns false.
confirm() {
  local message="$1" mode="${2:-}" answer
  if [ "$ASSUME_YES" = "1" ]; then
    return 0
  fi
  if [ ! -t 0 ]; then
    return 1
  fi
  if [ "$mode" = "strict" ]; then
    printf '%s\n  Type "yes" to continue: ' "$message" >&2
  else
    printf '%s [y/N]: ' "$message" >&2
  fi
  IFS= read -r answer || return 1
  case "$answer" in
    yes | YES | Yes) return 0 ;;
    y | Y)
      [ "$mode" = "strict" ] && return 1
      return 0
      ;;
  esac
  return 1
}

# ---------------------------------------------------------------------------
# Postgres dumps (shared by backup.sh and restore.sh)
# ---------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

# validate_dump FILE: non-empty and readable by pg_restore (custom format).
validate_dump() {
  [ -s "$1" ] || return 1
  svc_exec_i postgres pg_restore --list <"$1" >/dev/null 2>&1
}

# backup_dump DEST: pg_dump -Fc into a temp file, validate, chmod 600, then mv to DEST.
backup_dump() {
  local dest="$1" dir tmp
  dir="$(dirname "$dest")"
  mkdir -p "$dir"
  chmod 700 "$dir" 2>/dev/null || true
  tmp="$(umask 077 && mktemp "$dir/.perry-dump.XXXXXX")"
  if ! svc_exec_i postgres pg_dump -U perry -d perry -Fc >"$tmp"; then
    rm -f "$tmp"
    err "pg_dump failed."
    return 1
  fi
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    err "The backup file is empty."
    return 1
  fi
  if ! validate_dump "$tmp"; then
    rm -f "$tmp"
    err "The backup file cannot be read by pg_restore --list."
    return 1
  fi
  chmod 600 "$tmp"
  mv "$tmp" "$dest"
}

# list_backups: names of the perry-YYYYmmdd-HHMMSS.dump files in BACKUP_DIR, newest first.
list_backups() {
  local f name
  for f in "$BACKUP_DIR"/perry-*.dump; do
    [ -e "$f" ] || continue
    name="${f##*/}"
    if [[ $name =~ $BACKUP_NAME_RE ]]; then
      printf '%s\n' "$name"
    fi
  done | sort -r
}

# latest_backup: path of the newest perry-YYYYmmdd-HHMMSS.dump (empty when none).
latest_backup() {
  local name
  name="$(list_backups | sed -n 1p)"
  if [ -n "$name" ]; then
    printf '%s\n' "$BACKUP_DIR/$name"
  fi
}
