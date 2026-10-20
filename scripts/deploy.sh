#!/usr/bin/env bash
# Perry: build (or pull) the bot image, start the whole stack and wait until it is healthy.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

BUILD_ONLY=0
NO_BUILD=0
TIMEOUT="$DEFAULT_WAIT_TIMEOUT"

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [options]

Builds the bot image from source (or pulls BOT_IMAGE when it is set in .env), runs
docker compose up -d and waits until postgres, redis, lavalink and bot are healthy.

Options:
  --build-only    only build / pull the image, do not start the stack
  --no-build      skip build / pull, use the existing image
  --timeout SEC   maximum wait time (default: 300 seconds)
  -h, --help      show this help

Exit codes: 0 success, 1 failure (with the last 30 log lines of the failing service), 2 invalid arguments.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=1 ;;
    --no-build) NO_BUILD=1 ;;
    --timeout)
      if [ $# -lt 2 ]; then
        err "--timeout requires a number of seconds."
        exit 2
      fi
      TIMEOUT="$2"
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

if ! matches '^[1-9][0-9]{0,5}$' "$TIMEOUT"; then
  err "--timeout must be a positive integer (seconds)."
  exit 2
fi
if [ "$BUILD_ONLY" = "1" ] && [ "$NO_BUILD" = "1" ]; then
  err "--build-only and --no-build cannot be used together."
  exit 2
fi

require_docker
require_env_file

if [ "$NO_BUILD" = "0" ]; then
  if ! build_or_pull; then
    die "Image build / pull failed. See the errors above."
  fi
  ok "The bot image is ready."
else
  export_build_metadata
  info "Skipping build / pull (--no-build)."
fi

if [ "$BUILD_ONLY" = "1" ]; then
  ok "Done (--build-only): the stack was not started. Run ./scripts/deploy.sh to start it."
  exit 0
fi

info "Starting the stack (docker compose up -d)..."
if ! compose up -d --remove-orphans; then
  die "docker compose up -d failed. See the errors above."
fi

rc=0
wait_stack_ready "$TIMEOUT" || rc=$?
if [ "$rc" -ne 0 ]; then
  err "Deployment did not succeed."
  err "Hint: ./scripts/doctor.sh to diagnose, ./scripts/logs.sh $WAIT_FAILED_SERVICE for the full logs."
  if [ "$WAIT_FAILED_SERVICE" = "bot" ]; then
    err "If the logs show 'Login failed', DISCORD_TOKEN is wrong or has been reset; fix it in .env and run ./scripts/deploy.sh again."
  fi
  exit 1
fi

printf '\n'
compose ps
printf '\n'
ok "Perry is running."
cat <<'EOF'

Next steps:
  - Invite the bot to a server with the link printed at the end of ./scripts/setup.sh (or see the README)
  - ./scripts/logs.sh      view the logs
  - ./scripts/doctor.sh    check the health of the stack
  - ./scripts/update.sh    update to a new version (backs up first)
EOF
