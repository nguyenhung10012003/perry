# Triển khai Perry bằng Docker

[English](DEPLOY.md) | **Tiếng Việt**

Tài liệu chi tiết cho [phần "Triển khai nhanh" của README](../README.vi.md#triển-khai-nhanh). Quy ước: lệnh nào **không** ghi `chưa kiểm chứng` đã được chạy thật khi kiểm tra v1.2 (Docker 27.5.1, Compose 2.32.4, macOS arm64, token Discord giả). Phần cuối liệt kê những gì chưa kiểm chứng.

## 1. Stack gồm những gì

`docker compose up -d` (hoặc `make up`) chạy năm dịch vụ trong project `perry`, sáu dịch vụ khi bật web dashboard (`COMPOSE_PROFILES=web`):

| Dịch vụ         | Image                                    | Vai trò                                                                                     |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `bot`           | build từ `Dockerfile` (hoặc `BOT_IMAGE`) | Bot Discord, chạy bằng user `node`, hệ tệp gốc chỉ đọc, tự migrate và tự đăng ký lệnh slash |
| `lavalink-init` | `ghcr.io/lavalink-devs/lavalink:4.2.2`   | Chạy một lần để chuyển quyền sở hữu volume plugin cho uid 322, rồi thoát mã 0               |
| `lavalink`      | `ghcr.io/lavalink-devs/lavalink:4.2.2`   | Máy chủ âm thanh; lần đầu tải 3 plugin (30-90 giây)                                         |
| `postgres`      | `postgres:18.6-alpine3.24`               | Cài đặt máy chủ, vụ kiểm duyệt, cấp độ và vai trò thưởng (v1.4), lịch sử phát tùy chọn      |
| `redis`         | `redis:8.8.3-alpine3.23`                 | Cooldown, bộ nhớ đệm, snapshot hàng đợi, hash lệnh slash, phiên dashboard và cầu nối bot-web (v1.4) |
| `web`           | image của bot (`perry-bot:local` hoặc `BOT_IMAGE`) | Tùy chọn (v1.4): web dashboard và trang giới thiệu, server Next.js standalone từ cùng image; chỉ publish trên `127.0.0.1:${WEB_PORT:-3000}` |

- Mạng: `lavalink` (Lavalink và bot) và `data` (PostgreSQL, Redis và bot). Đây là hai mạng bridge thường, không phải `internal`, vì bot cần đường ra internet tới Discord. Không dịch vụ nào có `ports:` ngoại trừ `web` tùy chọn, chỉ publish `127.0.0.1:${WEB_PORT:-3000}` và chỉ ở mạng `data`; khi kiểm tra v1.2, `PortBindings` của cả 4 container đều rỗng.
- Volume: `postgres-data`, `redis-data` (AOF bật), `lavalink-plugins`. Tên thật có tiền tố project, ví dụ `perry_postgres-data`.
- Log: `json-file`, tối đa 3 tệp x 10 MB cho mỗi dịch vụ.
- Bot nhận cấu hình qua danh sách `environment` tường minh trong compose (không dùng `env_file`), vì `.env` còn chứa giá trị chỉ dành cho chạy trên máy host (`DATABASE_URL=...127.0.0.1`, `LAVALINK_HOST=127.0.0.1`). Trong container, `LAVALINK_HOST=lavalink`, `STORAGE_DRIVER=persistent`, `DATABASE_URL` và `REDIS_URL` được dựng từ mật khẩu và tên dịch vụ. Dịch vụ `web` có danh sách riêng: không có `DISCORD_TOKEN`, còn `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL`, `SESSION_SECRET` và `WEB_TRUST_PROXY` lấy từ `.env`.
- Compose kiểm tra `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `LAVALINK_PASSWORD`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD` trên **toàn tệp**, nên mọi lệnh `docker compose` (kể cả `ps`, `logs`, `down`) báo lỗi nếu `.env` thiếu hoặc rỗng một trong các biến này (từ v1.3 thông báo bằng tiếng Anh: `<BIẾN> is not set in .env, run ./scripts/setup.sh`). Các biến của web không được kiểm tra theo cách này, vì stack không có web không được phép cần tới chúng; chính web thoát mã 1 và liệt kê tên biến thiếu, và `setup.sh --web` cùng `doctor.sh` cũng kiểm tra chúng.

## 2. Chuẩn bị máy chủ Ubuntu/Debian

Mục này **chưa kiểm chứng** trên VPS Linux thật. Bot chỉ kết nối đi ra nên không cần mở thêm cổng nào ngoài SSH.

```bash
# Cài Docker Engine và plugin Compose theo hướng dẫn apt chính thức (không dùng curl | sh):
#   https://docs.docker.com/engine/install/ubuntu/    hoặc    https://docs.docker.com/engine/install/debian/
# Kiểm tra: docker compose version   (cần v2; đã thử với 2.32.4)               # chưa kiểm chứng trên Linux
sudo usermod -aG docker "$USER"      # chưa kiểm chứng; đăng xuất rồi đăng nhập lại
sudo apt-get install -y git          # chưa kiểm chứng

sudo ufw allow OpenSSH               # chưa kiểm chứng
sudo ufw enable                      # chưa kiểm chứng
```

Lưu ý về `ufw`: các cổng do Docker publish bỏ qua `ufw`, nhưng stack này không publish cổng nào nên không bị ảnh hưởng. Đừng tự thêm `ports:` cho Lavalink, PostgreSQL hoặc Redis. Dịch vụ `web` tùy chọn chỉ publish trên `127.0.0.1`, máy khác không tới được dù `ufw` cho phép gì. Khi dùng web dashboard, mở 80 và 443 cho reverse proxy: `sudo ufw allow 80,443/tcp` (chưa kiểm chứng).

Cấu hình tối thiểu: khoảng 2 GB RAM trống (Lavalink mặc định `-Xmx1G`, chỉnh bằng `LAVALINK_JAVA_OPTS`), image bot khoảng 207 MB.

## 3. Lần chạy đầu

```bash
git clone <URL-kho-mã-của-bạn> perry && cd perry   # chưa kiểm chứng: kho thử chưa có remote
./scripts/setup.sh
make up
```

Điều nên thấy:

- `setup.sh` hỏi token (nhập ẩn) và Application ID, in liên kết mời bot và các bước tiếp theo. Chạy lại không đổi gì. Bạn cũng có thể chạy `DISCORD_TOKEN=... DISCORD_CLIENT_ID=... ./scripts/setup.sh --non-interactive`, hoặc `--env-file đường/dẫn` để ghi `.env` ở nơi khác. Mọi giá trị được kiểm tra trước khi ghi: token chỉ gồm `[A-Za-z0-9._~+/=_-]` (từ 20 ký tự), ID là 17-20 chữ số, khóa Last.fm là 8-64 ký tự chữ-số; giá trị sai thì `.env` giữ nguyên và lệnh thoát mã 1.
- `make up` = `./scripts/deploy.sh`: build image bot, chạy stack, rồi chờ lần lượt `lavalink-init` (thoát mã 0), `postgres`, `redis`, `lavalink` và `bot` khỏe (tối đa 300 giây, đổi bằng `--timeout SEC`). Thành công thì in `docker compose ps` và các bước kế tiếp. Nếu một dịch vụ lỗi, nó in 30 dòng log cuối của dịch vụ đó và thoát mã 1. Một dịch vụ có số lần khởi động lại tăng trong lúc chờ bị coi là `crash loop` ngay, không đợi hết thời gian.
- Log bot mỗi lần khởi động (đã quan sát): `Database migrations applied`, `Redis connected`, `Postgres connected`; sau đó, nếu đăng nhập được, bot ghi dòng sẵn sàng và bắt đầu ghi heartbeat (phần sau đăng nhập thật **chưa kiểm chứng**). Bảng migration `drizzle.__drizzle_migrations` có đúng 1 dòng dù khởi động nhiều lần (v1.3: 2 dòng, thêm `0001_guild_language`).
- Với token giả, bot ghi **đúng một** dòng `Login failed: An invalid token was provided.`, chờ 30 giây (để Docker không dội yêu cầu lên Discord) rồi thoát để `restart: unless-stopped` khởi động lại; vì vậy `make up` báo thất bại sau khoảng 35-40 giây và `doctor.sh` hiện `FAIL bot login`.
- Biến thể: `docker compose up -d` làm cùng việc: nó chờ postgres, redis và lavalink khỏe (lần đầu tới ~90 giây) rồi trả về, nhưng không chờ bot đăng nhập Discord, và không build với nhãn phiên bản (image mang nhãn `dev`/`unknown`). `./scripts/deploy.sh --build-only` (= `make build`) chỉ build; `--no-build` bỏ qua build/pull.
- Lệnh slash được bot tự đăng ký khi đăng nhập thành công. Nếu đặt `DEV_GUILD_ID`, lệnh chỉ đăng ký vào máy chủ đó (tức thì); để trống thì đăng ký toàn cầu (tới ~1 giờ mới hiện). Đăng ký thật lên Discord **chưa kiểm chứng**.

Xem log và trạng thái:

```bash
./scripts/logs.sh                 # mọi dịch vụ, 200 dòng cuối rồi theo dõi
./scripts/logs.sh bot --tail 50   # một dịch vụ
make ps
```

## 4. Cập nhật và quay lui

```bash
./scripts/update.sh --dry-run     # chỉ in các bước
./scripts/update.sh               # = make update
```

`update.sh` làm theo thứ tự: sao lưu PostgreSQL (nếu stack đang chạy và khỏe; lần cài đầu thì bỏ qua), `git pull --ff-only` (chỉ khi là bản clone git có commit; nếu không, in `Not a git clone, skipping git pull.`), build lại hoặc pull `BOT_IMAGE`, `docker compose up -d --remove-orphans` (chỉ dịch vụ có thay đổi bị tạo lại), rồi chờ khỏe. Tùy chọn: `--skip-backup`, `--timeout SEC`.

- Nếu `git pull --ff-only` thất bại (nhánh phân kỳ, mất mạng), lệnh dừng với `Nothing has been changed yet.` và mã 1.
- Nếu bước sau đó thất bại, lệnh in hướng dẫn quay lui và thoát mã 1; nó không xóa gì:
  1. `git checkout <commit-trước>` (mã commit được in ra) rồi `./scripts/deploy.sh`;
  2. nếu migration của bản mới đã đổi lược đồ, khôi phục cả cơ sở dữ liệu: `./scripts/restore.sh backups/<bản-sao-lưu-vừa-tạo>.dump`. Migration chỉ đi tiến, mã cũ không tự hạ lược đồ.
- Nhãn `revision` của image là SHA commit sau khi pull, nên `docker image inspect` cho biết đang chạy bản nào.

### Nâng cấp lên v1.3

- `./scripts/update.sh` sao lưu PostgreSQL trước như mọi lần.
- Bot tự áp dụng migration `0001_guild_language` (thêm cột `guild_settings.language`) khi khởi động.
- Tùy chọn: đặt `DEFAULT_LOCALE=vi` trong `.env` để giữ tiếng Việt làm mặc định (v1.3 mặc định là tiếng Anh). Chạy lại `./scripts/setup.sh` để thêm khóa mới vào `.env` hiện có (in `Added new key: DEFAULT_LOCALE`), rồi `./scripts/deploy.sh`.
- Lệnh slash được đăng ký lại một lần vì định nghĩa lệnh đã đổi.
- Khi chạy bot trên máy host thay vì Docker, chạy `npm run db:migrate` trước khi khởi động; nếu không, bot ghi log `Database schema is missing or outdated` và chạy ở chế độ suy giảm.
- Câu trả lời và tin nhắn trong kênh chuyển sang tiếng Anh, trừ khi máy chủ chọn ngôn ngữ bằng `/settings language` hoặc đã đặt `DEFAULT_LOCALE=vi`. Log bằng tiếng Anh.

### Nâng cấp lên v1.4

- `./scripts/update.sh` sao lưu PostgreSQL trước như mọi lần. Giữ bản sao lưu đó tới khi bản nâng cấp chạy ổn.
- Bot tự áp dụng migration `0002_moderation` và `0003_leveling` khi khởi động. `0002` thêm bảng `mod_cases`, `mod_case_counters` và hai cột `guild_settings.mod_log_channel_id`, `mod_dm_target`; `0003` thêm bảng `member_levels`, `level_role_rewards` và các cột cấp độ của `guild_settings` (hệ thống cấp độ vẫn tắt ở mọi máy chủ cho tới khi được bật). Khi chạy bot trên máy host thay vì Docker, chạy `npm run db:migrate` trước khi khởi động; nếu không, bot ghi log `Database schema is missing or outdated` và chạy ở chế độ suy giảm.
- Lệnh slash được đăng ký lại một lần vì định nghĩa lệnh đã đổi (8 lệnh kiểm duyệt, `/rank`, `/leaderboard`, `/xp`, `/settings mod-log`, `/settings mod-dm` và `/settings leveling`).
- Vai trò của bot ở mỗi máy chủ cần các quyền mới Kick Members, Ban Members, Timeout Members, Manage Messages, Read Message History, Manage Roles và Manage Server (cho quy tắc AutoMod của dashboard): mở lại liên kết mời mới trong README, hoặc tự cấp các quyền đó cho vai trò của bot.
- Kéo vai trò của bot lên trên các thành viên mà bot cần xử lý và trên mọi vai trò thưởng cấp độ (Cài đặt máy chủ > Vai trò); Discord từ chối thao tác với thành viên và vai trò không thấp hơn vai trò cao nhất của bot.
- Bot giờ dùng thêm intent gateway `GuildMessages` (để tính XP). Intent này không phải privileged nên không cần đổi gì trong Developer Portal cho bot. Bot không cần biến `.env` mới; chạy lại `./scripts/setup.sh` sẽ thêm các khóa của web (mục 6 của `.env.example`) và sinh `SESSION_SECRET`, việc này không thay đổi gì khi web đang tắt.
- Web dashboard tùy chọn: thêm client secret và redirect trong Developer Portal (README, bước 6 của "Tạo ứng dụng bot"), chạy `./scripts/setup.sh --web`, rồi `./scripts/deploy.sh`, và cấu hình reverse proxy ở [mục 7](#7-web-dashboard-sau-reverse-proxy). Khi `COMPOSE_PROFILES` không có `web`, stack giữ nguyên năm dịch vụ. Dashboard cần bot v1.4: bot cũ hơn không đăng danh sách máy chủ của nó, nên dashboard trả 503 `bot_unavailable`.

## 5. Sao lưu, khôi phục, giữ bản

```bash
./scripts/backup.sh                 # = make backup. In đường dẫn tệp và dung lượng
./scripts/backup.sh --keep 7        # giữ 7 bản (mặc định: BACKUP_KEEP trong .env, rồi 14)
./scripts/backup.sh --quiet         # chỉ in đường dẫn (dùng trong script/cron)
./scripts/restore.sh backups/perry-YYYYmmdd-HHMMSS.dump     # = make restore FILE=...
./scripts/restore.sh --latest --yes # bản mới nhất, không hỏi lại
```

- `backup.sh` cần dịch vụ `postgres` đang khỏe. Nó chạy `pg_dump -Fc` trong container, ghi vào tệp tạm trong `backups/` rồi đổi tên thành `backups/perry-YYYYmmdd-HHMMSS.dump`, kiểm tra bằng `pg_restore --list`, đặt quyền `600` (thư mục `700`). Thư mục `backups/` bị `.gitignore` loại trừ.
- Giữ bản: chỉ các tệp có tên đúng mẫu `perry-YYYYmmdd-HHMMSS.dump` bị dọn khi vượt quá `BACKUP_KEEP`. Tệp khác trong thư mục, kể cả `perry-prerestore-*.dump`, không bao giờ bị xóa tự động.
- `restore.sh` **ghi đè** dữ liệu PostgreSQL hiện tại. Nó kiểm tra tệp, yêu cầu gõ đúng `yes` (hoặc `--yes`, hoặc `ASSUME_YES=1`), từ chối chạy khi không có terminal mà thiếu `--yes`, tự tạo `backups/perry-prerestore-<giờ>.dump` trước, dừng bot, chạy `pg_restore --clean --if-exists --no-owner --no-privileges`, rồi khởi động lại bot. Nếu `pg_restore` lỗi, bot được để dừng và lệnh in cách thử lại bằng bản sao lưu an toàn. Đã thử vòng: chèn dòng đánh dấu, sao lưu, xóa dòng, khôi phục, dòng trở lại.
- Redis **không** được sao lưu: dữ liệu trong đó đều tái tạo được (cooldown, bộ nhớ đệm, snapshot hàng đợi sống 6 giờ, hash lệnh slash).
- Lên lịch sao lưu hằng ngày bằng cron (ví dụ `0 4 * * * cd /đường/dẫn/perry && ./scripts/backup.sh --quiet >> /dev/null`): chưa kiểm chứng.
- Chép các tệp `backups/*.dump` sang nơi khác (máy khác, kho lưu trữ đối tượng): chúng chứa dữ liệu thật, bảo vệ như `.env`.

## 6. `doctor.sh`

```bash
./scripts/doctor.sh      # = make doctor
```

In bảng `STATUS / CHECK / DETAIL` với `PASS`, `FAIL`, `WARN` hoặc `SKIP`, thoát mã 1 nếu có ít nhất một `FAIL`. Ví dụ (các hàng của lần chạy thật v1.2 với token giả, viết lại bằng thông báo tiếng Anh của v1.3; một vài hàng lược bớt; với v1.3 hàng migration báo 2):

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

- Nó chỉ in tên biến và dạng của token, không bao giờ in giá trị. Mật khẩu Lavalink được mở rộng bên trong container, không xuất hiện ở máy host.
- Nó tìm container qua nhãn của Compose, nên chạy được cả khi `.env` thiếu hoặc stack đang dừng (khi đó các hàng là `FAIL ... not running` hoặc `SKIP`, không bị lỗi).
- Hàng `bot login` chỉ nhận ra dòng `Login failed` trong 200 dòng log gần nhất. Một container bot `healthy` chỉ có nghĩa là heartbeat còn mới; với bot thật điều này cần đăng nhập Discord thành công (**chưa kiểm chứng**).

Khi bật web dashboard (`COMPOSE_PROFILES=web`), bảng có thêm các hàng sau (từ một lần chạy v1.4 với token giả, nên bot không bao giờ đăng nhập):

```
PASS   env web              all set: DISCORD_CLIENT_SECRET PUBLIC_URL SESSION_SECRET
PASS   public url           an https origin (or http on loopback), no path
PASS   session secret       64 characters
PASS   container web        healthy (restarts: 0)
PASS   web health           /healthz: Postgres and Redis reachable
WARN   web bridge           the bot has not published its guild list; it is offline or older than 1.4 (the dashboard answers 503)
PASS   published ports      nothing is exposed beyond 127.0.0.1 (only the web may bind 127.0.0.1)
```

- `env web` báo FAIL khi `DISCORD_CLIENT_SECRET`, `PUBLIC_URL` hoặc `SESSION_SECRET` trống. `public url` báo FAIL trừ khi `PUBLIC_URL` là một origin như `https://perry.example.com` (http chỉ cho `localhost`, `127.0.0.1` và `[::1]`; không có đường dẫn hay dấu `/` ở cuối; cổng 1-65535); giá trị không được in ra. `session secret` báo FAIL khi ngắn hơn 32 ký tự.
- `web bridge` đọc TTL của danh sách máy chủ mà bot đăng lên Redis: PASS khi bot v1.4 đã đăng nhập, WARN trong trường hợp khác (khi đó dashboard trả 503 `bot_unavailable`).
- `published ports` chỉ chấp nhận dịch vụ `web`, và chỉ khi bind `127.0.0.1`; mọi cổng publish khác đều là FAIL.
- Khi không bật profile web, bảng chỉ có một hàng `SKIP web` thay cho các hàng trên.

## 7. Web dashboard sau reverse proxy

Web dashboard (v1.4, `COMPOSE_PROFILES=web`) chỉ được publish trên `127.0.0.1:${WEB_PORT:-3000}`. Hãy phục vụ nó qua HTTPS bằng một reverse proxy trên cùng máy chủ, tại địa chỉ đặt trong `PUBLIC_URL`. Cả hai ví dụ dưới đây **chưa kiểm chứng** trên máy chủ thật.

Caddy (tự lấy và gia hạn chứng chỉ):

```
perry.example.com {
    header Strict-Transport-Security "max-age=31536000"
    reverse_proxy 127.0.0.1:3000
}
```

nginx (chứng chỉ từ certbot hoặc của bạn; chuyển cổng 80 sang https bằng một khối `server` riêng):

```nginx
server {
    listen 443 ssl;
    server_name perry.example.com;
    ssl_certificate     /etc/letsencrypt/live/perry.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/perry.example.com/privkey.pem;
    add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- `PUBLIC_URL` phải đúng là địa chỉ người dùng mở (`https://perry.example.com`, không có đường dẫn hay dấu `/` ở cuối), và `<PUBLIC_URL>/auth/callback` phải có trong OAuth2 > Redirects của Developer Portal. Lần lưu bị từ chối với 403 `csrf_failed` khi `Origin` của trình duyệt không khớp `PUBLIC_URL`.
- Địa chỉ IP của client cho giới hạn tần suất: web đọc `X-Forwarded-For` từ phải sang và bỏ qua các địa chỉ trong `WEB_TRUST_PROXY` (mặc định `loopback,uniquelocal`), nên client không tự chọn được nhóm giới hạn của mình bằng header giả. Chỉ thêm địa chỉ proxy của bạn nếu nó chạy ở máy khác có địa chỉ công khai.
- HSTS: web không gửi header này vì nó còn chạy trên `http://localhost` khi phát triển. Hãy thêm ở proxy như trên.
- Tường lửa: mở 80 và 443 cho proxy (`sudo ufw allow 80,443/tcp`, chưa kiểm chứng). Không bao giờ publish cổng 3000 trên `0.0.0.0`; `doctor.sh` báo `FAIL published ports` khi đó.
- Sau khi thay đổi, `./scripts/doctor.sh` nên hiện `PASS public url` và `PASS web health`; rồi mở `PUBLIC_URL` trong trình duyệt và đăng nhập.

## 8. Giới hạn tài nguyên

`docker-compose.yml` có sẵn ví dụ đang để dạng chú thích cho `bot` và `lavalink`. Bỏ chú thích và chỉnh theo VPS:

```yaml
deploy:
  resources:
    limits:
      cpus: "2.0"
      memory: 1536M # Lavalink: giữ lớn hơn heap -Xmx trong LAVALINK_JAVA_OPTS
```

Chưa kiểm chứng việc áp dụng các giới hạn này. Nếu hạ `-Xmx`, đặt `LAVALINK_JAVA_OPTS=-Xmx512M` trong `.env` rồi `docker compose up -d`.

## 9. Dùng image dựng sẵn (`BOT_IMAGE`, GHCR)

Mặc định stack build bot từ mã nguồn, không cần tài khoản registry. Nếu chủ dự án phát hành image, đặt trong `.env`:

```
BOT_IMAGE=ghcr.io/<chủ-sở-hữu>/<kho>:1.4.0
```

Khi `BOT_IMAGE` được đặt, `deploy.sh` và `update.sh` chạy `docker compose pull bot` thay vì build. Dịch vụ `web` dùng cùng image đó. Chỉ đường lỗi (không kéo được image) đã được thử; việc kéo image thật **chưa kiểm chứng**.

- Workflow `.github/workflows/release.yml` build `linux/amd64` và `linux/arm64` khi đẩy tag `v*` và đẩy lên `ghcr.io/<github.repository viết thường>` với các tag `<phiên bản>`, `<chính>.<phụ>` và `latest` (`latest` chỉ được gắn cho bản ổn định, không gắn cho tag tiền phát hành như `v1.3.0-rc1`), bằng `GITHUB_TOKEN` (quyền `packages: write` chỉ ở cấp job). Workflow này chỉ mới được viết và kiểm tra bằng actionlint; chưa chạy trên GitHub.
- Gói GHCR mới tạo thường ở chế độ riêng tư. Trên máy chủ cần `docker login ghcr.io` bằng token có quyền `read:packages`, hoặc đổi gói sang công khai trong cài đặt gói trên GitHub (chưa kiểm chứng).
- Workflow `ci.yml` (mỗi lần push lên `main` và mỗi pull request) chạy typecheck, lint, build, `check-commands`, `npm test`, sinh kiểu, kiểm tra kiểu, build và kiểm tra bundle của web, shellcheck, `docker build` không đẩy, `docker compose config` cho cả hai tệp compose (và với `--profile web`) và so sánh tag image giữa chúng. Các lệnh shell của nó đã được chạy lại cục bộ; chính workflow chưa chạy trên GitHub.

## 10. Hạ tầng phát triển

`docker-compose.dev.yml` chỉ chứa Lavalink, PostgreSQL và Redis cho `npm run dev`, bind `127.0.0.1`.

```bash
make dev-infra            # Lavalink + PostgreSQL + Redis (= docker compose -f docker-compose.dev.yml --profile storage up -d)
make dev-infra-down       # dừng, giữ dữ liệu
docker compose -f docker-compose.dev.yml up -d lavalink    # chỉ Lavalink, chế độ STORAGE_DRIVER=memory
```

Chi tiết cổng, biến và cách chạy bot trên máy host xem [README, mục "Chạy hạ tầng phát triển"](../README.vi.md#chạy-hạ-tầng-phát-triển-lavalink-postgresql-redis). Hai tệp compose phải giữ cùng tag image; CI kiểm tra điều đó. Web dashboard chạy trên máy host bằng `npm run web:dev` (xem [README, mục "Phát triển cục bộ"](../README.vi.md#phát-triển-cục-bộ)).

## 11. Nâng cấp từ stack dev v1.1

Stack dev của v1.1 dùng project `perry-lavalink` với volume `postgres-data`/`redis-data` (tên đầy đủ có tiền tố `perry-lavalink_`), còn stack production dùng project `perry` với volume riêng, nên dữ liệu **không** tự chuyển sang. `docker-compose.dev.yml` giữ nguyên tên project, volume và mạng của v1.1, nên dữ liệu dev cũ vẫn gắn lại khi bạn chạy `make dev-infra`. Cache plugin trước đây là bind mount `lavalink/plugins/`; nay là volume nên plugin tải lại một lần.

Nếu muốn mang cài đặt máy chủ từ stack dev sang production (toàn bộ quy trình dưới đây **chưa kiểm chứng** vì cần dữ liệu v1.1 thật):

```bash
# 1. Bật stack dev cũ và xuất dữ liệu (tên tệp đúng mẫu để --latest nhận ra)
make dev-infra
mkdir -p backups
docker compose -f docker-compose.dev.yml exec -T postgres pg_dump -U perry -d perry -Fc > backups/perry-$(date +%Y%m%d-%H%M%S).dump   # chưa kiểm chứng
make dev-infra-down

# 2. Chạy stack production rồi khôi phục vào đó
./scripts/setup.sh
make up
./scripts/restore.sh --latest      # chưa kiểm chứng với dữ liệu v1.1 thật
```

Mật khẩu PostgreSQL trong `.env` phải là mật khẩu của stack dev cũ khi xuất dữ liệu (dump không chứa mật khẩu, nên khôi phục vào stack mới dùng mật khẩu mới là bình thường). Kiểm tra lược đồ: sau khôi phục, bot tự chạy migration còn thiếu khi khởi động lại.

## 12. Danh sách kiểm tra bảo mật

- [ ] `.env` có quyền `600` và không nằm trong git (`doctor.sh` kiểm tra quyền).
- [ ] Token Discord chưa từng bị dán vào log, issue hay chat. Nếu lộ: **Reset Token**, sửa `.env`, `./scripts/deploy.sh`.
- [ ] Không có `ports:` cho Lavalink, PostgreSQL, Redis (`doctor.sh` hàng `published ports`). Trên VPS chỉ SSH được mở, thêm 80 và 443 cho reverse proxy khi bật web dashboard.
- [ ] Web dashboard: cổng của `web` luôn bind `127.0.0.1` (cổng do Docker publish bỏ qua `ufw`, nhưng máy khác không tới được cổng bind `127.0.0.1`; `doctor.sh` báo FAIL với mọi kiểu bind khác). Reverse proxy phục vụ HTTPS và gửi HSTS.
- [ ] `DISCORD_CLIENT_SECRET` và `SESSION_SECRET` được bảo vệ như token. Nếu lộ client secret, reset nó trong Developer Portal (OAuth2), sửa `.env` rồi chạy `./scripts/deploy.sh`; đổi `SESSION_SECRET` sẽ đăng xuất mọi người dùng dashboard.
- [ ] Chỉ người tin cậy có Manage Server: trong dashboard họ thấy tên mọi kênh bot thấy được, kể cả kênh riêng tư.
- [ ] Chỉ người tin cậy thuộc nhóm `docker` (nhóm này tương đương root; mật khẩu nằm trong biến môi trường của container và tham số tiến trình Redis, đọc được qua `docker inspect`).
- [ ] Thư mục `backups/` có quyền `700`, các tệp `600`, và bản sao ngoài máy được bảo vệ tương đương.
- [ ] Bật cập nhật bảo mật cho hệ điều hành VPS và chạy `./scripts/update.sh` định kỳ để nhận bản vá của image bot.
- [ ] Mật khẩu đổi bằng cách sửa `.env` rồi `docker compose up -d` (chưa kiểm chứng trên stack đang chạy). Riêng `POSTGRES_PASSWORD` chỉ có tác dụng khi volume còn trống: sau lần chạy đầu, đổi bằng `ALTER USER` trong PostgreSQL.
- [ ] Nếu chạy bot công khai: xem các giới hạn của bộ lọc SSRF trong [README, mục "Bảo mật"](../README.vi.md#bảo-mật).

Đã kiểm tra trên image và stack thật: bot chạy uid 1000 (`node`), hệ tệp gốc chỉ đọc (ghi vào `/` bị từ chối, `/tmp` ghi được), `cap_drop: ALL`, `no-new-privileges`, `init: true`; token và mật khẩu sinh ra không xuất hiện trong log của stack, `docker history` hay `docker image inspect` của image bot. v1.4: container `web` chạy theo cùng cách (uid 1000, hệ tệp gốc chỉ đọc, chỉ `/tmp` và thư mục cache của Next.js ghi được, `cap_drop: ALL`, `no-new-privileges`), không nhận `DISCORD_TOKEN` và chỉ được publish trên `127.0.0.1`.

## 13. arm64 và amd64

- Cả bốn image gốc (`node:24.22.0-alpine3.24`, `ghcr.io/lavalink-devs/lavalink:4.2.2`, `postgres:18.6-alpine3.24`, `redis:8.8.3-alpine3.23`) có bản `linux/amd64` và `linux/arm64`; kiểm tra bằng `docker buildx imagetools inspect`.
- Cây phụ thuộc runtime của bot không có module native (77 gói, không gói nào có script cài đặt hoặc ràng buộc `os`/`cpu`), nên `node_modules` dùng chung cho mọi kiến trúc. `Dockerfile` có bước kiểm tra làm hỏng build nếu sau này có gói runtime như vậy.
- Đã build thật trên arm64 (máy thử). Image `linux/amd64` đã build và chạy qua giả lập, in ra `x64`; chạy trực tiếp trên máy amd64 **chưa kiểm chứng**.
- `docker buildx build --platform linux/amd64,linux/arm64` một lệnh không chạy được với driver `docker` mặc định của máy thử ("Multi-platform build is not supported for the docker driver"); GitHub Actions dùng `setup-buildx-action` nên không gặp giới hạn này, nhưng chưa chạy.
- v1.4: web được build bằng Next.js ở giai đoạn build, trên nền tảng build (SWC, Tailwind và lightningcss dùng binary native ở đó). Kết quả standalone là JavaScript thuần, nên runtime vẫn không có module native. Bản build web đã chạy trên arm64; image `linux/amd64`, có giai đoạn build cũng chạy trên arm64, đã được kiểm tra qua giả lập. Bản build web trên x64 (musl trên máy build amd64, như trong CI và `release.yml`) **chưa kiểm chứng**: qua giả lập nó không tiến triển trong 58 phút và đã bị dừng. Chỉ các binary musl x64 của SWC, Tailwind và lightningcss đã được cài bằng `npm ci` và nạp được qua giả lập.

## 14. Gỡ sạch

```bash
make down                        # dừng, giữ dữ liệu
docker compose down -v           # XÓA luôn volume PostgreSQL, Redis và cache plugin (không hoàn tác)
```

Hãy chạy `./scripts/backup.sh` và chép bản sao ra ngoài trước khi dùng `down -v`.

## 15. Chưa được kiểm chứng

- Đăng nhập Discord thật trong container: heartbeat sau khi sẵn sàng, `HEALTHCHECK` chuyển `healthy`, đăng ký lệnh slash lên Discord, phát âm thanh thật.
- Tắt êm khi có gateway và player thoại thật (mới thử đường tắt trước khi đăng nhập).
- VPS Linux thật: cài Docker từ apt, `ufw`, `usermod`, quyền khi bind mount trên Linux, bash/GNU userland cho `backup.sh`, `restore.sh`, `update.sh`, `doctor.sh` (macOS bash 3.2 đã chạy tất cả; `setup.sh` còn chạy trong Debian 12).
- Windows (WSL2, Git Bash), Docker Compose cũ hơn 2.32.
- `git clone` từ kho từ xa thật; `git pull --ff-only` mới thử với kho giả trong `/tmp`.
- Kéo image từ registry thật bằng `BOT_IMAGE`; GHCR (đẩy image, quyền, chế độ hiển thị gói).
- Chạy `ci.yml` và `release.yml` trên GitHub (chỉ actionlint và chạy lại cục bộ các lệnh shell); build đa nền tảng bằng một lệnh buildx cục bộ.
- Chạy image `linux/amd64` trực tiếp trên máy amd64.
- Cron sao lưu, xoay mật khẩu trên stack đang chạy, giới hạn tài nguyên mẫu, quy trình chuyển dữ liệu từ stack dev v1.1, khôi phục vào cơ sở dữ liệu có lược đồ khác với mã hiện tại.
- Thời gian build lần đầu trên máy trắng; dung lượng đĩa và RAM thực tế trên VPS.
- v1.3: hiển thị lệnh đã bản địa hóa trong ứng dụng Discord thật, `/settings language` trong máy chủ thật, nâng cấp stack đang chạy thật (chi tiết trong README).
- v1.4 kiểm duyệt: mọi hành động kiểm duyệt với thành viên Discord thật (thứ bậc, tin nhắn riêng, lý do trong nhật ký kiểm tra, `/purge`), nhật ký kiểm duyệt trong ứng dụng thật, việc cập nhật quyền khi mời lại bot, nâng cấp stack đang chạy thật lên v1.4 (chi tiết trong README).
- v1.4 cấp độ: XP từ tin nhắn thật, thông báo lên cấp trong kênh thật, vai trò thưởng với thứ bậc vai trò thật, nút của `/leaderboard` trong ứng dụng thật (chi tiết trong README).
- v1.4 web dashboard: đăng nhập Discord thật (màn hình đồng ý, đổi mã lấy token, thu hồi token), dữ liệu máy chủ thật và cầu nối Redis với bot đã kết nối Discord, quy tắc AutoMod trong máy chủ thật, các ví dụ reverse proxy ở mục 7 trên máy chủ thật, trình duyệt khác Chrome headless, các bước web của `ci.yml` trên GitHub, `npm run web:build` trên x64 musl và glibc (mục 13; chi tiết trong README).
- Mọi mục đã nêu trong [README, mục "Những gì chưa được kiểm chứng runtime"](../README.vi.md#những-gì-chưa-được-kiểm-chứng-runtime) (v1 và v1.1) vẫn còn hiệu lực.
