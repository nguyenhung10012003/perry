#!/usr/bin/env bash
# Perry: first-time setup. Creates/updates .env, never prints secrets, safe to re-run.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

NON_INTERACTIVE=0
SKIP_DOCKER_CHECK=0

usage() {
  cat <<'EOF'
Usage: ./scripts/setup.sh [options]

Creates the .env file (from .env.example), asks for DISCORD_TOKEN and DISCORD_CLIENT_ID,
and generates the Lavalink / PostgreSQL / Redis passwords. Safe to re-run any number of
times: existing values are never overwritten.

Options:
  --non-interactive   ask nothing; read DISCORD_TOKEN, DISCORD_CLIENT_ID (required),
                      DEV_GUILD_ID, LASTFM_API_KEY (optional) from the environment
  --env-file PATH     config file (default: .env, or the PERRY_ENV_FILE variable)
  --skip-docker-check skip the Docker / Compose check (only create the config file)
  -h, --help          show this help

Exit codes: 0 success, 1 error or invalid value, 2 invalid arguments.
EOF
}

ENV_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --skip-docker-check) SKIP_DOCKER_CHECK=1 ;;
    --env-file)
      if [ $# -lt 2 ] || [ -z "$2" ]; then
        err "--env-file requires a path."
        exit 2
      fi
      ENV_ARG="$2"
      shift
      ;;
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
  shift
done

if [ -n "$ENV_ARG" ]; then
  case "$ENV_ARG" in
    /*) PERRY_ENV_FILE="$ENV_ARG" ;;
    *) PERRY_ENV_FILE="$PWD/$ENV_ARG" ;;
  esac
  export PERRY_ENV_FILE
fi
ENV_FILE="$(env_file_path)"

RE_TOKEN='^[A-Za-z0-9._~+/=_-]{20,}$'
RE_SNOWFLAKE='^[0-9]{17,20}$'
RE_LASTFM='^[A-Za-z0-9]{8,64}$'
RE_PASSWORD='^[A-Za-z0-9_-]+$'
RE_PORT='^[0-9]{2,5}$'

# --- 1. Docker --------------------------------------------------------------
if [ "$SKIP_DOCKER_CHECK" = "1" ]; then
  warn "Skipping the Docker check (--skip-docker-check)."
else
  require_docker
  ok "Docker and Docker Compose v2 are ready."
fi

if [ ! -f "$ROOT_DIR/.env.example" ]; then
  die "$ROOT_DIR/.env.example not found."
fi
if [ "$NON_INTERACTIVE" = "0" ] && [ ! -t 0 ]; then
  die "No terminal to prompt on. Run with --non-interactive and set DISCORD_TOKEN, DISCORD_CLIENT_ID in the environment."
fi

# --- 2. Resolve and validate every input BEFORE touching the file -----------

RESOLVED=""
MISSING=""
INVALID=""

prompt_value() { # prompt_value LABEL HIDDEN -> stdout
  local label="$1" hidden="$2" value=""
  if [ "$hidden" = "1" ]; then
    printf '%s (hidden while typing): ' "$label" >&2
    IFS= read -rs value || true
    printf '\n' >&2
  else
    printf '%s: ' "$label" >&2
    IFS= read -r value || true
  fi
  printf '%s\n' "$value"
}

# resolve_value KEY REQUIRED REGEX HIDDEN LABEL
# Sets RESOLVED to the value that must be written ("" = keep the current value / skip).
resolve_value() {
  local key="$1" required="$2" regex="$3" hidden="$4" label="$5"
  local current value tries=0
  RESOLVED=""
  current="$(env_get "$key")"
  if [ -n "$current" ]; then
    if [ "$NON_INTERACTIVE" = "1" ] || ! confirm "$key already has a value in $ENV_FILE. Overwrite?"; then
      ok "$key: keeping the existing value."
      return 0
    fi
  fi
  value="${!key:-}"
  while :; do
    if [ -z "$value" ] && [ "$NON_INTERACTIVE" = "0" ]; then
      value="$(prompt_value "$label" "$hidden")"
    fi
    if [ -z "$value" ]; then
      if [ "$required" = "1" ]; then
        tries=$((tries + 1))
        if [ "$NON_INTERACTIVE" = "0" ] && [ "$tries" -lt 3 ]; then
          warn "$key is required."
          continue
        fi
        MISSING="$MISSING $key"
      fi
      return 0
    fi
    if matches "$regex" "$value"; then
      RESOLVED="$value"
      return 0
    fi
    err "$key is invalid (value not printed). Rule: $(rule_text "$key")"
    tries=$((tries + 1))
    if [ "$NON_INTERACTIVE" = "1" ] || [ "$tries" -ge 3 ]; then
      INVALID="$INVALID $key"
      return 0
    fi
    value=""
  done
}

rule_text() {
  case "$1" in
    DISCORD_TOKEN) printf 'at least 20 characters from [A-Za-z0-9._~+/=_-], no spaces, quotes, $, # or line breaks.' ;;
    DEV_GUILD_ID | DISCORD_CLIENT_ID) printf '17-20 digits only.' ;;
    LASTFM_API_KEY) printf '8-64 letters and digits.' ;;
    *) printf 'see .env.example.' ;;
  esac
}

NEW_DISCORD_TOKEN=""
NEW_DISCORD_CLIENT_ID=""
NEW_DEV_GUILD_ID=""
NEW_LASTFM_API_KEY=""

resolve_value DISCORD_CLIENT_ID 1 "$RE_SNOWFLAKE" 0 "DISCORD_CLIENT_ID (Application ID)"
NEW_DISCORD_CLIENT_ID="$RESOLVED"
resolve_value DISCORD_TOKEN 1 "$RE_TOKEN" 1 "DISCORD_TOKEN (Bot token)"
NEW_DISCORD_TOKEN="$RESOLVED"
resolve_value DEV_GUILD_ID 0 "$RE_SNOWFLAKE" 0 "DEV_GUILD_ID (optional, press Enter to skip)"
NEW_DEV_GUILD_ID="$RESOLVED"
resolve_value LASTFM_API_KEY 0 "$RE_LASTFM" 0 "LASTFM_API_KEY (optional, press Enter to skip)"
NEW_LASTFM_API_KEY="$RESOLVED"

if [ -n "$MISSING" ]; then
  err "Missing required values:$MISSING"
  if [ "$NON_INTERACTIVE" = "1" ]; then
    err "Set these variables in the environment when running with --non-interactive."
  fi
fi
if [ -n "$INVALID" ]; then
  err "Invalid values:$INVALID"
fi
if [ -n "$MISSING$INVALID" ]; then
  die "Nothing was written to $ENV_FILE."
fi

# --- 3. Create the env file or append keys added by newer versions ----------

if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  (umask 077 && cp "$ROOT_DIR/.env.example" "$ENV_FILE")
  chmod 600 "$ENV_FILE"
  ok "Created $ENV_FILE from .env.example (mode 600)."
else
  chmod 600 "$ENV_FILE"
  appended=0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      [A-Z]*=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    case "$key" in
      *[!A-Z0-9_]*) continue ;;
    esac
    if grep -qE "^$key=" "$ENV_FILE"; then
      continue
    fi
    if [ "$appended" -eq 0 ]; then
      if [ -s "$ENV_FILE" ] && [ -n "$(tail -c 1 "$ENV_FILE")" ]; then
        printf '\n' >>"$ENV_FILE"
      fi
      printf '\n# Added by setup.sh (new keys from .env.example)\n' >>"$ENV_FILE"
    fi
    printf '%s\n' "$line" >>"$ENV_FILE"
    appended=$((appended + 1))
    info "Added new key: $key"
  done <"$ROOT_DIR/.env.example"
  ok "Using the existing config file $ENV_FILE (mode 600, $appended new keys added)."
fi

# --- 4. Write user supplied values ------------------------------------------

write_value() { # write_value KEY VALUE
  if [ -n "$2" ]; then
    env_set "$1" "$2" || die "Could not write $1."
    ok "$1: set."
  fi
}
write_value DISCORD_CLIENT_ID "$NEW_DISCORD_CLIENT_ID"
write_value DISCORD_TOKEN "$NEW_DISCORD_TOKEN"
write_value DEV_GUILD_ID "$NEW_DEV_GUILD_ID"
write_value LASTFM_API_KEY "$NEW_LASTFM_API_KEY"

# --- 5. Generated secrets (only when empty) ---------------------------------

PASSWORDS_SEEN=""
for key in LAVALINK_PASSWORD POSTGRES_PASSWORD REDIS_PASSWORD; do
  current="$(env_get "$key")"
  if [ -n "$current" ]; then
    if ! matches "$RE_PASSWORD" "$current"; then
      warn "$key contains characters outside [A-Za-z0-9_-]; DATABASE_URL / REDIS_URL may break. The value is kept as is."
    fi
    case " $PASSWORDS_SEEN " in
      *" $current "*) warn "$key is the same as another password; use a separate password for each service." ;;
    esac
    PASSWORDS_SEEN="$PASSWORDS_SEEN $current"
    ok "$key: keeping the existing value."
    continue
  fi
  generated="$(random_hex 24)"
  while :; do
    case " $PASSWORDS_SEEN " in
      *" $generated "*) generated="$(random_hex 24)" ;;
      *) break ;;
    esac
  done
  env_set "$key" "$generated" || die "Could not write $key."
  PASSWORDS_SEEN="$PASSWORDS_SEEN $generated"
  ok "$key: generated (48 hex characters)."
done
generated=""
PASSWORDS_SEEN=""

# --- 6. Connection strings for host-run / dev-infra (production compose ignores them) ---

pg_port="$(env_get POSTGRES_PORT)"
redis_port="$(env_get REDIS_PORT)"
matches "$RE_PORT" "$pg_port" || pg_port=5432
matches "$RE_PORT" "$redis_port" || redis_port=6379
if [ -z "$(env_get DATABASE_URL)" ]; then
  env_set DATABASE_URL "postgres://perry:$(env_get POSTGRES_PASSWORD)@127.0.0.1:$pg_port/perry" || die "Could not write DATABASE_URL."
  ok "DATABASE_URL: set (used when running the bot on the host)."
fi
if [ -z "$(env_get REDIS_URL)" ]; then
  env_set REDIS_URL "redis://:$(env_get REDIS_PASSWORD)@127.0.0.1:$redis_port" || die "Could not write REDIS_URL."
  ok "REDIS_URL: set (used when running the bot on the host)."
fi

# --- 7. Lavalink config must be readable by the container user (uid 322) ----

if [ -f "$ROOT_DIR/lavalink/application.yml" ]; then
  chmod a+r "$ROOT_DIR/lavalink/application.yml" || warn "Could not chmod lavalink/application.yml; Lavalink may be unable to read it."
fi

# --- 8. Next steps ----------------------------------------------------------

client_id="$(env_get DISCORD_CLIENT_ID)"
printf '\n'
ok "Setup complete. Secret values are not printed; they are stored in $ENV_FILE."
printf '\nInvite link for adding the bot to a server (requires permission to add bots):\n  https://discord.com/oauth2/authorize?client_id=%s&scope=bot%%20applications.commands&permissions=2150648832\n' "$client_id"
cat <<'EOF'

Next steps:
  1. make up              (or ./scripts/deploy.sh; or simply: docker compose up -d)
  2. ./scripts/doctor.sh  check the health of the stack after it starts
  3. ./scripts/logs.sh    view the logs

If YouTube blocks the bot (OAuth or a poToken is required), see the README: setup.sh does not automate this part.
EOF
