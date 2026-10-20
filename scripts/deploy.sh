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
Cách dùng: ./scripts/deploy.sh [tùy chọn]

Build image bot từ mã nguồn (hoặc pull BOT_IMAGE nếu đã đặt trong .env), chạy
docker compose up -d và chờ postgres, redis, lavalink, bot khỏe.

Tùy chọn:
  --build-only    chỉ build / pull image, không chạy stack
  --no-build      bỏ qua build / pull, dùng image có sẵn
  --timeout SEC   thời gian chờ tối đa (mặc định: 300 giây)
  -h, --help      hiện trợ giúp này

Mã thoát: 0 thành công, 1 thất bại (kèm 30 dòng log cuối của dịch vụ lỗi), 2 sai tham số.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=1 ;;
    --no-build) NO_BUILD=1 ;;
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
if [ "$BUILD_ONLY" = "1" ] && [ "$NO_BUILD" = "1" ]; then
  err "--build-only và --no-build không dùng cùng nhau."
  exit 2
fi

require_docker
require_env_file

if [ "$NO_BUILD" = "0" ]; then
  if ! build_or_pull; then
    die "Build / pull image thất bại. Xem lỗi phía trên."
  fi
  ok "Image bot đã sẵn sàng."
else
  export_build_metadata
  info "Bỏ qua build / pull (--no-build)."
fi

if [ "$BUILD_ONLY" = "1" ]; then
  ok "Xong (--build-only): chưa chạy stack. Chạy ./scripts/deploy.sh để khởi động."
  exit 0
fi

info "Khởi động stack (docker compose up -d)..."
if ! compose up -d --remove-orphans; then
  die "docker compose up -d thất bại. Xem lỗi phía trên."
fi

rc=0
wait_stack_ready "$TIMEOUT" || rc=$?
if [ "$rc" -ne 0 ]; then
  err "Triển khai chưa thành công."
  err "Gợi ý: ./scripts/doctor.sh để chẩn đoán, ./scripts/logs.sh $WAIT_FAILED_SERVICE để xem log đầy đủ."
  if [ "$WAIT_FAILED_SERVICE" = "bot" ]; then
    err "Nếu log có 'Login failed' thì DISCORD_TOKEN sai hoặc đã bị reset; sửa trong .env rồi chạy lại ./scripts/deploy.sh."
  fi
  exit 1
fi

printf '\n'
compose ps
printf '\n'
ok "Perry đang chạy."
cat <<'EOF'

Bước tiếp theo:
  - Mời bot vào máy chủ bằng liên kết in ra ở cuối ./scripts/setup.sh (hoặc xem README)
  - ./scripts/logs.sh      xem log
  - ./scripts/doctor.sh    kiểm tra tình trạng
  - ./scripts/update.sh    cập nhật lên phiên bản mới (tự sao lưu trước)
EOF
