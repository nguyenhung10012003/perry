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
Usage: ./scripts/restore.sh FILE [--yes]
       ./scripts/restore.sh --latest [--yes]

Restores PostgreSQL from a backups/perry-*.dump file. This OVERWRITES the current data:
  1. checks the file with pg_restore --list
  2. asks for confirmation (type yes) unless --yes is given; cannot run non-interactively without --yes
  3. backs up the current state to backups/perry-prerestore-<timestamp>.dump first
  4. stops the bot, runs pg_restore --clean --if-exists, then starts the bot again

Redis is not part of the backup, so it is not restored (caches / snapshots are rebuilt automatically).

Options:
  --latest     use the newest perry-YYYYmmdd-HHMMSS.dump backup
  --yes        do not ask for confirmation
  -h, --help   show this help

Exit codes: 0 success, 1 failure or declined, 2 invalid arguments.
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
      err "Invalid argument: $1"
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$FILE" ]; then
        err "Only one FILE is accepted."
        exit 2
      fi
      FILE="$1"
      ;;
  esac
  shift
done

if [ "$LATEST" = "1" ] && [ -n "$FILE" ]; then
  err "Use FILE or --latest, not both."
  exit 2
fi
if [ "$LATEST" = "0" ] && [ -z "$FILE" ]; then
  err "FILE is missing. Example: ./scripts/restore.sh backups/perry-20240101-120000.dump (or --latest)"
  exit 2
fi
if [ "$YES" = "1" ]; then
  ASSUME_YES=1
fi

if [ "$LATEST" = "1" ]; then
  FILE="$(latest_backup)"
  [ -n "$FILE" ] || die "There are no backups in $BACKUP_DIR."
elif [ ! -f "$FILE" ] && [ -f "$ROOT_DIR/$FILE" ]; then
  FILE="$ROOT_DIR/$FILE"
fi
[ -f "$FILE" ] || die "File not found: $FILE"

require_docker
require_env_file
if [ "$(service_state postgres)" != "healthy" ]; then
  die "The postgres service is not running or not healthy (currently: $(state_label "$(service_state postgres)")). Run ./scripts/deploy.sh first."
fi

info "Checking the backup file..."
if ! validate_dump "$FILE"; then
  die "Invalid file (empty or unreadable by pg_restore --list): $FILE"
fi

printf '\n'
warn "About to restore the 'perry' database from this file (cannot be undone, except with the safety backup below):"
warn "  $FILE ($(human_size "$(file_size "$FILE")"))"
warn "The current data (server settings, play history...) will be replaced by the contents of the file."
warn "The bot will be stopped during the restore. Redis is not restored."
if [ "$ASSUME_YES" != "1" ]; then
  if [ ! -t 0 ]; then
    die "No terminal to confirm on. Add --yes if you are sure you want to continue."
  fi
  if ! confirm "Continue with the restore?" strict; then
    die "Cancelled, nothing was changed."
  fi
fi

mkdir -p "$BACKUP_DIR"
safety="$BACKUP_DIR/perry-prerestore-$(date +%Y%m%d-%H%M%S).dump"
info "Safety backup of the current state: $safety"
if ! backup_dump "$safety"; then
  die "Could not create the safety backup, so stopping here; nothing was changed."
fi

info "Stopping the bot..."
if ! compose stop bot; then
  die "Could not stop the bot, so nothing was restored. Safety backup: $safety"
fi

info "Restoring (pg_restore --clean --if-exists)..."
if ! svc_exec_i postgres pg_restore --clean --if-exists --no-owner --no-privileges -U perry -d perry <"$FILE"; then
  err "pg_restore reported an error. The bot is KEPT STOPPED."
  err "The data from before the restore is in: $safety"
  err "Try again: ./scripts/restore.sh $FILE --yes"
  err "Or go back to the previous state: ./scripts/restore.sh $safety --yes"
  err "When done, start the bot with: ./scripts/deploy.sh --no-build"
  exit 1
fi

info "Starting the bot again..."
if ! compose start bot; then
  die "The restore finished but the bot could not be started. Run ./scripts/deploy.sh --no-build."
fi
ok "Restored from $FILE. Bot: $(state_label "$(service_state bot)")."
info "Safety backup from before the restore: $safety"
info "Note: Redis is not restored (caches / snapshots are rebuilt automatically)."
