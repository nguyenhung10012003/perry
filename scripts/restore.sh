#!/usr/bin/env bash
# Perry: restore the Postgres database from a backup made by backup.sh. Destructive: asks first.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

FILE=""
LATEST=0
YES=0

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/restore.sh FILE [--yes]
           ./scripts/restore.sh --latest [--yes]

Khôi phục PostgreSQL từ một tệp backups/perry-*.dump. THAO TÁC GHI ĐÈ dữ liệu hiện tại:
  1. kiểm tra tệp bằng pg_restore --list
  2. hỏi xác nhận (gõ yes), trừ khi có --yes; không chạy được không tương tác nếu thiếu --yes
  3. tự sao lưu trạng thái hiện tại vào backups/perry-prerestore-<thời gian>.dump
  4. dừng bot, pg_restore --clean --if-exists, rồi bật lại bot

Redis không nằm trong bản sao lưu nên không được khôi phục (cache / snapshot tự tái tạo).

Tùy chọn:
  --latest     dùng bản perry-YYYYmmdd-HHMMSS.dump mới nhất
  --yes        không hỏi xác nhận
  -h, --help   hiện trợ giúp này

Mã thoát: 0 thành công, 1 thất bại hoặc bị từ chối, 2 sai tham số.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --latest) LATEST=1 ;;
    --yes | -y) YES=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      err "Tham số không hợp lệ: $1"
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$FILE" ]; then
        err "Chỉ nhận một FILE."
        exit 2
      fi
      FILE="$1"
      ;;
  esac
  shift
done

if [ "$LATEST" = "1" ] && [ -n "$FILE" ]; then
  err "Dùng FILE hoặc --latest, không dùng cả hai."
  exit 2
fi
if [ "$LATEST" = "0" ] && [ -z "$FILE" ]; then
  err "Thiếu FILE. Ví dụ: ./scripts/restore.sh backups/perry-20240101-120000.dump (hoặc --latest)"
  exit 2
fi
if [ "$YES" = "1" ]; then
  ASSUME_YES=1
fi

if [ "$LATEST" = "1" ]; then
  FILE="$(latest_backup)"
  [ -n "$FILE" ] || die "Không có bản sao lưu nào trong $BACKUP_DIR."
elif [ ! -f "$FILE" ] && [ -f "$ROOT_DIR/$FILE" ]; then
  FILE="$ROOT_DIR/$FILE"
fi
[ -f "$FILE" ] || die "Không tìm thấy tệp: $FILE"

require_docker
require_env_file
if [ "$(service_state postgres)" != "healthy" ]; then
  die "Dịch vụ postgres chưa chạy hoặc chưa khỏe (hiện: $(state_label "$(service_state postgres)")). Chạy ./scripts/deploy.sh trước."
fi

info "Kiểm tra tệp sao lưu..."
if ! validate_dump "$FILE"; then
  die "Tệp không hợp lệ (rỗng hoặc pg_restore --list không đọc được): $FILE"
fi

printf '\n'
warn "Sắp khôi phục cơ sở dữ liệu 'perry' từ tệp sau (không thể hoàn tác, trừ khi dùng bản sao lưu an toàn bên dưới):"
warn "  $FILE ($(human_size "$(file_size "$FILE")"))"
warn "Dữ liệu hiện tại (cài đặt máy chủ, lịch sử phát...) sẽ bị thay bằng nội dung tệp."
warn "Bot sẽ được dừng trong lúc khôi phục. Redis không được khôi phục."
if [ "$ASSUME_YES" != "1" ]; then
  if [ ! -t 0 ]; then
    die "Không có terminal để xác nhận. Thêm --yes nếu bạn chắc chắn muốn tiếp tục."
  fi
  if ! confirm "Tiếp tục khôi phục?" strict; then
    die "Đã hủy, không có gì thay đổi."
  fi
fi

mkdir -p "$BACKUP_DIR"
safety="$BACKUP_DIR/perry-prerestore-$(date +%Y%m%d-%H%M%S).dump"
info "Sao lưu an toàn trạng thái hiện tại: $safety"
if ! backup_dump "$safety"; then
  die "Không tạo được bản sao lưu an toàn nên dừng lại, chưa thay đổi gì."
fi

info "Dừng bot..."
if ! compose stop bot; then
  die "Không dừng được bot nên chưa khôi phục gì. Bản sao lưu an toàn: $safety"
fi

info "Khôi phục (pg_restore --clean --if-exists)..."
if ! svc_exec_i postgres pg_restore --clean --if-exists --no-owner --no-privileges -U perry -d perry <"$FILE"; then
  err "pg_restore báo lỗi. Bot đang ĐƯỢC GIỮ Ở TRẠNG THÁI DỪNG."
  err "Dữ liệu trước khi khôi phục nằm ở: $safety"
  err "Thử lại: ./scripts/restore.sh $FILE --yes"
  err "Hoặc quay về trạng thái cũ: ./scripts/restore.sh $safety --yes"
  err "Sau khi xong, bật bot bằng: ./scripts/deploy.sh --no-build"
  exit 1
fi

info "Bật lại bot..."
if ! compose start bot; then
  die "Khôi phục xong nhưng không bật được bot. Chạy ./scripts/deploy.sh --no-build."
fi
ok "Đã khôi phục từ $FILE. Bot: $(state_label "$(service_state bot)")."
info "Bản sao lưu an toàn trước khi khôi phục: $safety"
info "Lưu ý: Redis không được khôi phục (cache / snapshot sẽ tự tái tạo)."
