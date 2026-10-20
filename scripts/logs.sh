#!/usr/bin/env bash
# Perry: follow the logs of the stack (or of the given services).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

TAIL=200
SERVICES=()

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/logs.sh [SERVICE...] [--tail N]

Theo dõi log (docker compose logs -f). Service: bot, lavalink, postgres, redis, lavalink-init.
Không chỉ định dịch vụ thì xem tất cả. Nhấn Ctrl+C để thoát.

Tùy chọn:
  --tail N     số dòng cuối hiện lúc bắt đầu (mặc định: 200)
  -h, --help   hiện trợ giúp này
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tail)
      if [ $# -lt 2 ]; then
        err "--tail cần một số dòng."
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
      err "Tham số không hợp lệ: $1"
      usage >&2
      exit 2
      ;;
    *) SERVICES+=("$1") ;;
  esac
  shift
done

if ! matches '^[0-9]{1,6}$' "$TAIL"; then
  err "--tail phải là số nguyên không âm."
  exit 2
fi

require_docker
compose logs -f --tail="$TAIL" ${SERVICES[@]+"${SERVICES[@]}"}
