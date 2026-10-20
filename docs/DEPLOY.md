# Deploying Perry with Docker

**English** | [Tiếng Việt](DEPLOY.vi.md)

Detailed guide for the [README's "Quick deploy" section](../README.md#quick-deploy). Convention: every command **not** marked `not verified` was actually run while testing v1.2 (Docker 27.5.1, Compose 2.32.4, macOS arm64, fake Discord token). The last section lists what has not been verified.

## 1. What the stack contains

`docker compose up -d` (or `make up`) runs five services in the `perry` project:

| Service         | Image                                       | Role                                                                                              |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bot`           | built from `Dockerfile` (or `BOT_IMAGE`)    | The Discord bot, runs as the `node` user with a read-only root filesystem, migrates and registers slash commands by itself |
| `lavalink-init` | `ghcr.io/lavalink-devs/lavalink:4.2.2`      | Runs once to hand the plugin volume over to uid 322, then exits with code 0                       |
| `lavalink`      | `ghcr.io/lavalink-devs/lavalink:4.2.2`      | Audio server; downloads 3 plugins the first time (30-90 seconds)                                  |
| `postgres`      | `postgres:18.6-alpine3.24`                  | Server settings (including the v1.3 language) and the optional play history                       |
| `redis`         | `redis:8.8.3-alpine3.23`                    | Cooldowns, caches, queue snapshots, slash command hash                                            |

- Networks: `lavalink` (Lavalink and the bot) and `data` (PostgreSQL, Redis and the bot). Both are plain bridge networks, not `internal`, because the bot needs an outbound route to Discord. No service has `ports:`; during testing, `PortBindings` was empty for all 4 containers.
- Volumes: `postgres-data`, `redis-data` (AOF on), `lavalink-plugins`. The real names carry the project prefix, for example `perry_postgres-data`.
- Logs: `json-file`, at most 3 files x 10 MB per service.
- The bot gets its configuration through an explicit `environment` list in the compose file (no `env_file`), because `.env` also contains values meant only for running on the host (`DATABASE_URL=...127.0.0.1`, `LAVALINK_HOST=127.0.0.1`). Inside the container, `LAVALINK_HOST=lavalink`, `STORAGE_DRIVER=persistent`, and `DATABASE_URL` and `REDIS_URL` are built from the passwords and service names. `DEFAULT_LOCALE` is passed through (default `en`).
- Compose checks `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `LAVALINK_PASSWORD`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` across the **whole file**, so every `docker compose` command (including `ps`, `logs`, `down`) fails with `<VAR> is not set in .env, run ./scripts/setup.sh` if `.env` is missing or one of these variables is empty.

## 2. Preparing an Ubuntu/Debian server

This section is **not verified** on a real Linux VPS. The bot only makes outbound connections, so no port other than SSH needs to be opened.

```bash
# Install Docker Engine and the Compose plugin following the official apt instructions (not curl | sh):
#   https://docs.docker.com/engine/install/ubuntu/    or    https://docs.docker.com/engine/install/debian/
# Check: docker compose version   (v2 required; tested with 2.32.4)                # not verified on Linux
sudo usermod -aG docker "$USER"      # not verified; log out and back in
sudo apt-get install -y git          # not verified

sudo ufw allow OpenSSH               # not verified
sudo ufw enable                      # not verified
```

Note about `ufw`: ports published by Docker bypass `ufw`, but this stack publishes no ports so it is not affected. Do not add `ports:` for Lavalink, PostgreSQL or Redis.

Minimum sizing: about 2 GB of free RAM (Lavalink defaults to `-Xmx1G`, tune it with `LAVALINK_JAVA_OPTS`); the bot image is about 207 MB.

## 3. First run

```bash
git clone <your-repository-URL> perry && cd perry   # not verified: the test repository has no remote
./scripts/setup.sh
make up
```

What you should see:

- `setup.sh` asks for the token (hidden input) and the Application ID, prints the bot invite link (`Invite link for adding the bot to a server (requires permission to add bots):`) and `Next steps:`. Re-running it changes nothing (`Using the existing config file .env (mode 600, 0 new keys added).`). You can also run `DISCORD_TOKEN=... DISCORD_CLIENT_ID=... ./scripts/setup.sh --non-interactive`, or `--env-file some/path` to write the file elsewhere. Every value is validated before writing: the token may only contain `[A-Za-z0-9._~+/=_-]` (at least 20 characters), IDs are 17-20 digits, the Last.fm key is 8-64 alphanumeric characters; with an invalid value `.env` is left untouched and the command exits with code 1.
- `make up` = `./scripts/deploy.sh`: builds the bot image, starts the stack, then waits (`Waiting for the services to become ready (up to 300 seconds)...`) for `lavalink-init` (exit code 0), `postgres`, `redis`, `lavalink` and `bot` in turn (at most 300 seconds, change it with `--timeout SEC`). On success it prints `Perry is running.`, `docker compose ps` and the next steps. If a service fails, it prints `Last 30 log lines of '<service>':` and exits with code 1. A service whose restart count goes up while waiting is reported as a crash loop right away (`Service '<service>' keeps restarting (crash loop).`), without waiting for the timeout.
- Bot log on every start (observed): `Database migrations applied`, `Redis connected`, `Postgres connected`; then, if the login works, the bot logs its ready line and starts writing the heartbeat (the part after a real login is **not verified**). The `drizzle.__drizzle_migrations` table has exactly 1 row no matter how many times it starts (v1.3: 2 rows, adding `0001_guild_language`).
- With a fake token, the bot logs **exactly one** `Login failed: An invalid token was provided.` line, waits 30 seconds (so Docker does not hammer Discord) and exits so that `restart: unless-stopped` restarts it; that is why `make up` reports failure after about 35-40 seconds (`Deployment did not succeed.`) and `doctor.sh` shows `FAIL bot login`.
- Variant: `docker compose up -d` does the same job: it waits for postgres, redis and lavalink to become healthy (up to ~90 seconds the first time) and then returns, but does not wait for the bot to log in to Discord, and does not build with version labels (the image is labeled `dev`/`unknown`). `./scripts/deploy.sh --build-only` (= `make build`) only builds; `--no-build` skips the build/pull.
- The bot registers the slash commands by itself after a successful login. If `DEV_GUILD_ID` is set, the commands are only registered in that server (instantly); when it is empty they are registered globally (up to ~1 hour to show up). Real registration with Discord is **not verified**.

Logs and status:

```bash
./scripts/logs.sh                 # every service, last 200 lines, then follow
./scripts/logs.sh bot --tail 50   # one service
make ps
```

## 4. Updating and rolling back

```bash
./scripts/update.sh --dry-run     # only prints the steps
./scripts/update.sh               # = make update
```

`update.sh` works in this order: back up PostgreSQL (when the stack is running and healthy; skipped on a first install), `git pull --ff-only` (only for a git clone with commits; otherwise it prints `Not a git clone, skipping git pull.`), rebuild or pull `BOT_IMAGE`, `docker compose up -d --remove-orphans` (only changed services are recreated), then wait until healthy. Options: `--skip-backup`, `--timeout SEC`. On success it prints `Update complete. Version: X (revision Y).`

- If `git pull --ff-only` fails (diverged branch, network down), the command stops with `Nothing has been changed yet.` and exit code 1.
- If a later step fails, the command prints `Update failed. No data was deleted. To roll back:` followed by the rollback steps and exits with code 1; it deletes nothing:
  1. `git checkout <previous-commit>` (the commit hash is printed) and then `./scripts/deploy.sh`;
  2. if the new version's migrations changed the schema, restore the database as well: `./scripts/restore.sh backups/<the-backup-just-created>.dump`. Migrations only go forward; old code does not downgrade the schema by itself.
- The image's `revision` label is the commit SHA after the pull, so `docker image inspect` tells you which version is running.

### Upgrading to v1.3

- `./scripts/update.sh` backs up PostgreSQL first, as always.
- The bot applies migration `0001_guild_language` (adds the `guild_settings.language` column) automatically on startup. When running the bot on the host instead of Docker, run `npm run db:migrate` before starting it; otherwise the bot logs `Database schema is missing or outdated` and runs in degraded mode.
- Optional: set `DEFAULT_LOCALE=vi` in `.env` to keep Vietnamese as the default (v1.3 defaults to English). Re-run `./scripts/setup.sh` to append the new key to an existing `.env` (it prints `Added new key: DEFAULT_LOCALE`), then `./scripts/deploy.sh`.
- The slash commands are re-registered once because their definitions changed (English descriptions with Vietnamese localizations, the new `/settings language` subcommand).
- Bot replies and channel messages switch to English unless the server picks a language with `/settings language` or `DEFAULT_LOCALE=vi` is set. Logs are in English.

## 5. Backups, restore, retention

```bash
./scripts/backup.sh                 # = make backup. Prints the file path and size
./scripts/backup.sh --keep 7        # keep 7 backups (default: BACKUP_KEEP in .env, then 14)
./scripts/backup.sh --quiet         # only print the path (for scripts/cron)
./scripts/restore.sh backups/perry-YYYYmmdd-HHMMSS.dump     # = make restore FILE=...
./scripts/restore.sh --latest --yes # newest backup, no confirmation
```

- `backup.sh` needs a healthy `postgres` service. It runs `pg_dump -Fc` in the container, writes to a temporary file in `backups/` and renames it to `backups/perry-YYYYmmdd-HHMMSS.dump`, checks it with `pg_restore --list` and sets mode `600` (directory `700`); it prints `Backed up: <file> (size)`. The `backups/` directory is excluded by `.gitignore`.
- Retention: only files named exactly `perry-YYYYmmdd-HHMMSS.dump` are pruned beyond `BACKUP_KEEP`. Other files in the directory, including `perry-prerestore-*.dump`, are never deleted automatically.
- `restore.sh` **overwrites** the current PostgreSQL data. It checks the file, requires you to type exactly `yes` (`Continue with the restore?` ... `Type "yes" to continue:`, or `--yes`, or `ASSUME_YES=1`), refuses to run without a terminal when `--yes` is missing, first creates `backups/perry-prerestore-<time>.dump`, stops the bot, runs `pg_restore --clean --if-exists --no-owner --no-privileges`, then starts the bot again (`Restored from <file>. Bot: <state>.`). If `pg_restore` fails, the bot is kept stopped (`pg_restore reported an error. The bot is KEPT STOPPED.`) and the command prints how to retry with the safety backup. Round trip tested: insert a marker row, back up, delete the row, restore, the row is back.
- Redis is **not** backed up: everything in it can be rebuilt (cooldowns, caches, queue snapshots that live 6 hours, the slash command hash).
- Scheduling a daily backup with cron (for example `0 4 * * * cd /path/to/perry && ./scripts/backup.sh --quiet >> /dev/null`): not verified.
- Copy the `backups/*.dump` files somewhere else (another machine, object storage): they contain real data, protect them like `.env`.

## 6. `doctor.sh`

```bash
./scripts/doctor.sh      # = make doctor
```

Prints a `STATUS / CHECK / DETAIL` table with `PASS`, `FAIL`, `WARN` or `SKIP`, and exits with code 1 if there is at least one `FAIL`. Example (rows from a real v1.2 run with a fake token, rewritten with the v1.3 English messages; a few rows omitted; with v1.3 the migrations row reports 2):

```
STATUS CHECK                DETAIL
PASS   docker               Engine 27.5.1
PASS   env permissions      600
PASS   env required         all set: DISCORD_TOKEN DISCORD_CLIENT_ID LAVALINK_PASSWORD POSTGRES_PASSWORD REDIS_PASSWORD
PASS   lavalink-init        completed (exit 0), plugin directory permissions are correct
PASS   container postgres   healthy (restarts: 0)
WARN   container bot        starting (restarts: 1)
PASS   lavalink plugins     youtube, lavasrc, lavalyrics loaded
PASS   postgres migrations  1 migration(s) applied
FAIL   bot login            logs contain 'Login failed': the token is wrong or was reset; fix DISCORD_TOKEN in .env, then ./scripts/deploy.sh
PASS   published ports      no ports are exposed to the host
```

The summary line is `N error(s), M warning(s). See ./scripts/logs.sh <service> for details.`, `No serious errors, M warning(s).` or `All checks passed.`

- It only prints variable names and the shape of the token, never values. The Lavalink password is expanded inside the container and never appears on the host.
- It finds containers through Compose labels, so it works even when `.env` is missing or the stack is stopped (the rows are then `FAIL ... not running` or `SKIP`, without crashing).
- The `bot login` row only detects a `Login failed` line in the last 200 log lines. A `healthy` bot container only means the heartbeat is fresh; with a real bot that requires a successful Discord login (**not verified**).

## 7. Resource limits

`docker-compose.yml` contains a commented-out example for `bot` and `lavalink`. Uncomment it and tune it for your VPS:

```yaml
deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 1536M # Lavalink: keep it larger than the -Xmx heap in LAVALINK_JAVA_OPTS
```

Applying these limits has not been verified. To lower `-Xmx`, set `LAVALINK_JAVA_OPTS=-Xmx512M` in `.env`, then `docker compose up -d`.

## 8. Using a prebuilt image (`BOT_IMAGE`, GHCR)

By default the stack builds the bot from source and needs no registry account. If the project owner publishes images, set in `.env`:

```
BOT_IMAGE=ghcr.io/<owner>/<repo>:1.3.0
```

When `BOT_IMAGE` is set, `deploy.sh` and `update.sh` run `docker compose pull bot` instead of building. Only the failure path (the image cannot be pulled) has been tried; pulling a real image is **not verified**.

- The `.github/workflows/release.yml` workflow builds `linux/amd64` and `linux/arm64` when a `v*` tag is pushed and pushes to `ghcr.io/<lowercased github.repository>` with the tags `<version>`, `<major>.<minor>` and `latest` (`latest` is only applied to stable releases, not to pre-release tags such as `v1.3.0-rc1`), using `GITHUB_TOKEN` (the `packages: write` permission is only granted at job level). This workflow has only been written and checked with actionlint; it has not run on GitHub.
- A newly created GHCR package is usually private. On the server, run `docker login ghcr.io` with a token that has `read:packages`, or make the package public in its settings on GitHub (not verified).
- The `ci.yml` workflow (every push to `main` and every pull request) runs typecheck, lint, build, `check-commands`, shellcheck, a `docker build` without pushing, `docker compose config` for both compose files and a comparison of the image tags between them (on a mismatch it prints `Image tags differ between docker-compose.yml and docker-compose.dev.yml:`). Its shell commands have been re-run locally; the workflow itself has not run on GitHub.

## 9. Development infrastructure

`docker-compose.dev.yml` only contains Lavalink, PostgreSQL and Redis for `npm run dev`, bound to `127.0.0.1`.

```bash
make dev-infra            # Lavalink + PostgreSQL + Redis (= docker compose -f docker-compose.dev.yml --profile storage up -d)
make dev-infra-down       # stop, keep the data
docker compose -f docker-compose.dev.yml up -d lavalink    # Lavalink only, STORAGE_DRIVER=memory mode
```

For ports, variables and how to run the bot on the host, see the [README section "Running the development infrastructure"](../README.md#running-the-development-infrastructure-lavalink-postgresql-redis). When running on the host, remember `npm run db:migrate` after upgrading to v1.3. Both compose files must keep the same image tags; CI checks this.

## 10. Upgrading from the v1.1 dev stack

The v1.1 dev stack used the `perry-lavalink` project with the `postgres-data`/`redis-data` volumes (full names prefixed with `perry-lavalink_`), while the production stack uses the `perry` project with its own volumes, so the data is **not** carried over automatically. `docker-compose.dev.yml` keeps the v1.1 project, volume and network names, so old dev data is reattached when you run `make dev-infra`. The plugin cache used to be a `lavalink/plugins/` bind mount; it is now a volume, so the plugins are downloaded once more.

To move server settings from the dev stack to production (the whole procedure below is **not verified** because it needs real v1.1 data):

```bash
# 1. Start the old dev stack and export the data (file name matching the pattern so --latest finds it)
make dev-infra
mkdir -p backups
docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U perry -d perry -Fc > backups/perry-$(date +%Y%m%d-%H%M%S).dump   # not verified
make dev-infra-down

# 2. Start the production stack and restore into it
./scripts/setup.sh
make up
./scripts/restore.sh --latest      # not verified with real v1.1 data
```

The PostgreSQL password in `.env` must be the old dev stack's password while exporting (the dump contains no passwords, so restoring into a new stack with a new password is fine). Schema check: after the restore, the bot runs any missing migrations (including `0001_guild_language`) when it restarts.

## 11. Security checklist

- [ ] `.env` has mode `600` and is not in git (`doctor.sh` checks the mode).
- [ ] The Discord token has never been pasted into logs, issues or chat. If it leaked: **Reset Token**, fix `.env`, `./scripts/deploy.sh`.
- [ ] No `ports:` for Lavalink, PostgreSQL, Redis (`doctor.sh` row `published ports`). On the VPS only SSH is open.
- [ ] Only trusted people are in the `docker` group (it is equivalent to root; the passwords are in the containers' environment variables and in the Redis process arguments, readable with `docker inspect`).
- [ ] The `backups/` directory has mode `700`, the files `600`, and off-machine copies are protected equally.
- [ ] Security updates are enabled for the VPS operating system and `./scripts/update.sh` is run regularly to pick up bot image patches.
- [ ] Passwords are changed by editing `.env`, then `docker compose up -d` (not verified on a running stack). `POSTGRES_PASSWORD` only takes effect while the volume is empty: after the first run, change it with `ALTER USER` in PostgreSQL.
- [ ] If you run the bot publicly: read the limits of the SSRF filter in the [README section "Security"](../README.md#security).

Checked on the real image and stack: the bot runs as uid 1000 (`node`), with a read-only root filesystem (writing to `/` is denied, `/tmp` is writable), `cap_drop: ALL`, `no-new-privileges`, `init: true`; generated tokens and passwords do not appear in the stack logs, in `docker history` or in `docker image inspect` of the bot image.

## 12. arm64 and amd64

- All four base images (`node:24.22.0-alpine3.24`, `ghcr.io/lavalink-devs/lavalink:4.2.2`, `postgres:18.6-alpine3.24`, `redis:8.8.3-alpine3.23`) have `linux/amd64` and `linux/arm64` variants; checked with `docker buildx imagetools inspect`.
- The bot's runtime dependency tree has no native modules (77 packages, none with install scripts or `os`/`cpu` constraints), so `node_modules` is shared across architectures. The `Dockerfile` has a check step that fails the build if such a runtime package shows up later.
- Actually built on arm64 (the test machine). The `linux/amd64` image was built and run through emulation and printed `x64`; running it directly on an amd64 machine is **not verified**.
- A single `docker buildx build --platform linux/amd64,linux/arm64` command does not work with the test machine's default `docker` driver ("Multi-platform build is not supported for the docker driver"); GitHub Actions uses `setup-buildx-action` so it does not hit this limit, but it has not run.

## 13. Complete removal

```bash
make down                        # stop, keep the data
docker compose down -v           # ALSO DELETES the PostgreSQL, Redis and plugin cache volumes (cannot be undone)
```

Run `./scripts/backup.sh` and copy the backup off the machine before using `down -v`.

## 14. Not verified

- A real Discord login inside the container: the heartbeat after ready, `HEALTHCHECK` turning `healthy`, registering the slash commands with Discord, real audio playback.
- Graceful shutdown with a real gateway and voice player (only the shutdown path before login was tried).
- A real Linux VPS: installing Docker from apt, `ufw`, `usermod`, permissions for bind mounts on Linux, bash/GNU userland for `backup.sh`, `restore.sh`, `update.sh`, `doctor.sh` (macOS bash 3.2 ran all of them; `setup.sh` was also run in Debian 12).
- Windows (WSL2, Git Bash), Docker Compose older than 2.32.
- `git clone` from a real remote repository; `git pull --ff-only` was only tried with a fake repository in `/tmp`.
- Pulling an image from a real registry with `BOT_IMAGE`; GHCR (pushing images, permissions, package visibility).
- Running `ci.yml` and `release.yml` on GitHub (only actionlint and local re-runs of the shell commands); a local multi-platform build with a single buildx command.
- Running the `linux/amd64` image directly on an amd64 machine.
- Cron backups, rotating passwords on a running stack, the sample resource limits, the data migration procedure from the v1.1 dev stack, restoring into a database whose schema differs from the current code.
- First build time on a clean machine; real disk and RAM usage on a VPS.
- v1.3: how localized commands render in real Discord clients, `/settings language` in a real server, upgrading a real running stack (details in the README).
- Every item listed in the [README section "What has not been verified at runtime"](../README.md#what-has-not-been-verified-at-runtime) (v1 and v1.1) still applies.
