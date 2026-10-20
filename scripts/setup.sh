#!/usr/bin/env bash
# Perry: first-time setup. Creates/updates .env, never prints secrets, safe to re-run.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

NON_INTERACTIVE=0
SKIP_DOCKER_CHECK=0

usage() {
  cat <<'EOF'
Cách dùng: ./scripts/setup.sh [tùy chọn]

Tạo tệp .env (từ .env.example), hỏi DISCORD_TOKEN và DISCORD_CLIENT_ID, tự sinh
mật khẩu Lavalink / PostgreSQL / Redis. Chạy lại bao nhiêu lần cũng được: giá trị
đã có không bị ghi đè.

Tùy chọn:
  --non-interactive   không hỏi gì; đọc DISCORD_TOKEN, DISCORD_CLIENT_ID (bắt buộc),
                      DEV_GUILD_ID, LASTFM_API_KEY (tùy chọn) từ biến môi trường
  --env-file PATH     tệp cấu hình (mặc định: .env, hoặc biến PERRY_ENV_FILE)
  --skip-docker-check bỏ qua bước kiểm tra Docker / Compose (chỉ tạo tệp cấu hình)
  -h, --help          hiện trợ giúp này

Mã thoát: 0 thành công, 1 lỗi hoặc giá trị không hợp lệ, 2 sai tham số.
EOF
}

ENV_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --non-interactive) NON_INTERACTIVE=1 ;;
    --skip-docker-check) SKIP_DOCKER_CHECK=1 ;;
    --env-file)
      if [ $# -lt 2 ] || [ -z "$2" ]; then
        err "--env-file cần một đường dẫn."
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
      err "Tham số không hợp lệ: $1"
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
  warn "Bỏ qua kiểm tra Docker (--skip-docker-check)."
else
  require_docker
  ok "Docker và Docker Compose v2 sẵn sàng."
fi

if [ ! -f "$ROOT_DIR/.env.example" ]; then
  die "Không tìm thấy $ROOT_DIR/.env.example."
fi
if [ "$NON_INTERACTIVE" = "0" ] && [ ! -t 0 ]; then
  die "Không có terminal để hỏi. Hãy chạy với --non-interactive và đặt DISCORD_TOKEN, DISCORD_CLIENT_ID trong môi trường."
fi

# --- 2. Resolve and validate every input BEFORE touching the file -----------

RESOLVED=""
MISSING=""
INVALID=""

prompt_value() { # prompt_value LABEL HIDDEN -> stdout
  local label="$1" hidden="$2" value=""
  if [ "$hidden" = "1" ]; then
    printf '%s (ẩn khi gõ): ' "$label" >&2
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
    if [ "$NON_INTERACTIVE" = "1" ] || ! confirm "$key đã có giá trị trong $ENV_FILE. Ghi đè?"; then
      ok "$key: giữ nguyên giá trị hiện có."
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
          warn "$key là bắt buộc."
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
    err "$key không hợp lệ (không in giá trị). Quy tắc: $(rule_text "$key")"
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
    DISCORD_TOKEN) printf 'ít nhất 20 ký tự trong [A-Za-z0-9._~+/=_-], không có khoảng trắng, dấu nháy, $, # hay xuống dòng.' ;;
    DEV_GUILD_ID | DISCORD_CLIENT_ID) printf 'chỉ gồm 17-20 chữ số.' ;;
    LASTFM_API_KEY) printf '8-64 ký tự chữ và số.' ;;
    *) printf 'xem .env.example.' ;;
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
resolve_value DEV_GUILD_ID 0 "$RE_SNOWFLAKE" 0 "DEV_GUILD_ID (tùy chọn, Enter để bỏ qua)"
NEW_DEV_GUILD_ID="$RESOLVED"
resolve_value LASTFM_API_KEY 0 "$RE_LASTFM" 0 "LASTFM_API_KEY (tùy chọn, Enter để bỏ qua)"
NEW_LASTFM_API_KEY="$RESOLVED"

if [ -n "$MISSING" ]; then
  err "Thiếu giá trị bắt buộc:$MISSING"
  if [ "$NON_INTERACTIVE" = "1" ]; then
    err "Hãy đặt các biến này trong môi trường khi chạy --non-interactive."
  fi
fi
if [ -n "$INVALID" ]; then
  err "Giá trị không hợp lệ:$INVALID"
