#!/usr/bin/env bash
# Perry: back up the Postgres database to backups/perry-YYYYmmdd-HHMMSS.dump (pg_dump -Fc).
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

QUIET=0
KEEP=""

usage() {
  cat <<'EOF'
Usage: ./scripts/backup.sh [--keep N] [--quiet]

Backs up PostgreSQL (pg_dump -Fc) to backups/perry-YYYYmmdd-HHMMSS.dump (mode 600),
checks the file with pg_restore --list, then deletes old backups beyond the retention count.
Only files matching the name pattern above are deleted; other files in backups/ are left alone.

Redis is NOT backed up: it only holds cooldowns, caches, 6-hour player snapshots and the
slash command hash, all of which are rebuilt automatically.

Options:
  --keep N     number of backups to keep (priority: --keep > BACKUP_KEEP variable > .env > 14)
  --quiet      only print the file path to stdout
  -h, --help   show this help

Exit codes: 0 success, 1 failure, 2 invalid arguments.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --keep)
      if [ $# -lt 2 ]; then
        err "--keep requires a number."
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
      err "Invalid argument: $1"
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
  err "The retention count (BACKUP_KEEP / --keep) must be a positive integer."
  exit 2
fi

say() {
  if [ "$QUIET" = "0" ]; then
    "$@"
  fi
}

require_docker
if [ "$(service_state postgres)" != "healthy" ]; then
  die "The postgres service is not running or not healthy (currently: $(state_label "$(service_state postgres)")). Run ./scripts/deploy.sh first."
fi

stamp="$(date +%Y%m%d-%H%M%S)"
dest="$BACKUP_DIR/perry-$stamp.dump"
while [ -e "$dest" ]; do
  sleep 1
  stamp="$(date +%Y%m%d-%H%M%S)"
  dest="$BACKUP_DIR/perry-$stamp.dump"
done

say info "Backing up PostgreSQL..."
if ! backup_dump "$dest"; then
  die "Backup failed. No file was created."
fi

# Retention: only perry-YYYYmmdd-HHMMSS.dump names, newest KEEP stay.
old="$(list_backups | tail -n +"$((KEEP + 1))")"
removed=0
for name in $old; do
  rm -f "$BACKUP_DIR/$name"
  removed=$((removed + 1))
done

say ok "Backed up: $dest ($(human_size "$(file_size "$dest")"))"
if [ "$removed" -gt 0 ]; then
  say info "Deleted $removed old backup(s) (keeping the $KEEP most recent)."
fi
say info "Note: Redis is not included in the backup (it only holds caches / snapshots that are rebuilt automatically)."
if [ "$QUIET" = "1" ]; then
  printf '%s\n' "$dest"
fi
