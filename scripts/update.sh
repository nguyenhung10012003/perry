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
Usage: ./scripts/update.sh [options]

Updates Perry without losing data:
  1. back up PostgreSQL (when postgres is running and healthy)
  2. git pull --ff-only (only when the directory is a git clone with commits; skipped otherwise)
  3. rebuild the image (or pull BOT_IMAGE), docker compose up -d --remove-orphans
     (Compose only recreates services that changed), wait until the services are healthy
If any step fails, the script prints rollback instructions and exits with code 1. It never deletes anything.

Options:
  --dry-run       only print the steps that would run, change nothing
  --skip-backup   skip the backup step
  --timeout SEC   maximum wait time (default: 300 seconds)
  -h, --help      show this help

Exit codes: 0 success, 1 failure, 2 invalid arguments.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
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
  err "Update failed. No data was deleted. To roll back:"
  if [ -n "$PREV_SHA" ]; then
    err "  1. Return to the previous source version:  git checkout $PREV_SHA"
    err "     (to go back to the branch later: git checkout ${PREV_REF:-main})"
  else
    err "  1. This is not a git clone: restore the source directory to the previous version by hand."
  fi
  err "  2. Run again:                               ./scripts/deploy.sh"
  if [ -n "$BACKUP_FILE" ]; then
    err "  3. If the database schema changed (migrations are one-way), restore the data:"
    err "                                             ./scripts/restore.sh $BACKUP_FILE"
  else
    err "  3. No backup was taken during this update; see the files in backups/ if you need to restore."
  fi
  err "Diagnose: ./scripts/doctor.sh   Logs: ./scripts/logs.sh"
}

pg_state="$(service_state postgres)"
if is_git_checkout; then
  git_plan="git pull --ff-only (currently on ${PREV_REF:-?} ${PREV_SHA:0:8})"
else
  git_plan="skip git pull (not a git clone with commits)"
fi
if [ -n "$(effective_env BOT_IMAGE)" ]; then
  build_plan="pull image $(effective_env BOT_IMAGE)"
else
  build_plan="rebuild the bot image from source"
fi

if [ "$DRY_RUN" = "1" ]; then
  info "[dry-run] Steps that would run (nothing is changed):"
  if [ "$SKIP_BACKUP" = "1" ]; then
    info "  1. skip the backup (--skip-backup)"
  elif [ "$pg_state" = "healthy" ]; then
    info "  1. back up PostgreSQL to backups/ (./scripts/backup.sh --quiet)"
  else
    info "  1. skip the backup (postgres: $(state_label "$pg_state"))"
  fi
  info "  2. $git_plan"
  info "  3. $build_plan"
  info "  4. docker compose up -d --remove-orphans"
  info "  5. wait until the services are healthy (up to $TIMEOUT seconds)"
  exit 0
fi

# 1. Backup
if [ "$SKIP_BACKUP" = "1" ]; then
  warn "Skipping the backup (--skip-backup)."
elif [ "$pg_state" = "healthy" ]; then
  info "Backing up PostgreSQL before updating..."
  if ! BACKUP_FILE="$("$ROOT_DIR/scripts/backup.sh" --quiet)"; then
    die "The backup failed, so the update was stopped (use --skip-backup if you accept having no backup)."
  fi
  ok "Backed up: $BACKUP_FILE"
else
  warn "Skipping the backup: postgres is $(state_label "$pg_state") (this may be the first install)."
fi

# 2. Source
if is_git_checkout; then
  info "git pull --ff-only..."
  if ! GIT_TERMINAL_PROMPT=0 git -C "$ROOT_DIR" pull --ff-only; then
    err "git pull --ff-only failed (the branch has diverged, local changes conflict or no upstream is set)."
    err "Nothing has been changed yet. Resolve the git state (commit / stash / rebase) and run again."
    exit 1
  fi
  ok "Source: ${PREV_SHA:0:8} -> $(git -C "$ROOT_DIR" rev-parse --short=8 HEAD)"
else
  info "Not a git clone, skipping git pull. If you need a new version, put the new source code in this directory first."
fi

# 3. Build / pull
if ! build_or_pull; then
  print_rollback
  exit 1
fi
ok "The bot image is ready."

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
ok "Update complete. Version: $PERRY_VERSION (revision $PERRY_REVISION)."
