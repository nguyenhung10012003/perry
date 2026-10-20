#!/usr/bin/env bash
# Perry: back up the Postgres database to backups/perry-YYYYmmdd-HHMMSS.dump (pg_dump -Fc).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

QUIET=0
KEEP=""

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/backup.sh [--keep N] [--quiet]

Sao lưu PostgreSQL (pg_dump -Fc) vào backups/perry-YYYYmmdd-HHMMSS.dump (quyền 600),
kiểm tra tệp bằng pg_restore --list rồi xóa các bản cũ vượt quá số lượng giữ lại.
Chỉ các tệp đúng mẫu tên trên bị xóa; tệp khác trong backups/ không bị đụng tới.

Redis KHÔNG được sao lưu: nó chỉ chứa cooldown, cache, snapshot player 6 giờ và hash lệnh
slash, tất cả đều tự tái tạo.

Tùy chọn:
  --keep N     số bản giữ lại (ưu tiên: --keep > biến BACKUP_KEEP > .env > 14)
  --quiet      chỉ in đường dẫn tệp ra stdout
  -h, --help   hiện trợ giúp này

Mã thoát: 0 thành công, 1 thất bại, 2 sai tham số.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --keep)
      if [ $# -lt 2 ]; then
        err "--keep cần một số."
        exit 2
      fi
      KEEP="$2"
      shift
      ;;
    --quiet) QUIET=1 ;;
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
  shift
done

if [ -z "$KEEP" ]; then
  KEEP="$(effective_env BACKUP_KEEP)"
fi
KEEP="${KEEP:-$DEFAULT_BACKUP_KEEP}"
if ! matches '^[1-9][0-9]{0,3}$' "$KEEP"; then
  err "Số bản giữ lại (BACKUP_KEEP / --keep) phải là số nguyên dương."
  exit 2
fi

say() {
  if [ "$QUIET" = "0" ]; then
    "$@"
  fi
}

require_docker
if [ "$(service_state postgres)" != "healthy" ]; then
  die "Dịch vụ postgres chưa chạy hoặc chưa khỏe (hiện: $(state_label "$(service_state postgres)")). Chạy ./scripts/deploy.sh trước."
fi

stamp="$(date +%Y%m%d-%H%M%S)"
dest="$BACKUP_DIR/perry-$stamp.dump"
while [ -e "$dest" ]; do
  sleep 1
  stamp="$(date +%Y%m%d-%H%M%S)"
  dest="$BACKUP_DIR/perry-$stamp.dump"
done

say info "Sao lưu PostgreSQL..."
if ! backup_dump "$dest"; then
  die "Sao lưu thất bại. Không có tệp nào được tạo."
fi

# Retention: only perry-YYYYmmdd-HHMMSS.dump names, newest KEEP stay.
old="$(list_backups | tail -n +"$((KEEP + 1))")"
removed=0
for name in $old; do
  rm -f "$BACKUP_DIR/$name"
  removed=$((removed + 1))
done

say ok "Đã sao lưu: $dest ($(human_size "$(file_size "$dest")"))"
if [ "$removed" -gt 0 ]; then
  say info "Đã xóa $removed bản cũ (giữ $KEEP bản gần nhất)."
fi
say info "Lưu ý: Redis không nằm trong bản sao lưu (chỉ là cache / snapshot, tự tái tạo)."
if [ "$QUIET" = "1" ]; then
  printf '%s\n' "$dest"
fi