fi
if [ -n "$MISSING$INVALID" ]; then
  die "Chưa ghi gì vào $ENV_FILE."
fi

# --- 3. Create the env file or append keys added by newer versions ----------

if [ ! -f "$ENV_FILE" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  (umask 077 && cp "$ROOT_DIR/.env.example" "$ENV_FILE")
  chmod 600 "$ENV_FILE"
  ok "Đã tạo $ENV_FILE từ .env.example (quyền 600)."
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
      printf '\n# Thêm bởi setup.sh (khóa mới trong .env.example)\n' >>"$ENV_FILE"
    fi
    printf '%s\n' "$line" >>"$ENV_FILE"
    appended=$((appended + 1))
    info "Đã thêm khóa mới: $key"
  done <"$ROOT_DIR/.env.example"
  ok "Dùng tệp cấu hình hiện có $ENV_FILE (quyền 600, thêm $appended khóa mới)."
fi

# --- 4. Write user supplied values ------------------------------------------

write_value() { # write_value KEY VALUE
  if [ -n "$2" ]; then
    env_set "$1" "$2" || die "Không ghi được $1."
    ok "$1: đã đặt."
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
      warn "$key có ký tự ngoài [A-Za-z0-9_-]; DATABASE_URL / REDIS_URL có thể hỏng. Giá trị được giữ nguyên."
    fi
    case " $PASSWORDS_SEEN " in
      *" $current "*) warn "$key trùng với một mật khẩu khác; nên dùng mật khẩu riêng cho từng dịch vụ." ;;
    esac
    PASSWORDS_SEEN="$PASSWORDS_SEEN $current"
    ok "$key: giữ nguyên giá trị hiện có."
    continue
  fi
  generated="$(random_hex 24)"
  while :; do
    case " $PASSWORDS_SEEN " in
      *" $generated "*) generated="$(random_hex 24)" ;;
      *) break ;;
    esac
  done
  env_set "$key" "$generated" || die "Không ghi được $key."
  PASSWORDS_SEEN="$PASSWORDS_SEEN $generated"
  ok "$key: đã tạo (48 ký tự hex)."
done
generated=""
PASSWORDS_SEEN=""

# --- 6. Connection strings for host-run / dev-infra (production compose ignores them) ---

pg_port="$(env_get POSTGRES_PORT)"
redis_port="$(env_get REDIS_PORT)"
matches "$RE_PORT" "$pg_port" || pg_port=5432
matches "$RE_PORT" "$redis_port" || redis_port=6379
if [ -z "$(env_get DATABASE_URL)" ]; then
  env_set DATABASE_URL "postgres://perry:$(env_get POSTGRES_PASSWORD)@127.0.0.1:$pg_port/perry" || die "Không ghi được DATABASE_URL."
  ok "DATABASE_URL: đã đặt (dùng khi chạy bot trên máy host)."
fi
if [ -z "$(env_get REDIS_URL)" ]; then
  env_set REDIS_URL "redis://:$(env_get REDIS_PASSWORD)@127.0.0.1:$redis_port" || die "Không ghi được REDIS_URL."
  ok "REDIS_URL: đã đặt (dùng khi chạy bot trên máy host)."
fi

# --- 7. Lavalink config must be readable by the container user (uid 322) ----

if [ -f "$ROOT_DIR/lavalink/application.yml" ]; then
  chmod a+r "$ROOT_DIR/lavalink/application.yml" || warn "Không chmod được lavalink/application.yml; Lavalink có thể không đọc được tệp này."
fi

# --- 8. Next steps ----------------------------------------------------------

client_id="$(env_get DISCORD_CLIENT_ID)"
printf '\n'
ok "Cấu hình xong. Giá trị bí mật không được in ra; chúng nằm trong $ENV_FILE."
printf '\nLiên kết mời bot vào máy chủ (cần quyền tạo liên kết):\n  https://discord.com/oauth2/authorize?client_id=%s&scope=bot%%20applications.commands&permissions=2150648832\n' "$client_id"
cat <<'EOF'

Bước tiếp theo:
  1. make up              (hoặc ./scripts/deploy.sh; hoặc đơn giản: docker compose up -d)
  2. ./scripts/doctor.sh  kiểm tra tình trạng sau khi chạy
  3. ./scripts/logs.sh    xem log

Nếu YouTube chặn bot (cần OAuth hoặc poToken), xem README: setup.sh không tự động hóa phần này.
EOF
