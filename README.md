# Perry - Discord music bot (TypeScript)

**English** | [Tiếng Việt](README.vi.md)

A multi-server Discord bot written in TypeScript (discord.js 14) that plays music through the [Lavalink](https://lavalink.dev) 4.2.2 audio server. Version 1.1 added persistent storage (PostgreSQL + Redis), music discovery (autoplay, radio, similar tracks) and session restore after a restart. Version 1.2 packaged everything as a Docker image and a Docker Compose stack that runs with three commands, plus scripts for setup, updates, backups and diagnostics. Version 1.3 (current) internationalizes the bot: English is the default, Vietnamese can be chosen per server (see [Language](#language)). The bot has a modular structure so other feature groups (moderation, leveling, ...) can be added later.

## Quick deploy

From `git clone` to a running bot in three commands, with Docker Compose (bot + Lavalink + PostgreSQL + Redis in one file). Every command below was actually run while testing v1.2, except lines explicitly marked `not verified`.

### Requirements

- Docker Engine with Docker Compose v2 (check with `docker compose version`), about 2 GB of free RAM. Tested with Engine 27.5.1 and Compose 2.32.4 on macOS (Docker Desktop, arm64).
- Linux or macOS. Windows: use WSL2 (not verified).
- A bot application created on Discord: see [Create the bot application and get the token](#create-the-bot-application-and-get-the-token) to get `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`, and [Invite link](#invite-link) to invite the bot to a server.

### Three commands

```bash
git clone <your-repository-URL> perry && cd perry   # not verified: this repository has no remote yet, so cloning was not tested
./scripts/setup.sh
docker compose up -d                                 # or: make up
```

- `./scripts/setup.sh` asks for `DISCORD_TOKEN` (hidden input) and `DISCORD_CLIENT_ID`, generates three random passwords for Lavalink, PostgreSQL and Redis, creates `.env` with mode `600`, then prints the bot invite link. It can be run any number of times; existing values are never overwritten. It never prints the token or passwords.
- `make up` (or `./scripts/deploy.sh`) builds the image, starts the stack and **waits until the services are healthy**; otherwise it prints the last 30 log lines of the failing service. `docker compose up -d` waits for postgres, redis and lavalink to become healthy (up to ~90 seconds the first time) and then returns, but does not wait for the bot to log in to Discord; use `make up` to also wait for the bot and print logs on failure.
- The first time, Lavalink downloads 3 plugins, which takes about 30-90 seconds. The first image build time on a clean machine has not been measured (the test run had a warm layer cache).
- The bot runs the database migrations and registers the slash commands by itself on startup (see [Registering slash commands](#registering-slash-commands)).
- Unattended runs (CI, scripts): `DISCORD_TOKEN=... DISCORD_CLIENT_ID=... ./scripts/setup.sh --non-interactive`.
- Use `make up` rather than `docker compose up -d` if you want correct version/commit labels on the image (the latter labels it `dev`/`unknown`).

Then check with `./scripts/doctor.sh` (or `make doctor`) and view the logs with `./scripts/logs.sh`.

### Ubuntu/Debian VPS step by step

The bot only makes **outbound** connections (Discord, internal Lavalink), so no inbound port other than SSH needs to be opened. The operating system setup steps below are **not verified** because they have not been tried on a real Linux VPS:

```bash
# 1. Install Docker Engine + the Compose plugin following the official apt instructions, not curl | sh:
#    https://docs.docker.com/engine/install/ubuntu/   (or /debian/)            # not verified
sudo usermod -aG docker "$USER"    # not verified; log out and back in for it to take effect
sudo apt-get install -y git        # not verified

# 2. Firewall: only SSH is needed (this stack publishes no ports)
sudo ufw allow OpenSSH             # not verified
sudo ufw enable                    # not verified

# 3. Get the source, configure, run
git clone <your-repository-URL> perry && cd perry   # not verified
./scripts/setup.sh
make up
```

Step 3 (`setup.sh`, `make up`) was actually run on Docker Desktop; `setup.sh` was also run in a Debian 12 container (bash 5, GNU coreutils, no `openssl`). Step-by-step details and expected logs: [docs/DEPLOY.md](docs/DEPLOY.md).

### Updates, backups, logs and diagnostics

```bash
./scripts/update.sh        # or: make update. Backs up PostgreSQL, git pull --ff-only, rebuilds, recreates only changed services
./scripts/update.sh --dry-run   # only prints the steps, changes nothing
./scripts/backup.sh        # or: make backup  -> backups/perry-YYYYmmdd-HHMMSS.dump (mode 600, keeps 14)
./scripts/restore.sh backups/perry-YYYYmmdd-HHMMSS.dump   # or: make restore FILE=backups/perry-....dump
./scripts/restore.sh --latest --yes                      # restore the newest backup without asking
./scripts/logs.sh bot --tail 100   # or: make logs SERVICE=bot
./scripts/doctor.sh        # or: make doctor. PASS/FAIL/WARN table; exits 1 if there is a FAIL
make ps                    # container status
make down                  # stop the stack, KEEP the data
```

- `update.sh` backs up before doing anything else; if `git pull --ff-only` or a later step fails, it prints how to roll back (the backup, the previous commit) and deletes nothing. Migrations only go forward: going back to old code after the schema has changed requires restoring the database as well.
- `restore.sh` is a **destructive** operation: it asks you to type `yes` (or needs `--yes`), first backs up to `backups/perry-prerestore-*.dump`, stops the bot, overwrites the PostgreSQL data and then starts the bot again. Without a terminal and without `--yes` it refuses.
- Redis is **not** included in the backup: it only holds cooldowns, caches, queue snapshots (6 hours) and the slash command hash, all of which are rebuilt automatically.
- `make down` keeps the volumes. Do not run `docker compose down -v` unless you want to wipe the PostgreSQL, Redis and plugin cache data.
- Number of backups kept: `BACKUP_KEEP` in `.env` (default 14); only `perry-YYYYmmdd-HHMMSS.dump` files are pruned, `perry-prerestore-*` files are never deleted automatically.
- `make down`, `make ps` and `make restart` call `docker compose` directly, so they need a complete `.env` (Compose checks the required variables across the whole file).

Quick fixes:

| Symptom                                                              | Fix                                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `make up` reports `crash loop` or the bot is not healthy             | `./scripts/doctor.sh`; if it shows `Login failed`, `DISCORD_TOKEN` is wrong or has been reset: fix `.env`, then `./scripts/deploy.sh`. |
| The bot restarts every 30-60 seconds                                 | Wrong token: the bot waits 30 seconds after a failed login and then exits so Docker restarts it, to avoid hammering Discord.      |
| Lavalink is not `healthy` on the first run                           | Wait 30-90 seconds for the 3 plugins to download; see `./scripts/logs.sh lavalink`.                                              |
| Changed `POSTGRES_PASSWORD` after the first run and the bot cannot reach the DB | The password only applies while the volume is empty; change it with `ALTER USER` in PostgreSQL or restore into a new volume. |
| Compose reports a missing `DISCORD_TOKEN`, `LAVALINK_PASSWORD`, ...  | `.env` is missing or empty (`<VAR> is not set in .env, run ./scripts/setup.sh`): run `./scripts/setup.sh`.                       |

### Running the bot without Docker

You can run the bot directly with Node.js (>= 22.13); you then provide Lavalink, PostgreSQL and Redis yourself (or use the [development infrastructure](#running-the-development-infrastructure-lavalink-postgresql-redis) with Docker Compose). Keep the steps in [Configuring `.env`](#configuring-env), [Storage](#storage-postgresql--redis) and [Running the bot](#running-the-bot):

```bash
npm ci
npm run db:migrate         # or set AUTO_MIGRATE=true so the bot migrates on startup
npm run build && npm start
```

`AUTO_MIGRATE`, `REGISTER_COMMANDS_ON_START` and `HEARTBEAT_FILE` are **off** by default when running with `npm start` (same behavior as v1.1); only the Docker image turns them on. When upgrading a host install to v1.3, run `npm run db:migrate` before starting the bot (see [Language](#language)).

### Security notes for deployment

- The bot container runs as the `node` user (uid 1000), with a read-only root filesystem (only `/tmp` is writable), `cap_drop: ALL` and `no-new-privileges`. The bot opens no HTTP port.
- No service publishes a port to the host in `docker-compose.yml`: Lavalink, PostgreSQL and Redis only live on Docker's private networks (`PortBindings` was checked to be empty for all 4 containers). Do not add `ports:` for them.
- `.env` has mode `600`; do not commit it, and do not paste it into issues or chat. If the token leaks, go to the Developer Portal, choose **Reset Token**, fix `.env` and run `./scripts/deploy.sh`.
- Changing the Lavalink/Redis password: edit `.env`, then `docker compose up -d` (recreates the containers). For the PostgreSQL password see the table above.
- Note: the Redis and PostgreSQL passwords are in the bot container's environment variables (`REDIS_URL`, `DATABASE_URL`) and in the Redis process arguments, so members of the `docker` group (equivalent to root) can read them with `docker inspect`. Only give `docker` group membership to trusted people.
- The image contains no `.env`, token or password (checked with `docker history`, `docker image inspect` and the stack logs).

### Detailed documentation

[docs/DEPLOY.md](docs/DEPLOY.md): full VPS guide, updates and rollback (including upgrading to v1.3), backups, `doctor.sh` explained, resource limits, using a prebuilt image from GHCR (`BOT_IMAGE`), upgrading from the v1.1 dev stack, list of unverified items.

## Features

- Plays music from YouTube, YouTube Music, SoundCloud and some direct links (Vimeo, Bandcamp, Twitch, `http(s)` audio files), with keyword search and autocomplete suggestions.
- Control commands: play, pause, resume, skip, play the previous track again, stop, seek, volume, loop, shuffle, queue management, audio filters, lyrics.
- A "Now playing" message with buttons (pause, skip, stop, loop, shuffle, queue).
- Works on many servers at once: queues, settings and timers are all separate per server.
- DJ role and per-server settings via `/settings`; settings are stored in PostgreSQL so they survive restarts.
- Moderation (v1.4): `/ban`, `/unban`, `/kick`, `/timeout`, `/warn`, `/warnings`, `/case` and `/purge`, numbered cases per server, a mod-log channel and an optional DM to the user (see [Moderation](#moderation)).
- Leveling (v1.4): members earn XP for their messages (off until a server manager turns it on), levels on a fixed curve, `/rank`, a paged `/leaderboard`, `/xp` for admins, level-up messages and role rewards (see [Leveling](#leveling)).
- Music discovery: `/autoplay` (adds suggested tracks when the queue runs out), `/radio` (plays continuously from a track or a query), `/similar` (browse and pick similar tracks).
- Playlist and YouTube Mix links are added to the queue in full, starting from the selected video.
- Restores the playback session after the bot restarts: the bot rejoins the voice channel and continues the queue.
- Redis is used for cooldowns, rate limits, caches and queue snapshots; there is a degraded mode when PostgreSQL or Redis is unavailable.
- Leaves the voice channel automatically when the bot is alone (60 seconds) or when the queue has been empty for too long (3 minutes).
- Bilingual: English (default) and Vietnamese, chosen per server with `/settings language` or as the bot default with `DEFAULT_LOCALE` (see [Language](#language)). Logs are always in English.

## Requirements

- Docker deployment (recommended): only Docker Engine with Compose v2 is needed; Node.js does not have to be installed on the server because the bot is built inside the image.
- Running the bot directly or developing: Node.js >= 22.13 (24 LTS recommended, see `.nvmrc`) plus Docker Compose for the infrastructure (or Java 17+ if you run Lavalink yourself without Docker). PostgreSQL and Redis can be skipped with `STORAGE_DRIVER=memory` (see the Storage section).
- A Discord account to create the bot application.

## Create the bot application and get the token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and choose **New Application**.
2. **General Information** tab: copy the **Application ID**. This is the `DISCORD_CLIENT_ID` value.
3. **Bot** tab: choose **Reset Token** to get the token; this is `DISCORD_TOKEN`. The token is shown only once; do not share it and do not put it in git.
4. The bot uses the `Guilds`, `GuildVoiceStates` and (since v1.4, for XP from messages) `GuildMessages` intents. None of them is privileged and nothing has to be switched on in the portal: the bot never reads message content. **Do not enable** any Privileged Gateway Intent (Presence, Server Members, Message Content).
5. To invite the bot to many servers, enable **Public Bot** in the **Bot** tab (it is on by default for new applications; if it is off, only the application owner can invite the bot).

## Invite link

Replace `<DISCORD_CLIENT_ID>` with your Application ID:

```
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot%20applications.commands&permissions=1101930785798
```

- Scope: `bot applications.commands`.
- Permissions (permissions = `1101930785798`): View Channels, Send Messages, Embed Links, Connect, Speak, Use Slash Commands, Manage Roles for leveling (v1.4: the bot gives and removes the role rewards), and for moderation (v1.4):
  - Kick Members: `/kick`.
  - Ban Members: `/ban` and `/unban`.
  - Timeout Members (`ModerateMembers`): `/timeout`.
  - Manage Messages: `/purge` deletes other users' messages.
  - Read Message History: `/purge` reads the recent messages of the channel.
- The value `1101930785798` was computed with discord.js `PermissionsBitField`: the v1.3 permissions (1024 + 2048 + 16384 + 1048576 + 2097152 + 2147483648 = `2150648832`) plus 2 + 4 + 1099511627776 + 8192 + 65536 for moderation and 268435456 (Manage Roles) for leveling.
- Servers that added the bot before v1.4: the bot's role does not get the new permissions by itself. Open the new link again (whether re-authorizing updates the bot's role has not been verified) or grant the permissions to the bot's role by hand. The bot's role must also sit above the members it should moderate and above every level reward role (Server Settings > Roles).

## Configuring `.env`

Quick way: `./scripts/setup.sh` creates `.env` from `.env.example`, asks for the token and Application ID, generates the passwords and fills in `DATABASE_URL` / `REDIS_URL` for running on the host. It is safe to re-run (existing values are not overwritten); when `.env.example` gains new keys, the script appends them to the existing `.env` (it prints `Added new key: KEY`).

Manual way:

```bash
cp .env.example .env
# Run 3 times and use each result as LAVALINK_PASSWORD, POSTGRES_PASSWORD and REDIS_PASSWORD
openssl rand -hex 24
```

The token, Application ID and passwords in `.env.example` are intentionally empty: Docker Compose and the bot both refuse to start until you fill in real values. Prefer hex strings (only `[A-Za-z0-9_-]` characters) so that `DATABASE_URL` and `REDIS_URL` contain no characters that need encoding. When editing `.env` by hand, do not put spaces, quotes, `$`, `#` or backticks in the token and password values.

Edit `.env` (the file is already in `.gitignore`; never commit it):

| Variable                      | Required | Meaning                                                                                                                                                                                                                |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`               | Yes      | Bot token.                                                                                                                                                                                                             |
| `DISCORD_CLIENT_ID`           | Yes      | Application ID.                                                                                                                                                                                                        |
| `DEV_GUILD_ID`                | No       | ID of the server used to register commands instantly during development.                                                                                                                                              |
| `LAVALINK_HOST`               | Yes\*\*  | Lavalink address, default `127.0.0.1`. Only when the bot runs on the host; `docker-compose.yml` sets it to `lavalink`.                                                                                                 |
| `LAVALINK_PORT`               | Yes\*\*  | Lavalink port, default `2333`. On the host, this is the port `docker-compose.dev.yml` publishes (on `127.0.0.1` only).                                                                                                 |
| `LAVALINK_PASSWORD`           | Yes      | Password shared by the bot and Docker Compose (both report an error when it is empty). Use only `[A-Za-z0-9_-]` characters.                                                                                           |
| `LAVALINK_SECURE`             | No       | `true` when Lavalink is behind TLS. With `true`, the library requires port `443`. The Docker stack always sets `false`.                                                                                                |
| `LOG_LEVEL`                   | No       | `fatal`, `error`, `warn`, `info` (default), `debug`, `trace`, `silent`. Stack traces are only logged at `debug`/`trace`.                                                                                               |
| `LOG_PRETTY`                  | No       | `true` for human-readable logs (pino-pretty) instead of JSON.                                                                                                                                                          |
| `STORAGE_DRIVER`              | No       | `persistent` (default: PostgreSQL + Redis) or `memory` (everything in memory, nothing is stored). The Docker stack always uses `persistent`.                                                                           |
| `DATABASE_URL`                | Yes\*\*  | PostgreSQL connection string when running on the host with `persistent`; also used by `npm run db:migrate`. Format `postgres://perry:<POSTGRES_PASSWORD>@127.0.0.1:<POSTGRES_PORT>/perry`. `docker-compose.yml` builds its own URL for the container. |
| `REDIS_URL`                   | Yes\*\*  | Redis connection string when running on the host with `persistent`. Format `redis://:<REDIS_PASSWORD>@127.0.0.1:<REDIS_PORT>`. `docker-compose.yml` builds its own URL for the container.                             |
| `POSTGRES_PASSWORD`           | Yes\*    | PostgreSQL password, only read by Docker Compose; must match `DATABASE_URL`.                                                                                                                                           |
| `REDIS_PASSWORD`              | Yes\*    | Redis password, only read by Docker Compose; must match `REDIS_URL`.                                                                                                                                                   |
| `POSTGRES_PORT`               | No       | PostgreSQL port on `127.0.0.1` (default `5432`), only read by `docker-compose.dev.yml`. Change it on a conflict and update `DATABASE_URL` accordingly.                                                                |
| `REDIS_PORT`                  | No       | Redis port on `127.0.0.1` (default `6379`), only read by `docker-compose.dev.yml`. Change it on a conflict and update `REDIS_URL` accordingly.                                                                         |
| `BOT_IMAGE`                   | No       | Empty: build the image from source. Set it (for example `ghcr.io/<owner>/<repo>:1.3.0`) so `deploy.sh`/`update.sh` pull a prebuilt image. Only read by Docker Compose and the scripts.                                |
| `AUTO_MIGRATE`                | No       | `true` to make the bot run migrations on startup (a PostgreSQL advisory lock prevents concurrent runs). Default `true` in the image/compose, `false` with `npm start`.                                                 |
| `REGISTER_COMMANDS_ON_START`  | No       | `true` to make the bot register the slash commands when ready, only when the command definitions changed. Default `true` in the image/compose, `false` with `npm start`.                                               |
| `REGISTER_COMMANDS_FORCE`     | No       | `true` to skip the hash comparison and always re-register the commands on startup. Default `false`.                                                                                                                   |
| `BACKUP_KEEP`                 | No       | Number of PostgreSQL backups kept by `scripts/backup.sh` (default `14`).                                                                                                                                               |
| `REDIS_KEY_PREFIX`            | No       | Prefix of every Redis key (`[a-z0-9_-]`, at most 32 characters, default `perry`). Keys look like `<prefix>:v1:...`.                                                                                                   |
| `PLAYER_RESTORE`              | No       | `true` (default) to rejoin the voice channel and continue the queue after a restart.                                                                                                                                  |
| `PLAY_HISTORY`                | No       | `true` to record every played track (with the requester's ID) in PostgreSQL. Default `false`.                                                                                                                         |
| `PUBSUB_INVALIDATION`         | No       | `true` to let several bot processes share settings invalidation through Redis pub/sub. Default `false`.                                                                                                               |
| `DEFAULT_LOCALE`              | No       | Default bot language (v1.3): `en` (default) or `vi`; empty = `en`. Used for servers that have not chosen a language with `/settings language`, for the bot's presence text and for the reply in direct messages. Any other value makes the bot refuse to start. |
| `DISCOVERY_PROVIDERS`         | No       | Order of the suggestion providers, default `ytmix,lastfm,lavasrc,artist`.                                                                                                                                             |
| `LASTFM_API_KEY`              | No       | Last.fm API key (free). Empty means the `lastfm` provider is skipped.                                                                                                                                                 |
| `DISCOVERY_LAVASRC_PREFIX`    | No       | `dzrec`, `ymrec`, `vkrec` or `qbrec`. Empty means the `lavasrc` provider is skipped.                                                                                                                                  |
| `DISCOVERY_MIN_DURATION_SEC`  | No       | Suggested tracks shorter than this (seconds) are skipped. Default `60`.                                                                                                                                               |
| `DISCOVERY_MAX_DURATION_SEC`  | No       | Suggested tracks longer than this (seconds) are skipped. Default `1200`.                                                                                                                                              |
| `LAVALINK_JAVA_OPTS`          | No       | Lavalink JVM options (default `-Xmx1G`), only read by Docker Compose.                                                                                                                                                 |
| `LAVASRC_SPOTIFY_ENABLED`     | No       | `true` to enable Spotify links, only read by Docker Compose.                                                                                                                                                          |
| `SPOTIFY_CLIENT_ID`           | No       | Spotify application Client ID.                                                                                                                                                                                        |
| `SPOTIFY_CLIENT_SECRET`       | No       | Spotify application client secret.                                                                                                                                                                                    |
| `SPOTIFY_COUNTRY_CODE`        | No       | Spotify market country code (default `US`).                                                                                                                                                                           |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | No       | Used when OAuth is enabled for YouTube (see below).                                                                                                                                                                   |
| `YOUTUBE_PO_TOKEN`            | No       | Used when poToken is enabled for YouTube.                                                                                                                                                                             |
| `YOUTUBE_VISITOR_DATA`        | No       | Goes together with `YOUTUBE_PO_TOKEN`.                                                                                                                                                                                |

\* Required for the Docker stack (`docker-compose.yml`) and for `docker-compose.dev.yml --profile storage`. With `STORAGE_DRIVER=memory` on the host, only the Lavalink variables are needed.

\*\* Only needed when the bot runs directly on the host (`npm run dev` / `npm start`). `docker-compose.yml` ignores these variables and sets the hosts and URLs from the service names on Docker's private network.

In addition, the Docker image presets `HEARTBEAT_FILE=/tmp/perry-heartbeat`: the bot writes a timestamp to this file every 15 seconds while connected to Discord, and the image's `HEALTHCHECK` reads it (`node dist/healthcheck.js`; the file must be newer than 60 seconds). This variable does not need to be set in `.env`; when it is empty the bot writes no file.

## Running the development infrastructure (Lavalink, PostgreSQL, Redis)

To run the bot on the host with `npm run dev` (or `npm start`), use `docker-compose.dev.yml`: it only contains Lavalink, PostgreSQL and Redis (no bot), with ports published on `127.0.0.1`. This separate file exists because Docker Compose checks the required variables (`${VAR:?}`) across the whole file, so it is not possible to run Lavalink alone while keeping the PostgreSQL/Redis password checks in `docker-compose.yml`.

```bash
# Lavalink only (STORAGE_DRIVER=memory): .env only needs LAVALINK_PASSWORD
docker compose -f docker-compose.dev.yml up -d lavalink        # or: npm run dev:lavalink

# Lavalink + PostgreSQL + Redis
make dev-infra                                                  # = docker compose -f docker-compose.dev.yml --profile storage up -d
docker compose -f docker-compose.dev.yml logs -f lavalink       # or: npm run lavalink:logs

# Create the tables in PostgreSQL, then run the bot on the host
npm run db:migrate
npm run dev                                                     # not verified in v1.2 (only `npm start` was tried)

make dev-infra-down                                             # stop, keep the data
```

- The Lavalink-only (memory) mode no longer requires `POSTGRES_PASSWORD` / `REDIS_PASSWORD`; with `--profile storage`, if these two passwords are missing the Redis container stops with `REDIS_PASSWORD is not set in .env (REDIS_PASSWORD is empty), run ./scripts/setup.sh` in `docker compose logs redis`, and PostgreSQL refuses to initialize a new volume without a password.
- The first time, Lavalink downloads 3 plugins (YouTube, LavaSrc, LavaLyrics) into a named volume `lavalink-plugins`, which takes about 30-90 seconds. A one-shot `lavalink-init` service hands the volume over to Lavalink's uid 322, so the v1.1 step `sudo chown -R 322:322 lavalink/plugins` is no longer needed (on Linux too).
- When ready, `docker compose -f docker-compose.dev.yml ps` reports `healthy`.
- Ports only bind to `127.0.0.1` (`LAVALINK_PORT`, `POSTGRES_PORT`, `REDIS_PORT` in `.env`). Do not expose these ports to the internet.
- Stop: `make dev-infra-down` (keeps the data); adding `-v` to a `docker compose ... down` command also deletes the PostgreSQL, Redis and plugin cache volumes.
- Changes to `lavalink/application.yml` need `docker compose -f docker-compose.dev.yml restart lavalink`.
- This file uses the `perry-lavalink` project and the v1.1 volume/network names, so old dev data is reattached. The plugin cache used to be the `lavalink/plugins/` directory and is now a volume, so the plugins are downloaded once more. The production stack (`docker-compose.yml`, project `perry`) has its own volumes; to move dev data to production, see [docs/DEPLOY.md](docs/DEPLOY.md).
- Both compose files must use the same Lavalink/PostgreSQL/Redis image tags; CI compares them.

### YouTube plugin configuration

Lavalink uses the [youtube-source](https://github.com/lavalink-devs/youtube-source) plugin instead of the built-in YouTube source. The client list is configured in `lavalink/application.yml` (`plugins.youtube.clients`; `WEB` must come before `IOS`).

YouTube often blocks data-center servers/IPs. If you get an error like "Sign in to confirm you're not a bot", use a **secondary account** (never your main account) and try one of the following; all of them are already present as comments in `lavalink/application.yml`:

- **OAuth**: uncomment the `oauth` block, add the `TV` client to `clients`, restart and follow the code shown in `docker compose logs lavalink`. After a successful sign-in, the log prints a refresh token; store it in `YOUTUBE_OAUTH_REFRESH_TOKEN` in `.env`.
- **poToken + visitorData**: uncomment the `pot` block and fill in `YOUTUBE_PO_TOKEN` and `YOUTUBE_VISITOR_DATA` in `.env`. Do not combine it with OAuth.
- After editing `.env` or `lavalink/application.yml` for the options above, run `docker compose up -d` so Compose reloads the container's environment (`docker compose restart` does not reload `.env`). With the dev infrastructure, add `-f docker-compose.dev.yml` to the `docker compose` commands in this section.
- **Cookies** and other options: see the [youtube-source](https://github.com/lavalink-devs/youtube-source) documentation.

Plugin version: the configuration pins a snapshot build (commit `2be8e542...`). If that build breaks, go back to the stable 1.18.2 release by replacing the first entry in `lavalink.plugins` with:

```yaml
- dependency: "dev.lavalink.youtube:youtube-plugin:1.18.2"
  snapshot: false
```

### Spotify (LavaSrc)

Spotify links are resolved by LavaSrc, which then finds a playable version on YouTube. To enable it:

1. Create an application at [Spotify for Developers](https://developer.spotify.com/dashboard) and get the Client ID and Client Secret.
2. In `.env`: `LAVASRC_SPOTIFY_ENABLED=true`, `SPOTIFY_CLIENT_ID=...`, `SPOTIFY_CLIENT_SECRET=...`, `SPOTIFY_COUNTRY_CODE=...`.
3. Run `docker compose up -d` again to apply it.

While it is not enabled, Spotify links are rejected with the message "This music source is not enabled on the bot."

## Storage (PostgreSQL + Redis)

`STORAGE_DRIVER` selects how data is stored:

- `persistent` (default): PostgreSQL + Redis. In Docker, the bot migrates on startup (`AUTO_MIGRATE=true`, with an advisory lock so parallel starts do not step on each other; it waits for PostgreSQL up to 10 times, 3 seconds apart, then logs one error line and runs in degraded mode). On the host you need `DATABASE_URL`, `REDIS_URL` and `npm run db:migrate` (or `AUTO_MIGRATE=true`). ORM: Drizzle; the `drizzle/` directory contains the generated SQL migrations (`0000_init.sql`, `0001_guild_language.sql`, `0002_moderation.sql`), do not edit them by hand.
- `memory`: v1 behavior, everything lives inside the bot process. No settings are stored, there are no snapshots and no session restore. Only for running on the host; the Docker stack always uses `persistent`. With `memory`, the slash command hash is also in-process, so the commands are re-registered on every start.

Quick start on the host (dev infrastructure, see the section above):

```bash
# fill in POSTGRES_PASSWORD, REDIS_PASSWORD, DATABASE_URL, REDIS_URL in .env (./scripts/setup.sh does it for you)
make dev-infra
npm run db:migrate
npm run build && npm start
```

Where data is stored:

| Data                                                   | Stored in                      | Lifetime                                           |
| ------------------------------------------------------ | ------------------------------ | -------------------------------------------------- |
| Server settings (DJ, volume, autoplay, language, ...)  | PostgreSQL (`guild_settings`)  | Permanent; Redis cache 1 hour, in-process cache 5 seconds |
| Play history (only with `PLAY_HISTORY=true`)           | PostgreSQL (`play_history`)    | Permanent                                          |
| Queue snapshot for restore                             | Redis                          | 6 hours                                            |
| Recently played tracks (so autoplay does not repeat)   | Redis (at most 400 per server) | 6 hours                                            |
| Command cooldowns, rate limits                         | Redis                          | A few seconds to 1 hour                            |
| Autocomplete cache and Last.fm lists                   | Redis                          | 60 seconds / 6 hours                               |
| `/radio` state, timers, "Now playing" messages         | Memory only                    | Lost when the bot stops                            |

Every Redis key has the `REDIS_KEY_PREFIX` prefix and a TTL. The `playlists` and `playlist_tracks` tables are already created for a future feature and are not used yet.

Operational notes:

- **Passwords**: use `openssl rand -hex 24` for `POSTGRES_PASSWORD` and `REDIS_PASSWORD`. Compose refuses to start these two services without a password.
- **Port conflicts**: if `5432` or `6379` is already in use, set a different `POSTGRES_PORT` / `REDIS_PORT` in `.env` and update `DATABASE_URL` / `REDIS_URL` to match.
- **PostgreSQL 18**: the new image stores data under `/var/lib/postgresql/<version>/docker`, so the volume is mounted at `/var/lib/postgresql`. If you use an old volume from a previous version, do not mount it directly into this directory.
- **Redis license**: the `redis` 8.x image uses the RSALv2/SSPLv1/AGPLv3 licenses (your choice). If you need a pure open-source license, you can switch to [Valkey](https://valkey.io), which is protocol compatible; just change the image in `docker-compose.yml` and keep `REDIS_URL`.
- **Degraded mode**: when PostgreSQL or Redis cannot be reached, commands keep working. The bot logs exactly one error line per outage, uses the last known settings (or the defaults), keeps pending writes in memory and retries the connection by itself (1, 2, 5, 10, 30, 60 seconds). On recovery it logs one `recovered` line and the pending changes are written to PostgreSQL. If `npm run db:migrate` has not been run, the log says to run it (`Database schema is missing or outdated. Run "npm run db:migrate" and restart the bot`) and the bot stays in degraded mode until the migration is done. While Redis is down, cooldowns only apply within each process.
- **Multiple processes**: set `PUBSUB_INVALIDATION=true` so processes refresh settings as soon as another process changes them.
- When the bot leaves a server, that server's settings, snapshot and recent-tracks list are deleted.

### Restore after restart

With `PLAYER_RESTORE=true`, the bot saves a queue snapshot (current track, position, up to 200 queued tracks, volume, loop mode, channels) to Redis. After a restart, once connected to Lavalink, the bot rejoins the voice channels one by one (300 ms apart) and continues playing.

- It only restores when at least one real person is still in the voice channel and the bot still has the required permissions; otherwise the snapshot is dropped.
- The snapshot is written about 3 seconds after the last change (at most 15 seconds), plus a 20-second heartbeat while playing. If the bot crashes abruptly, the playback position may be off by a few seconds.
- The snapshot is only kept when the bot shuts down gracefully (SIGINT/SIGTERM) or crashes. Stopping with `/stop`, `/leave`, the queue ending or the bot being kicked deletes the snapshot. Snapshots expire after 6 hours.
- **Limitation**: if deleting a snapshot fails because Redis is down, the bot remembers it and deletes it again when Redis recovers (within the same process; meanwhile that snapshot is hidden from restore). If the bot restarts **while Redis is still down**, this memory is lost and a session that already ended may still be restored within the 6-hour TTL; the requirement that at least one real person is in the voice channel is the remaining safeguard.
- `/radio` state is not restored. Losing the Lavalink node while the bot keeps running is not restored either (the bot only re-establishes the connection).
- The `memory` mode has no restore.

## Music discovery

- **Autoplay** (`/autoplay state:on`): when the queue runs out, the bot adds suggested tracks by itself. `mode:related` (default) suggests based on the track that just played; `mode:seed` favors the latest track a user requested. Someone must be in the voice channel. At most 30 refills per hour per server; when nothing is found the bot says so once and then stays quiet until `/play`, `/radio` or `/autoplay on`.
- **Radio** (`/radio query`): enter a link or a query; the bot plays it and keeps adding related tracks whenever the queue is almost empty. Stop it with `/stop`.
- **Similar** (`/similar`): shows up to 25 tracks similar to the current track (the embed lists the first 10); pick tracks in the menu or press add all. Only the user who ran the command can use it; it expires after 120 seconds without interaction.
- Each server gets at most 60 discovery runs per hour. Suggested tracks outside `DISCOVERY_MIN_DURATION_SEC`..`DISCOVERY_MAX_DURATION_SEC`, tracks that duplicate the queue or were just played, and livestreams are all filtered out; the same artist never appears more than 2 tracks in a row.

### Suggestion provider chain

Default order (change it with `DISCOVERY_PROVIDERS`); the first provider that yields 3 or more valid tracks is used and the chain stops; a provider with fewer results is only used when no later provider does better:

1. `ytmix`: the YouTube Mix (`list=RD<videoId>`) of the current track, only for YouTube tracks.
2. `lastfm`: Last.fm `track.getSimilar`, then each track is looked up on YouTube. Needs `LASTFM_API_KEY` (free sign-up at [last.fm/api/account/create](https://www.last.fm/api/account/create)). A wrong key (error 10 or 26) disables this provider until the bot restarts and logs one warning line.
3. `lavasrc`: LavaSrc recommendations through the `dzrec` (Deezer), `ymrec` (Yandex Music), `vkrec` (VK Music) or `qbrec` (Qobuz) prefix. Needs `DISCOVERY_LAVASRC_PREFIX` **and** the matching source enabled with credentials in `lavalink/application.yml`. Do not enable Deezer without a master key: Lavalink will fail to start.
4. `artist`: search by artist name on YouTube, used as the last resort.

Spotify is not used for suggestions: Spotify stopped offering the recommendations endpoint to new applications. Spotify links can still be played (see the Spotify section).

### Playlists and YouTube Mix

- Playlist or Mix link: every track is added to the queue (at most 300 tracks per request, queue limit 1000 tracks). If the link points to a video inside a playlist (`watch?v=...&list=...`), the list is rotated to start from that video and the remaining tracks are still added.
- Tracks that duplicate the queue or appear twice in the list itself are skipped and reported in the reply.
- Short links `youtu.be/<id>?list=...` are now treated like full links (previously only one track was added).
- Single-track links and keyword searches are unchanged: a query only plays the best match.

## Registering slash commands

```bash
# Development: register instantly in the DEV_GUILD_ID server (set in .env)
npm run deploy-commands

# Register globally (can take up to ~1 hour to show up in every server)
npm run deploy-commands -- --global

# Remove the commands registered in the dev server only
npm run deploy-commands -- --clear-dev
```

- **Automatic registration on startup** (`REGISTER_COMMANDS_ON_START`, on in the Docker image): once the bot connects to Discord, it hashes the command definitions, compares the hash with the one stored in Redis (key `<REDIS_KEY_PREFIX>:v1:cmdhash:...`, TTL 30 days) and only calls Discord when the hash changed. A failed registration only logs one warning line, does not stop the bot, and is retried on the next start. `REGISTER_COMMANDS_FORCE=true` skips the comparison. Same rule as the script: with `DEV_GUILD_ID` the commands go to the dev server, otherwise they are registered globally. The real Discord call has not been verified (see the end of this document); the hash logic was tested with a fake registrar.
- v1.3 changes the command definitions (English descriptions with Vietnamese localizations, the new `/settings language` subcommand), so the commands are re-registered once after upgrading.
- The `npm run deploy-commands` script still works as before (the commands above) and uses the same command serialization code.
- If `DEV_GUILD_ID` is set and `--global` is not given, the commands are only registered in the dev server.
- Duplicate commands: if the same command is registered both globally and in the dev server, the dev server shows two copies. Run `--clear-dev` after registering globally, or leave `DEV_GUILD_ID` empty in production.
- Re-run the command whenever the command definitions change.

## Running the bot

```bash
# Production
npm run build && npm start

# Development (restarts automatically on code changes)
npm run dev
```

Static checks: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check-commands`. Unit tests (v1.4): `npm test` runs the `src/**/*.test.ts` files with Node's built-in `node:test` through `tsx`; they need neither Docker nor network, and `npm run build` leaves them out of `dist/`.

## Command list

The table below comes from the `npm run check-commands` output. All commands only work inside a server. The "Options" column is the number of options of the command. Command names are always English; the descriptions shown here are the English ones, and users whose Discord client is set to Vietnamese see the Vietnamese localizations (see [Language](#language)).

| Command       | Category | Options                                                       | Cooldown | Description                                                      |
| ------------- | -------- | ------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `/ping`       | General  | 0                                                             | 3s       | Check the bot's latency                                          |
| `/help`       | General  | 0                                                             | 3s       | Show the list of bot commands                                    |
| `/play`       | Music    | 3 (`query`, `source`, `next`)                                 | 3s       | Play music from a link or a search query                         |
| `/pause`      | Music    | 0                                                             | 1s       | Pause the current track                                          |
| `/resume`     | Music    | 0                                                             | 1s       | Resume playback                                                  |
| `/skip`       | Music    | 1 (`to`)                                                      | 1s       | Skip the current track                                           |
| `/previous`   | Music    | 0                                                             | 2s       | Play the previous track again                                    |
| `/stop`       | Music    | 0                                                             | 2s       | Stop playback and clear the queue                                |
| `/leave`      | Music    | 0                                                             | 2s       | Leave the voice channel and clear the queue                      |
| `/join`       | Music    | 0                                                             | 3s       | Make the bot join your voice channel                             |
| `/queue`      | Music    | 1 (`page`)                                                    | 2s       | Show the music queue                                             |
| `/nowplaying` | Music    | 0                                                             | 2s       | Show the current track                                           |
| `/volume`     | Music    | 1 (`level`)                                                   | 1s       | Adjust the volume (0-150)                                        |
| `/seek`       | Music    | 1 (`time`)                                                    | 1s       | Seek to a position in the current track                          |
| `/forward`    | Music    | 1 (`seconds`)                                                 | 1s       | Fast-forward                                                     |
| `/rewind`     | Music    | 1 (`seconds`)                                                 | 1s       | Rewind                                                           |
| `/loop`       | Music    | 1 (`mode`)                                                    | 1s       | Set the loop mode                                                |
| `/shuffle`    | Music    | 0                                                             | 2s       | Shuffle the queue                                                |
| `/remove`     | Music    | 1 (`position`)                                                | 1s       | Remove a track from the queue                                    |
| `/clear`      | Music    | 0                                                             | 2s       | Remove the upcoming tracks (keeps the current track)             |
| `/move`       | Music    | 2 (`from`, `to`)                                              | 1s       | Move a track to another position in the queue                    |
| `/filter`     | Music    | 1 (`name`)                                                    | 3s       | Apply an audio filter                                            |
| `/lyrics`     | Music    | 0                                                             | 10s      | Show the lyrics of the current track                             |
| `/autoplay`   | Music    | 2 (`state`, `mode`)                                           | 3s       | Turn autoplay of suggested tracks on or off when the queue ends  |
| `/radio`      | Music    | 1 (`query`)                                                   | 10s      | Start a radio: keeps adding related tracks from a track or query |
| `/similar`    | Music    | 0                                                             | 10s      | Browse and add tracks similar to the current track               |
| `/ban`        | Moderation | 3 (`user`, `reason`, `delete_messages`)                     | 3s       | Ban a user from this server                                      |
| `/unban`      | Moderation | 2 (`user`, `reason`)                                        | 3s       | Lift the ban of a user                                           |
| `/kick`       | Moderation | 2 (`user`, `reason`)                                        | 3s       | Kick a member from this server                                   |
| `/timeout`    | Moderation | 2 subcommands (`set`, `remove`)                             | 3s       | Time out a member or remove a timeout                            |
| `/warn`       | Moderation | 2 (`user`, `reason`)                                        | 3s       | Warn a member                                                    |
| `/warnings`   | Moderation | 2 subcommands (`list`, `clear`)                             | 3s       | Show or delete the warnings of a user                            |
| `/case`       | Moderation | 3 subcommands (`view`, `reason`, `delete`)                  | 2s       | Show or edit moderation cases                                    |
| `/purge`      | Moderation | 2 (`amount`, `user`)                                        | 5s       | Delete recent messages in this channel                           |
| `/rank`       | Leveling | 1 (`user`)                                                    | 5s       | Show the level, XP and rank of a member                          |
| `/leaderboard` | Leveling | 1 (`page`)                                                   | 5s       | Show the XP leaderboard of this server                           |
| `/xp`         | Leveling | 4 subcommands (`add`, `remove`, `set`, `reset`)               | 2s       | Change the XP of a member (needs Manage Server)                  |
| `/settings`   | Settings | 7 subcommands (`view`, `dj-role`, `default-volume`, `language`, `mod-log`, `mod-dm`, `leveling`) | 3s | Bot settings for this server             |

Notes:

- Most control commands require you to be in the same voice channel as the bot. `/play` and `/join` require you to be in a voice channel.
- `/play` accepts a link or a query; `source` picks `youtube`, `youtubemusic` or `soundcloud` for queries; `next` inserts the track at the front of the queue. A query only plays the best result; playlists and Mixes are added in full (at most 300 tracks per request, duplicates skipped), with a queue limit of 1000 tracks.
- `/autoplay` takes `state` (`on`/`off`) and `mode` (`related`/`seed`); `/radio` takes a link or a query. `/autoplay` needs DJ permission when a DJ role is set, `/radio` and `/similar` do not. `/autoplay` only changes a setting, so it works when you are not in a voice channel (no player or channel permission needed); adding tracks automatically still requires someone in the voice channel.
- `/seek` accepts `mm:ss`, `h:mm:ss` or a number of seconds. `/volume` accepts 0-150.
- The moderation commands and their permissions are described in [Moderation](#moderation), the leveling commands in [Leveling](#leveling).

## DJ role and `/settings`

- `/settings view`: show the current settings.
- `/settings dj-role [role]`: set the DJ role; leave `role` empty to clear it.
- `/settings default-volume level`: default volume for new sessions (0-150).
- `/settings language locale` (v1.3): the bot language in this server: `English`, `Tiếng Việt` or `Bot default` (clears the choice and falls back to `DEFAULT_LOCALE`). The confirmation reply uses the new language and the "Now playing" message is re-rendered.
- `/settings mod-log [channel]` (v1.4): the channel that receives the moderation log (a text or announcement channel); leave `channel` empty to turn the mod log off. The bot refuses a channel where it cannot post embeds (View Channel, Send Messages, Embed Links).
- `/settings mod-dm enabled` (v1.4): whether the user gets a DM on a ban, kick, timeout or warning (on by default).
- `/settings leveling [enabled] [announce] [channel]` (v1.4): turn leveling on or off and choose where level-up messages go (see [Leveling](#leveling)); without options it shows the current leveling settings.
- `/settings view` also shows the autoplay state and mode (set with `/autoplay`), the language row (the chosen language's name, or `Default (<name of the DEFAULT_LOCALE language>)`), the mod-log channel, the DM setting, whether leveling is on and where level-up messages go.
- Only members with the **Manage Server** permission can use `/settings`.
- While no DJ role is set, everyone in the voice channel can use the control commands.
- Once a DJ role is set, the control commands (pause, stop, volume, loop, ...) are reserved for members with the DJ role or the Manage Server permission. Exceptions: someone listening alone with the bot; the member who added a track may `/skip`, `/previous`, `/remove`, `/seek`, `/forward`, `/rewind` on their own track.
- If the DJ role is deleted from the server, the bot treats it as not set and clears the setting, so users are not locked out of the control commands.
- Settings are stored in PostgreSQL with `STORAGE_DRIVER=persistent`; with `memory` they are lost when the bot restarts.
- Deleting the mod-log or level-up channel clears that setting and removes the channel from the XP-ignored channels; deleting a role clears the DJ role setting, removes the role from the XP-ignored roles and deletes its level reward. Each deletion is applied with one database update, so deleting a whole category at once cannot bring a removed id back.

## Moderation

v1.4 adds moderation commands. All their replies are only visible to the moderator; the public record is the mod-log channel.

| Command                                                                 | Who can use it                                                    | What the bot needs                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/ban user [reason] [delete_messages]`                                  | Ban Members                                                       | Ban Members                                                         |
| `/unban user [reason]` (`user` is an ID or a mention)                   | Ban Members                                                       | Ban Members                                                         |
| `/kick user [reason]`                                                   | Kick Members                                                      | Kick Members                                                        |
| `/timeout set user duration [reason]`, `/timeout remove user [reason]` | Timeout Members                                                   | Timeout Members                                                     |
| `/warn user reason`                                                     | Timeout Members                                                   | nothing                                                             |
| `/warnings list user`, `/case view number`, `/case reason number reason` | Timeout Members                                                 | nothing                                                             |
| `/warnings clear user`, `/case delete number`                           | listed for Timeout Members, but running them needs Manage Server | nothing                                                             |
| `/purge amount [user]`                                                  | Manage Messages                                                   | View Channel, Read Message History and Manage Messages in the channel |

- Permissions: the "Who can use it" column is the command's default member permission. Server admins can change it in Server Settings > Integrations, so the bot checks the permission again when the command runs. Before acting, the bot checks its own permissions and lists the missing ones.
- Role hierarchy: nobody can act on themselves, the bot or the server owner. The moderator (unless they own the server) and the bot both need a highest role strictly above the member's highest role. Members with Administrator cannot be timed out. `/kick`, `/timeout` and `/warn` only work on current members; `/ban` also accepts a user who is not in the server. A user who is already banned is not banned twice.
- Cases: every ban, unban, kick, timeout, timeout removal and warning becomes a case with a number per server (#1, #2, ...). A case stores the action, the user, the moderator, the reason (at most 512 characters), the timeout duration, whether the DM was delivered and the mod-log message. Numbers are never reused, also after `/case delete`, which removes the record but leaves the mod-log message. `/warnings list` shows a user's warnings, 10 per page, also for users who left the server.
- Mod log: with `/settings mod-log` the bot posts one embed per case and per purge in that channel. `/case reason` changes the reason and edits the logged embed.
- DM: while `/settings mod-dm` is on (the default) the user gets a DM in the server's language: before a ban or kick (afterwards the bot may share no server with them) and after a timeout or warning. There is no DM on unban or timeout removal. A failed DM never blocks the action, and the reply says the DM could not be delivered. If a ban or kick fails after its DM was sent, the error reply says the user was already notified.
- Durations: `s`, `m`, `h`, `d` and `w`, combinable (`10m`, `1h30m`, `7d`), from 1 second to 28 days.
- `/ban delete_messages`: delete none (default) or the last 1h, 6h, 12h, 24h, 3d or 7d of the user's messages.
- `/purge`: looks at the last 100 messages of the current channel or thread and deletes up to `amount` (1-100) of them, optionally only from one user. Pinned messages and messages older than 14 days are skipped. A purge writes a mod-log entry but no case.
- Audit log: the bot sets the reason in Discord's audit log to `<moderator>: <reason>`.
- PostgreSQL unavailable: `/ban`, `/unban`, `/kick` and `/timeout` still run and the reply says the case was not recorded; `/warn`, `/warnings` and `/case` answer that the records are temporarily unavailable. With `STORAGE_DRIVER=memory`, cases are only kept until the bot restarts.
- The bot does not filter message content. Managing Discord's own AutoMod rules is planned for the web dashboard.

## Leveling

v1.4 adds XP and levels. Leveling is off in every server until a manager turns it on with `/settings leveling enabled:true`.

- XP: an eligible message earns a random 15-25 XP times the server's XP multiplier (10-500 %, default 100 %), at most once per 60 seconds per member and server. The cooldown is shared through Redis (kept in the bot process while Redis is down). Bots, webhooks, system messages and direct messages earn nothing, and neither do messages in an ignored channel (an ignored channel also covers its threads, an ignored category its channels) or from a member with an ignored role. XP is capped at 2,000,000,000 (about level 1058).
- Levels: going from level `l` to `l + 1` takes `5 × l² + 50 × l + 100` XP. Total XP needed per level:

| Level    | 1   | 2   | 3   | 5     | 10    | 20     | 30     | 50      | 100       |
| -------- | --- | --- | --- | ----- | ----- | ------ | ------ | ------- | --------- |
| Total XP | 100 | 255 | 475 | 1,150 | 4,675 | 23,850 | 67,525 | 268,375 | 1,899,250 |

- `/rank [user]` (public reply): level, XP within the level, total XP, rank and a progress bar. The rank is the member's position on the leaderboard (members with equal XP are ordered by user ID).
- `/leaderboard [page]` (public reply): 10 members per page with previous/next buttons; a page past the end shows the last page.
- `/xp add|remove user amount` (1-1,000,000), `/xp set user xp` (0-2,000,000,000) and `/xp reset user` (Manage Server; the reply is only visible to you) change a member's XP. The level follows the XP, also downwards, and the role rewards are updated. These changes are never announced.
- Level-up messages: `/settings leveling announce` sends them to `Channel of the message` (default), `Configured channel` (set with the `channel` option, which alone also selects this mode; when the bot cannot post there it uses the message's channel), `Direct message` or nowhere (`Off`). The bot refuses a `channel` where it cannot post embeds (View Channel, Send Messages, Embed Links). The message mentions the member without pinging them and uses the server's language; a jump over several levels is announced once.
- Role rewards: up to 25 rewards, one role per level (levels 1-1000). In `stack` mode (the default) members keep every reward up to their level; in `highest` mode only the reward of the highest level reached. The rewards are applied on a level-up and after `/xp`. The bot needs Manage Roles and its own role must sit above every reward role; managed roles and roles that are not below the bot's role are skipped and logged once.
- Settings without a slash command: the XP multiplier, the ignored channels and roles, the role rewards and their mode, and the public leaderboard page are set in the web dashboard. Without it they keep their defaults (100 %, nothing ignored, no rewards, no public leaderboard).
- Deleting a channel or a role removes it from the leveling settings, and deleting a reward role deletes its reward. When the bot is removed from a server, the role rewards are deleted with the settings; member XP (and the moderation cases) are kept.
- PostgreSQL unavailable: messages earn no XP meanwhile (nothing is queued), and `/rank`, `/leaderboard` and `/xp` answer that levels are temporarily unavailable. With `STORAGE_DRIVER=memory`, XP is only kept until the bot restarts.

## Language

- The bot supports `en` (English, the default) and `vi` (Vietnamese).
- `DEFAULT_LOCALE` in `.env` (`en` | `vi`, default `en`; empty = `en`) is the bot's default language. Any other value makes the bot exit at startup with a configuration error.
- `/settings language` (requires Manage Server) picks the language per server: `English`, `Tiếng Việt` or `Bot default`.
- Resolution order for replies, the "Now playing" message and channel notices: the server's setting, then `DEFAULT_LOCALE`. The user's Discord client language does not affect these messages. The bot's presence text and the reply in direct messages use `DEFAULT_LOCALE`. If a server's settings cannot be read, notices fall back to `DEFAULT_LOCALE`.
- Logs are always in English.
- Slash command names are always English. Command, option and choice descriptions follow each user's Discord client language (clients set to Vietnamese show the Vietnamese localizations), independently of both `DEFAULT_LOCALE` and `/settings language`.
- After upgrading to v1.3 the command definitions change, so the commands are re-registered once (automatically with `REGISTER_COMMANDS_ON_START=true`, or with `npm run deploy-commands`).
- Migration `0001_guild_language` adds the `guild_settings.language` column. The Docker stack applies it automatically on startup (`AUTO_MIGRATE=true`); when running the bot on the host, run `npm run db:migrate` first. A v1.3 bot on an un-migrated database logs `Database schema is missing or outdated. Run "npm run db:migrate" and restart the bot` and runs in degraded mode.
- To keep Vietnamese as the default after upgrading, set `DEFAULT_LOCALE=vi` (re-run `./scripts/setup.sh` to append the new key to an existing `.env`).

## Security

- The production stack (`docker-compose.yml`) publishes no ports to the host: Lavalink, PostgreSQL and Redis only live on Docker's private networks (Lavalink on the `lavalink` network, PostgreSQL/Redis on the `data` network, the bot on both). The dev infrastructure (`docker-compose.dev.yml`) only binds `127.0.0.1`. Do not expose these ports to the internet; if the bot runs on another machine, use a private network or TLS (`LAVALINK_SECURE=true` with a reverse proxy on port 443).
- The bot container runs as the `node` user (not root), with a read-only root filesystem (only `/tmp` is writable), `cap_drop: ALL` and `no-new-privileges`. The image contains no `.env`, TypeScript source, source maps or development tools.
- Use a strong Lavalink password (`openssl rand -hex 24`, or let `./scripts/setup.sh` generate it). Docker Compose refuses to start without `LAVALINK_PASSWORD`.
- The `.env` created by `setup.sh` has mode `600`; the script never `source`s this file and only accepts values that match safe patterns, so lines cannot be injected. Backup files `backups/*.dump` also have mode `600` (directory `700`) and contain real data: protect them like `.env`.
- Passwords are in the containers' environment variables (bot: `DATABASE_URL`, `REDIS_URL`) and in the Redis process arguments, so members of the `docker` group can read them with `docker inspect`. Only give `docker` group membership to trusted people.
- Do not commit `.env`, tokens or passwords. Tokens and passwords are redacted from the logs; errors shown to users contain no stack traces.
- Lavalink's `http` source is enabled to play audio files directly. Before sending to Lavalink, the bot blocks links that point to internal addresses (loopback, private networks, link-local, `localhost`, `.local` domains, addresses with credentials, ...) to reduce SSRF risk.
- **Limits of the SSRF filter**: the filter only checks the host name written in the link. It does not resolve DNS (a domain that points to an internal address still gets through) and does not follow redirects. If you run the bot publicly, add network-level limits for the Lavalink container (block egress to internal, link-local and cloud metadata IP ranges).
- PostgreSQL and Redis both require a password (and are not published in the production stack). Connection strings, passwords and `LASTFM_API_KEY` are redacted from logs and errors. `PLAY_HISTORY=true` stores the requester ID of each track; only enable it when needed and tell your users.
- The bot opens no HTTP port; it only makes outbound connections to Discord and Lavalink. The container health check uses a heartbeat file, not a network port.
- Minimal intents: `Guilds`, `GuildVoiceStates` and `GuildMessages` (none privileged; message content is not read).

## Known limitations

- **SoundCloud**: during testing (Lavalink 4.2.2), both `scsearch` searches and SoundCloud links failed with "Did not detect any supported formats" because of a Lavaplayer-side bug. The command still offers this source but reports a friendly error when the source fails.
- **Lyrics (`/lyrics`)**: depends on the LavaLyrics plugin and the LRCLIB service (rate limited, has returned HTTP 429). Results are unreliable; the bot replies with "not supported / not found / could not fetch" messages instead of errors.
- **YouTube is unstable**: YouTube keeps changing and blocking; OAuth/poToken or a plugin update may be needed.
- **Settings and queues**: settings are persisted with `persistent`; queues are only restored under the conditions in "Restore after restart". `/radio` state is in memory only and is lost when the bot restarts. Losing the Lavalink node (while the bot keeps running) does not restore the queue.
- **Suggestions**: `lastfm` needs an API key and `lavasrc` needs credentials for the matching service; without them, the provider chain is reduced to `ytmix` and `artist`. YouTube Mix quality can change with YouTube.
- **Multiple processes**: cooldowns and rate limits use Redis so they can be shared, but running several processes has not been verified.
- **24/7 mode**: exists in the code but has no command to enable it yet; off by default.
- **One Lavalink node**: only one node is used, with no load balancing across nodes.
- **Moderation**: only actions taken through the bot's commands are recorded; bans, kicks and timeouts done in Discord's own menus create no case and no mod-log entry. `/purge` only looks at the last 100 messages and cannot delete messages older than 14 days. There are no temporary bans and no automatic punishment after a number of warnings.
- **Leveling**: no XP is granted while PostgreSQL is unavailable (nothing is queued); the `memory` storage driver keeps XP only until the bot restarts. There is no voice XP, no rank image card, no XP decay and no server-wide reset. The XP multiplier, the ignored lists and the role rewards can only be changed in the web dashboard.
- Bandcamp and Twitch only accept links (no search). Stage channels are not supported yet.
- `bcsearch:` is not a Lavalink feature, so there is no Bandcamp search.

## What has not been verified at runtime

The items below have not been run with a real Discord session (no real Discord token was available during testing):

- Real audio playback through a Discord voice channel.
- Buttons on the "Now playing" message and pagination on real messages.
- Registering the slash commands with Discord and how the options are displayed.
- Autocomplete through Discord (only the search logic was tested against Lavalink).
- Spotify (no credentials).
- Bandcamp and Twitch links.
- Lyrics end to end.
- 24/7 mode and the DJ/timer behavior with real members.
- The `sudo chown -R 322:322 lavalink/plugins` step on Linux (only tried on Docker Desktop for macOS). Since v1.2 this step is replaced by the `lavalink-init` service, see the v1.2 list below.
- YouTube OAuth and poToken flows (no secondary account to test with).
- Real playlists with more than 300 tracks (the new limit was only tested with a mock node).
- Restore after a restart in a real voice channel (rejoining the channel and continuing at the right position).
- `/autoplay`, `/radio`, `/similar` on real Discord (select menu, buttons, ephemeral collector) and autoplay after a real queue end.
- The `roleDelete` event in a real server (only tested with mocks).
- Real results from Last.fm (no API key) and from the LavaSrc suggestion provider (needs Deezer/Yandex/VK/Qobuz credentials).
- Spotify recommendations: not used (see Music discovery).
- Long-term behavior of YouTube Mix (only checked at one point in time from one IP address; YouTube changes often).
- Whether the Redis data (AOF) survives a server reboot.
- Running several bot processes with `PUBSUB_INVALIDATION=true` (only two instances in the same script were tried).

Not verified in v1.2 (packaging and deployment):

- A real Discord login inside the container: the whole flow after `clientReady` (writing the heartbeat once ready, `HEALTHCHECK` turning `healthy`, automatic slash command registration with a real `PUT`). Testing only used a fake token, so the bot stopped at the `Login failed` line; the PASS `bot login` row of `doctor.sh` only reflects the Docker state of the simulation.
- Graceful shutdown (`docker compose stop`) with a real Discord gateway and voice player; only the shutdown path before login was tried (exit code 0 after about 1 second).
- Running the `linux/amd64` image directly on an amd64 machine: it was only built and run through emulation (QEMU) on an arm64 machine (it printed `x64`). A single multi-arch `docker buildx build --platform linux/amd64,linux/arm64` command does not work with the test machine's default `docker` driver (it needs the `docker-container` driver or the containerd image store), so `release.yml` has not been tried as a multi-platform build.
- GitHub Actions workflows (`ci.yml`, `release.yml`): only actionlint and local re-runs of their shell commands (`docker compose config`, image tag comparison, `docker build`, shellcheck); not run on GitHub, no image pushed to GHCR, the `packages: write` permission and GHCR package visibility settings not checked.
- Pulling a prebuilt image with `BOT_IMAGE` from a real registry (only the failure path when the pull fails was tried).
- A real Linux server: Docker Engine installed from apt, `ufw`, directory permissions for bind mounts on Linux (the permission tests used named volumes in Docker Desktop), the Docker and firewall installation commands in the VPS section.
- A Linux server's bash with `backup.sh`, `restore.sh`, `update.sh`, `doctor.sh` (only `setup.sh` was additionally run in a Debian 12 container; the other scripts ran with macOS bash 3.2).
- Windows (WSL2 or Git Bash) and Docker Compose older than 2.32.
- `git clone` from a real remote repository (the test repository has no remote); the `git pull --ff-only` branch was only tried with a fake repository in `/tmp`.
- Restoring a backup into a database whose schema differs from the current code; rotating the Lavalink/Redis/PostgreSQL passwords on a running stack.
- The sample resource limits (`deploy.resources.limits`, commented out in `docker-compose.yml`).
- First image build time on a clean machine (the test had a layer cache) and disk usage on a real VPS.
- The limit of re-deleting snapshots after a Redis outage (v1.2): it only works within the same process; if the bot restarts while Redis is still down, it cannot know which snapshots were deleted.

Not verified in v1.3 (internationalization):

- How real Discord clients render the localized command descriptions and choice names (English/Vietnamese).
- `/settings language` end to end and the re-render of the "Now playing" message after a language change in a real server.
- The mixed-version window of the Redis settings cache (at most 1 hour) during an upgrade.
- Upgrading the live stack to v1.3 (migration `0001` on real data, re-registering the commands).

Verified: PostgreSQL 18 and Redis 8 start from Docker Compose (`config -q` passes with passwords and fails without them), `npm run db:migrate` can be re-run, settings read/write through Redis and PostgreSQL, snapshot save/read/delete and graceful shutdown keeping the snapshot, cooldowns and rate limits through Redis, degraded mode when stopping and restarting each backend (one log line per outage, automatic recovery, pending settings written back), every Redis key has a TTL, loading real YouTube playlists/Mixes (including `youtu.be` and starting from the selected video), the `ytmix` and `artist` suggestion providers against real Lavalink, the source prefix filter for every `DefaultSources` key, and the deleted-DJ-role handling (with mock objects). Also: Lavalink starts from `docker-compose.yml` + `lavalink/application.yml` (3 plugins loaded, `/v4/info` returns 401 without the password and 200 with it), `ytsearch` searches, loading YouTube playlists, rejecting internal links, and starting the bot with missing configuration or a wrong token without leaking secrets.

Verified in v1.2 (Docker 27.5.1, Compose 2.32.4, macOS arm64, fake Discord token): the bot image builds (about 207 MB, runs as the `node` user, contains no `.env`, source, source maps or development tools); `linux/amd64` built and run through emulation; all four base images are multi-arch (amd64 and arm64) and the runtime dependency tree has no native modules; the full `docker compose up -d` stack (PostgreSQL, Redis, Lavalink healthy, `lavalink-init` exits 0, plugins owned by uid 322, migrations re-run without errors, no container publishes ports, exactly one `Login failed` line per start, no passwords in the logs, `docker history` or `docker image inspect`); `docker-compose.dev.yml` (Lavalink alone starts without the PostgreSQL/Redis passwords, `--profile storage`, binds `127.0.0.1` only); `setup.sh` (creates `.env` with mode 600, re-runs change nothing, rejects values with dangerous characters, upgrades an old `.env`, runs in Debian 12 without `openssl`); `deploy.sh`, `update.sh` (including `--dry-run`, the branch without `.git`, the `git pull --ff-only` branch with a fake repository, printing rollback instructions on failure), `backup.sh` (with pruning of old backups), `restore.sh` (refuses without a terminal, `--yes`, `--latest`), `doctor.sh` (healthy, broken and stopped states), `logs.sh`, the `make` targets (`up`, `ps`, `logs`, `doctor`, `backup`, `restore`, `restart`, `down`, `build`, `dev-infra`, `dev-infra-down`); shellcheck (v0.11.0) clean for every script; hadolint with only one accepted DL3066 info (`USER node`); actionlint (1.7.12) clean for both workflows; v1.1 fixes: snapshot deletion is retried when Redis recovers (tested with a real Redis stopped and started again), `purgeGuild` in `memory` mode clears the recent-tracks list, `/autoplay` passes the guards when the user is not in a voice channel.

Verified in v1.3 (no real Discord token; throwaway PostgreSQL 18.6 / Redis 8.8.3 containers and a copy of the build): `npm run typecheck`, `lint`, `build` and `check-commands` pass, and `check-commands` now fails when any command, subcommand or option lacks a Vietnamese description localization or exceeds 100 characters (tested by removing one); the compiler rejects a Vietnamese catalog with a missing key, an extra key or a wrong parameter type; migration `0001_guild_language` re-runs cleanly (2 rows in `drizzle.__drizzle_migrations`), its check constraint rejects values other than `en`/`vi`, and a database with only `0000_init` makes the bot log `Database schema is missing or outdated`; the guild language round-trips through the in-process cache, Redis and PostgreSQL (including reset to the default and v1.2 Redis cache entries without a language field); `DEFAULT_LOCALE` unset, empty, `vi` and an invalid value (exit 1 without printing the value), and Docker Compose passing it to the bot; command names are unchanged apart from the new `/settings language` subcommand; every command/subcommand/option carries a Vietnamese localization, `/settings language` choices and Manage Server default permission, the locale resolution order, and the "Now playing" and queue embeds rendered in both languages with a fake player; an offline start with `DEFAULT_LOCALE=vi`, a fake token and auto-migrate (migrations applied, Redis and PostgreSQL connected, exactly one `Login failed` line, clean shutdown); scripts, Makefile, compose files, workflows and `.env.example` contain no Vietnamese text, shellcheck (v0.10.0) is clean, every script's `--help` and `make help` print English, `setup.sh` appends `DEFAULT_LOCALE` to an existing config file, `doctor.sh` prints an English report and the compose guards print English messages.

Not verified in v1.4 (moderation):

- Every moderation action against real Discord members: the role hierarchy as Discord enforces it, DMs, audit-log reasons, bulk delete with `/purge`.
- How the mod-log and case embeds render in a real Discord client; `/settings mod-log` with a real channel.
- Whether opening the new invite link again adds the new permissions to the bot's role in a server that already has the bot.
- `/warnings list` page buttons on a real message.
- Registering the 35 commands with Discord, and upgrading a real running stack to v1.4 (migration `0002` on real data).

Not verified in v1.4 (leveling):

- XP from real messages in a real server (the `GuildMessages` events and the member data that comes with them).
- Level-up messages in real channels and DMs, how the `/rank` and `/leaderboard` embeds render in a real client, and the `/leaderboard` page buttons on a real message.
- Role rewards with a real role hierarchy (Manage Roles, role order, managed roles).
- `/settings leveling channel` refusing a real channel where the bot cannot post.
- Registering the 38 commands with Discord, and upgrading a real running stack (migration `0003` on real data).

Verified in v1.4 (moderation; no real Discord token, throwaway PostgreSQL 18.6 / Redis 8.8.3 containers): `npm run typecheck`, `lint`, `build`, `check-commands` (35 commands) and `npm test` pass; the 26 existing commands other than `/settings` serialize exactly as before and `/settings` only gains `mod-log` and `mod-dm`; every new command has its default member permission, Vietnamese localizations and option limits; migration `0002_moderation` applies and re-runs cleanly (3 rows in `drizzle.__drizzle_migrations`) and its check constraints reject unknown actions; 20 parallel case creations in one server get the numbers 1 to 20 and a deleted number is not reused; with PostgreSQL stopped, creating a case resolves at once without an error and the settings store queues channel and role removals and replays them as the same database update after recovery; a database with only `0000` and `0001` makes the bot log `Database schema is missing or outdated`; the moderation pipeline (order of checks, DM before a ban or kick and after a timeout or warning, error mapping, notes) with stub Discord objects; an offline start with a fake token (migrations applied, Redis and PostgreSQL connected, exactly one `Login failed` line, no secrets in the log).

Verified in v1.4 (leveling; no real Discord token, throwaway PostgreSQL 18.6 / Redis 8.8.3 containers): `npm run typecheck`, `lint`, `build`, `check-commands` (38 commands) and `npm test` pass; the 26 existing commands other than `/settings` serialize exactly as before and `/settings` only gains `mod-log`, `mod-dm` and `leveling`; `/leaderboard page` is limited to 1-10,000 and the `/xp` options to 1-1,000,000 and 0-2,000,000,000; migration `0003_leveling` applies on an empty database and on one that only has `0000`-`0002` (4 rows in `drizzle.__drizzle_migrations`), and its constraints reject a negative XP and a reward role used twice; the XP formulas match the level table (the closed form equals a running sum up to level 1100); 50 parallel grants for one member add up exactly and report each level-up once; grants racing `/xp set 0`, and `/xp add` on a member without a row racing 20 grants, never leave the level above the XP, never fail and never mark PostgreSQL unavailable; on 50,000 seeded members the leaderboard page reads `member_levels_guild_xp_idx` without a sort and every rank equals the leaderboard position, ties included; parallel deletions of ignored channels and roles (also during a PostgreSQL outage, and against a value another process wrote) leave no deleted id behind; v1.3 and earlier v1.4 Redis settings entries decode with the leveling defaults; a `BotClient` built with a fake configuration requests exactly `Guilds`, `GuildVoiceStates` and `GuildMessages`; the message handler, `/rank`, `/leaderboard`, `/xp` and `/settings leveling` behave as described above with stub Discord objects; an offline start of the built bot applies the 4 migrations and stops at exactly one `Login failed` line.

Suggested quick test on a real server: `/play never gonna give you up`, `/pause`, `/resume`, `/skip`, `/queue` and the buttons on the "Now playing" message; then `/settings language` with each choice; then `/settings mod-log`, `/warn` and `/case view` on a test member; then `/settings leveling enabled:true`, a few messages a minute apart, `/rank` and `/leaderboard`.

## Legal notice

Playing music from YouTube, Spotify and some other services through tools such as Lavalink/youtube-source may violate those platforms' Terms of Service. This project is provided as is. If you run a **public** bot for many servers, you (the bot owner) are solely responsible for complying with the platforms' terms and with copyright law.

## Troubleshooting

| Symptom                                                                                                                | Fix                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not sure where the problem is (Docker)                                                                                 | Run `./scripts/doctor.sh`: a PASS/FAIL/WARN table for Docker, `.env` (variable names only), each container, Lavalink and plugins, PostgreSQL, Redis, bot login, published ports.                                                                                                                   |
| The bot exits immediately with "Invalid configuration"                                                                 | Fill in every variable listed in `.env` (the log only prints variable names, never values).                                                                                                                                                                                                        |
| "Login failed: An invalid token was provided."                                                                         | `DISCORD_TOKEN` is wrong or has been reset; get a new token in the Bot tab, fix `.env`, then `./scripts/deploy.sh`. In Docker the bot waits 30 seconds and exits, so it is restarted every 30-60 seconds; `doctor.sh` detects this log line.                                                         |
| Slash commands do not show up                                                                                          | In Docker the bot registers them when it connects to Discord (check the log; `REGISTER_COMMANDS_FORCE=true` forces a re-registration). Manually: `npm run deploy-commands`. Global commands take up to ~1 hour. Check that the bot was invited with the `applications.commands` scope.              |
| Command descriptions show in English for a Vietnamese user (or the other way round)                                    | Descriptions follow the user's Discord client language, not `/settings language`; the commands must have been re-registered with v1.3 (see [Registering slash commands](#registering-slash-commands)).                                                                                             |
| The bot container is `unhealthy`                                                                                       | The health check only passes when the bot is connected to Discord and wrote the heartbeat in the last 60 seconds; with a wrong token it is always `unhealthy`. See `./scripts/logs.sh bot`.                                                                                                        |
| Commands show up twice                                                                                                 | The commands are registered both globally and in the dev server; run `npm run deploy-commands -- --clear-dev`.                                                                                                                                                                                     |
| "The music server is unavailable"                                                                                      | Check `docker compose ps` and `docker compose logs lavalink`. In Docker the bot always connects to `lavalink:2333` with `LAVALINK_PASSWORD` from `.env`; when running the bot on the host, `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` must match `docker-compose.dev.yml`. The bot reconnects by itself. |
| Compose reports a missing `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `LAVALINK_PASSWORD`, `POSTGRES_PASSWORD` or `REDIS_PASSWORD` | Set the variable in `.env` (or run `./scripts/setup.sh`) and run again. This check also applies to `docker compose ps/logs/down` because Compose checks the whole file.                                                                                                                      |
| The log says PostgreSQL/Redis is unavailable                                                                           | The bot keeps running in degraded mode and retries. Check `docker compose ps` and the passwords (and the ports/URLs when running on the host). In Docker the bot migrates by itself; on the host, if the tables (or the v1.3 `language` column) are missing, run `npm run db:migrate`.             |
| Changed `POSTGRES_PASSWORD` but PostgreSQL still uses the old password                                                 | The password is only applied when the volume is first created. Change it with `ALTER USER` in PostgreSQL, or restore a backup into a new volume.                                                                                                                                                   |
| Lavalink is not `healthy` on the first run                                                                             | Normal: 30-90 seconds to download 3 plugins. Plugin directory permissions are handled by the `lavalink-init` service, so no manual `chown` is needed.                                                                                                                                              |
| "Sign in to confirm you're not a bot"                                                                                  | Configure OAuth or poToken for YouTube as described above.                                                                                                                                                                                                                                         |
| The bot joins the channel but there is no sound                                                                        | Check the Lavalink log (libdave/voice errors); check the bot's Connect and Speak permissions.                                                                                                                                                                                                      |
| SoundCloud does not play                                                                                               | Known Lavalink-side bug, see the limitations section.                                                                                                                                                                                                                                              |
| `LAVALINK_SECURE=true` reports a port error                                                                            | The library requires port `443` when TLS is enabled.                                                                                                                                                                                                                                               |
| Need more detailed logs                                                                                                | Set `LOG_LEVEL=debug` (it may also log stack traces; do not share them publicly).                                                                                                                                                                                                                  |

## Project structure

```
src/
  index.ts            Entry point, login and safe shutdown
  config/             Reading and validating environment variables, constants
  client/             BotClient and event registration
  commands/           Commands by group: general/, music/, moderation/, leveling/, settings/ and index.ts (explicit list)
  events/             Discord events (ready, guildDelete, guildRoleDelete, channelDelete, messageCreate, interaction, voice state)
  moderation/         Moderation: target checks, durations, limits, the action pipeline, mod log, permission helpers
  leveling/           Leveling: XP formulas, eligibility rules, role reward diff, the message handler (leveling-service.ts)
  interactions/       Command, button and autocomplete handling, cooldowns
  music/              Lavalink, queue, guards, controls, search, lyrics
    discovery/        Suggestion engine, autoplay, filters and providers (providers/)
    persistence/      Queue snapshots, queue store, restore after restart
  storage/            Storage layer: types, health (degraded mode), keys; memory/, redis/, postgres/ (Drizzle)
  settings/           Per-server settings (memory or PostgreSQL + Redis)
  i18n/               User-facing strings
    en.ts             English catalog (source of truth, defines the Messages type)
    vi.ts             Vietnamese catalog (typed as Messages)
    locales.ts        Supported locales (en, vi), fallback locale, language names
    index.ts          getMessages, resolveLocale, Discord command localizations
  types/ utils/       Shared types, logger, errors, pagination, embeds
  startup/            Migrations on startup (advisory lock) and hash-based slash command registration
  health/             Heartbeat for Docker's HEALTHCHECK (healthcheck.ts in src/ runs as node dist/healthcheck.js)
scripts/              Bash: setup, deploy, update, backup, restore, doctor, logs (+ lib/common.sh);
                      tsx: deploy-commands.ts, check-commands.ts, db-migrate.ts
Dockerfile            Multi-stage bot image (Node 24 alpine, runs as the node user), with .dockerignore
docker-compose.yml    Production stack: bot, lavalink-init, lavalink, postgres, redis (no published ports)
docker-compose.dev.yml  Dev infrastructure: Lavalink (+ PostgreSQL, Redis with --profile storage), binds 127.0.0.1
Makefile              Shortcuts calling scripts/ or docker compose (make help)
.github/workflows/    ci.yml (checks, image build, compose validation) and release.yml (pushes a multi-arch image to GHCR on v* tags)
README.vi.md          Vietnamese README
docs/DEPLOY.md        Detailed deployment guide (docs/DEPLOY.vi.md: Vietnamese version)
backups/              PostgreSQL backups created by backup.sh (excluded by .gitignore)
drizzle/              Generated SQL migrations (kept in git, do not edit by hand)
  0000_init.sql       Initial schema
  0001_guild_language.sql  v1.3: guild_settings.language column + check constraint
  0002_moderation.sql      v1.4: mod_cases, mod_case_counters, guild_settings.mod_log_channel_id and mod_dm_target
  0003_leveling.sql        v1.4: member_levels, level_role_rewards and the leveling columns of guild_settings
drizzle.config.ts     drizzle-kit configuration
lavalink/             application.yml (the plugins/ directory only holds .gitkeep; plugins live in a Docker volume)
```

The GitHub Actions workflows have only been written and checked with actionlint; they have not actually run on GitHub.

### Adding a new module (for example moderation)

1. Create the `src/commands/moderation/` directory and write each command as a `Command` object (`data`, `category`, `execute`, optional `cooldownSeconds`, `requirements`, `autocomplete`) like the commands in `src/commands/music/`.
2. Add the new group (`moderation`) to the `category` type in `src/types/command.ts` and its label to `categories` in `src/i18n/en.ts` and `src/i18n/vi.ts`.
3. Add the commands to the explicit array in `src/commands/index.ts`. Command modules must not read environment variables at import time.
4. Add the strings to `src/i18n/en.ts` and their translations to `src/i18n/vi.ts` (the compiler reports missing keys); build command descriptions with `createCommand(name, (m) => ...)` / `describe(...)` so the Vietnamese localizations are attached. If a new intent is needed, enable it in `src/client/bot-client.ts` and update the Developer Portal.
5. Extend `scripts/check-commands.ts` (scanned directories and the list of required commands), then run `npm run check-commands` and `npm run deploy-commands`.
