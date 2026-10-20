#!/usr/bin/env bash
# Perry: update to the latest version without losing data (backup, git pull, rebuild, recreate, wait).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

DRY_RUN=0
SKIP_BACKUP=0
TIMEOUT="$DEFAULT_WAIT_TIMEOUT"

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/update.sh [tùy chọn]

Cập nhật Perry mà không mất dữ liệu:
  1. sao lưu PostgreSQL (nếu postgres đang chạy khỏe)
  2. git pull --ff-only (chỉ khi thư mục là bản clone git có commit; nếu không thì bỏ qua)
  3. build lại image (hoặc pull BOT_IMAGE), docker compose up -d --remove-orphans
     (Compose chỉ tạo lại dịch vụ có thay đổi), chờ các dịch vụ khỏe
Nếu bước nào thất bại, script in hướng dẫn quay lui và thoát với mã 1. Không tự xóa gì.

Tùy chọn:
  --dry-run       chỉ in các bước sẽ làm, không thay đổi gì
  --skip-backup   bỏ qua bước sao lưu
  --timeout SEC   thời gian chờ tối đa (mặc định: 300 giây)
  -h, --help      hiện trợ giúp này

Mã thoát: 0 thành công, 1 thất bại, 2 sai tham số.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --timeout)
      if [ $# -lt 2 ]; then
        err "--timeout cần một số giây."
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
      err "Tham số không hợp lệ: $1"
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if ! matches '^[1-9][0-9]{0,5}$' "$TIMEOUT"; then
  err "--timeout phải là số nguyên dương (giây)."
  exit 2
fi

require_docker
require_env_file

PREV_SHA=""
PREV_REF=""
BACKUP_FILE=""
if is_git_checkout; then
  PREV_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
  PREV_REF="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi

print_rollback() {
  err "Cập nhật thất bại. Không có dữ liệu nào bị xóa. Cách quay lui:"
  if [ -n "$PREV_SHA" ]; then
    err "  1. Về phiên bản mã nguồn trước đó:  git checkout $PREV_SHA"
    err "     (khi muốn quay lại nhánh: git checkout ${PREV_REF:-main})"
  else
    err "  1. Đây không phải bản clone git: đưa thư mục mã nguồn về phiên bản trước đó bằng tay."
  fi
  err "  2. Chạy lại:                        ./scripts/deploy.sh"
  if [ -n "$BACKUP_FILE" ]; then
    err "  3. Nếu schema database đã đổi (migration chỉ đi một chiều) thì khôi phục dữ liệu:"
    err "                                      ./scripts/restore.sh $BACKUP_FILE"
  else
    err "  3. Chưa có bản sao lưu từ lần cập nhật này; xem các tệp trong backups/ nếu cần khôi phục."
  fi
  err "Chẩn đoán: ./scripts/doctor.sh   Log: ./scripts/logs.sh"
}

pg_state="$(service_state postgres)"
if is_git_checkout; then
  git_plan="git pull --ff-only (đang ở ${PREV_REF:-?} ${PREV_SHA:0:8})"
else
  git_plan="bỏ qua git pull (không phải bản clone git có commit)"
fi
if [ -n "$(effective_env BOT_IMAGE)" ]; then
  build_plan="pull image $(effective_env BOT_IMAGE)"
else
  build_plan="build lại image bot từ mã nguồn"
fi

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Các bước sẽ thực hiện (không có gì bị thay đổi):"
  if [ "$SKIP_BACKUP" = "1" ]; then
    info "  1. bỏ qua sao lưu (--skip-backup)"
  elif [ "$pg_state" = "healthy" ]; then
    info "  1. sao lưu PostgreSQL vào backups/ (./scripts/backup.sh --quiet)"
  else
    info "  1. bỏ qua sao lưu (postgres: $(state_label "$pg_state"))"
  fi
  info "  2. $git_plan"
  info "  3. $build_plan"
  info "  4. docker compose up -d --remove-orphans"
  info "  5. chờ các dịch vụ khỏe (tối đa $TIMEOUT giây)"
  exit 0
fi

# 1. Backup
if [ "$SKIP_BACKUP" = "1" ]; then
  warn "Bỏ qua sao lưu (--skip-backup)."
elif [ "$pg_state" = "healthy" ]; then
  info "Sao lưu PostgreSQL trước khi cập nhật..."
  if ! BACKUP_FILE="$("$ROOT_DIR/scripts/backup.sh" --quiet)"; then
    die "Sao lưu thất bại nên dừng cập nhật (dùng --skip-backup nếu bạn chấp nhận không có bản sao lưu)."
  fi
  ok "Đã sao lưu: $BACKUP_FILE"
else
  warn "Bỏ qua sao lưu: postgres $(state_label "$pg_state") (có thể đây là lần cài đầu tiên)."
fi

# 2. Source
if is_git_checkout; then
  info "git pull --ff-only..."
  if ! GIT_TERMINAL_PROMPT=0 git -C "$ROOT_DIR" pull --ff-only; then
    err "git pull --ff-only thất bại (nhánh đã lệch, có thay đổi cục bộ xung đột hoặc chưa đặt upstream)."
    err "Chưa có gì bị thay đổi. Hãy xử lý git (commit / stash / rebase) rồi chạy lại."
    exit 1
  fi
  ok "Mã nguồn: ${PREV_SHA:0:8} -> $(git -C "$ROOT_DIR" rev-parse --short=8 HEAD)"
else
  info "Không phải bản clone git, bỏ qua git pull. Nếu cần bản mới, hãy tải mã nguồn mới vào thư mục này trước."
fi

# 3. Build / pull
if ! build_or_pull; then
  print_rollback
  exit 1
fi
ok "Image bot đã sẵn sàng."

# 4. Recreate only what changed
info "docker compose up -d --remove-orphans..."
if ! compose up -d --remove-orphans; then
  print_rollback
  exit 1
fi

# 5. Wait
rc=0
wait_stack_ready "$TIMEOUT" || rc=$?
if [ "$rc" -ne 0 ]; then
  print_rollback
  exit 1
fi

printf '\n'
compose ps
printf '\n'
ok "Cập nhật xong. Phiên bản: $PERRY_VERSION (revision $PERRY_REVISION)."
