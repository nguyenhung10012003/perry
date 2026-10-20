#!/usr/bin/env bash
# Perry: follow the logs of the stack (or of the given services).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

TAIL=200
SERVICES=()

usage() {
  cat <<'EOF'
Usage: ./scripts/logs.sh [SERVICE...] [--tail N]

Follows the logs (docker compose logs -f). Services: bot, lavalink, postgres, redis, lavalink-init.
Without a service, all services are shown. Press Ctrl+C to exit.

Options:
  --tail N     number of recent lines shown at start (default: 200)
  -h, --help   show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tail)
      if [ $# -lt 2 ]; then
        err "--tail requires a number of lines."
        exit 2
      fi
      TAIL="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      err "Invalid argument: $1"
      usage >&2
      exit 2
      ;;
    *) SERVICES+=("$1") ;;
  esac
  shift
done

if ! matches '^[0-9]{1,6}$' "$TAIL"; then
  err "--tail must be a non-negative integer."
  exit 2
fi

require_docker
compose logs -f --tail="$TAIL" ${SERVICES[@]+"${SERVICES[@]}"}
