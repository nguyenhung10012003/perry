# Perry - Bot Discord phát nhạc (TypeScript)

[English](README.md) | **Tiếng Việt**

Bot Discord đa máy chủ viết bằng TypeScript (discord.js 14) và phát nhạc qua máy chủ âm thanh [Lavalink](https://lavalink.dev) 4.2.2. Phiên bản 1.1 bổ sung lưu trữ bền vững (PostgreSQL + Redis), tự khám phá nhạc (autoplay, radio, bài tương tự) và khôi phục phiên phát sau khi khởi động lại. Phiên bản 1.2 đóng gói toàn bộ thành image Docker và stack Docker Compose chạy bằng ba lệnh, kèm script cài đặt, cập nhật, sao lưu và chẩn đoán. Phiên bản 1.3 (hiện tại) quốc tế hóa bot: tiếng Anh là mặc định, tiếng Việt chọn được theo từng máy chủ (xem [Ngôn ngữ](#ngôn-ngữ)). Bot có cấu trúc module để sau này thêm các nhóm tính năng khác (moderation, leveling, ...).

## Triển khai nhanh

Từ `git clone` tới bot đang chạy trong ba lệnh, bằng Docker Compose (bot + Lavalink + PostgreSQL + Redis trong một tệp). Mọi lệnh dưới đây đã được chạy thật trong lúc kiểm tra v1.2, trừ những dòng ghi rõ `chưa kiểm chứng`.

### Yêu cầu

- Docker Engine kèm Docker Compose v2 (kiểm tra bằng `docker compose version`), khoảng 2 GB RAM trống. Đã thử với Engine 27.5.1 và Compose 2.32.4 trên macOS (Docker Desktop, arm64).
- Linux hoặc macOS. Windows: dùng WSL2 (chưa kiểm chứng).
- Đã tạo ứng dụng bot trên Discord: xem [Tạo ứng dụng bot và lấy token](#tạo-ứng-dụng-bot-và-lấy-token) để có `DISCORD_TOKEN` và `DISCORD_CLIENT_ID`, và [Liên kết mời bot](#liên-kết-mời-bot) để mời bot vào máy chủ.

### Ba lệnh

```bash
git clone <URL-kho-mã-của-bạn> perry && cd perry   # chưa kiểm chứng: kho này chưa có remote nên chưa clone thử được
./scripts/setup.sh
docker compose up -d                                 # hoặc: make up
```

- `./scripts/setup.sh` hỏi `DISCORD_TOKEN` (nhập ẩn) và `DISCORD_CLIENT_ID`, tự sinh ba mật khẩu ngẫu nhiên cho Lavalink, PostgreSQL và Redis, tạo `.env` với quyền `600`, rồi in liên kết mời bot. Chạy lại bao nhiêu lần cũng được, giá trị đã có không bị ghi đè. Không bao giờ in token hay mật khẩu ra màn hình.
- `make up` (hay `./scripts/deploy.sh`) build image, chạy stack và **chờ tới khi các dịch vụ khỏe**; nếu không, in 30 dòng log cuối của dịch vụ lỗi. `docker compose up -d` chờ postgres, redis và lavalink khỏe (lần đầu tới ~90 giây) rồi trả về, nhưng không chờ bot đăng nhập Discord; dùng `make up` để chờ cả bot và in log khi lỗi.
- Lần đầu Lavalink tải 3 plugin nên mất khoảng 30-90 giây. Thời gian build image lần đầu trên máy trắng chưa được đo (lần kiểm tra có sẵn cache lớp).
- Bot tự chạy migration cơ sở dữ liệu và tự đăng ký lệnh slash khi khởi động (xem [Đăng ký lệnh slash](#đăng-ký-lệnh-slash)).
- Chạy tự động không hỏi (CI, script): `DISCORD_TOKEN=... DISCORD_CLIENT_ID=... ./scripts/setup.sh --non-interactive`.
- Dùng `make up` thay vì `docker compose up -d` nếu muốn nhãn phiên bản/commit của image đúng (lệnh thứ hai gắn nhãn `dev`/`unknown`).

Sau đó kiểm tra bằng `./scripts/doctor.sh` (hoặc `make doctor`) và xem log bằng `./scripts/logs.sh`.

### VPS Ubuntu/Debian từng bước

Bot chỉ kết nối **đi ra** (Discord, Lavalink nội bộ) nên không cần mở cổng nào vào ngoài SSH. Các bước cài đặt hệ điều hành dưới đây **chưa kiểm chứng** vì chưa thử trên VPS Linux thật:

```bash
# 1. Cài Docker Engine + Compose plugin theo hướng dẫn apt chính thức, không dùng curl | sh:
#    https://docs.docker.com/engine/install/ubuntu/   (hoặc /debian/)          # chưa kiểm chứng
sudo usermod -aG docker "$USER"    # chưa kiểm chứng; đăng xuất rồi đăng nhập lại để có hiệu lực
sudo apt-get install -y git        # chưa kiểm chứng

# 2. Tường lửa: chỉ cần SSH (stack này không publish cổng nào)
sudo ufw allow OpenSSH             # chưa kiểm chứng
sudo ufw enable                    # chưa kiểm chứng

# 3. Lấy mã nguồn, cấu hình, chạy
git clone <URL-kho-mã-của-bạn> perry && cd perry   # chưa kiểm chứng
./scripts/setup.sh
make up
```

Bước 3 (`setup.sh`, `make up`) đã chạy thật trên Docker Desktop; riêng `setup.sh` còn được chạy trong container Debian 12 (bash 5, GNU coreutils, không có `openssl`). Chi tiết từng bước và log mong đợi: [docs/DEPLOY.vi.md](docs/DEPLOY.vi.md).

### Cập nhật, sao lưu, log và chẩn đoán

```bash
./scripts/update.sh        # hoặc: make update. Sao lưu PostgreSQL, git pull --ff-only, build lại, chỉ tạo lại dịch vụ đổi
./scripts/update.sh --dry-run   # chỉ in các bước, không thay đổi gì
./scripts/backup.sh        # hoặc: make backup  -> backups/perry-YYYYmmdd-HHMMSS.dump (quyền 600, giữ 14 bản)
./scripts/restore.sh backups/perry-YYYYmmdd-HHMMSS.dump   # hoặc: make restore FILE=backups/perry-....dump
./scripts/restore.sh --latest --yes                      # khôi phục bản mới nhất, không hỏi lại
./scripts/logs.sh bot --tail 100   # hoặc: make logs SERVICE=bot
./scripts/doctor.sh        # hoặc: make doctor. Bảng PASS/FAIL/WARN; thoát 1 nếu có FAIL
make ps                    # trạng thái container
make down                  # dừng stack, GIỮ dữ liệu
```

- `update.sh` sao lưu trước khi làm gì khác; nếu `git pull --ff-only` hoặc bước sau đó lỗi, nó in cách quay lại (bản sao lưu, commit trước đó) và không xóa gì. Migration chỉ đi tiến: quay lại mã cũ sau khi lược đồ đã đổi cần khôi phục cả cơ sở dữ liệu.
- `restore.sh` là thao tác **phá hủy**: nó hỏi bạn gõ `yes` (hoặc cần `--yes`), tự sao lưu trước vào `backups/perry-prerestore-*.dump`, dừng bot, ghi đè dữ liệu PostgreSQL rồi khởi động lại bot. Không có terminal và không có `--yes` thì nó từ chối.
- Redis **không** nằm trong bản sao lưu: chỉ chứa cooldown, bộ nhớ đệm, snapshot hàng đợi (6 giờ) và hash lệnh slash, tất cả tự tái tạo.
- `make down` giữ nguyên volume. Không chạy `docker compose down -v` trừ khi muốn xóa sạch dữ liệu PostgreSQL, Redis và cache plugin.
- Số bản sao lưu giữ lại: `BACKUP_KEEP` trong `.env` (mặc định 14); chỉ các tệp `perry-YYYYmmdd-HHMMSS.dump` bị dọn, tệp `perry-prerestore-*` không bao giờ bị xóa tự động.
- Các lệnh `make down`, `make ps`, `make restart` gọi thẳng `docker compose`, nên cần `.env` đầy đủ (Compose kiểm tra các biến bắt buộc trên toàn tệp).

Xử lý nhanh:

| Triệu chứng                                                       | Cách xử lý                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `make up` báo `crash loop` hoặc bot không khỏe                    | `./scripts/doctor.sh`; nếu thấy `Login failed` thì `DISCORD_TOKEN` sai hoặc đã reset: sửa `.env` rồi `./scripts/deploy.sh`. |
| Bot khởi động lại mỗi 30-60 giây                                  | Token sai: bot chờ 30 giây sau khi đăng nhập thất bại rồi thoát để Docker khởi động lại, tránh dội yêu cầu lên Discord.     |
| Lavalink chưa `healthy` ở lần chạy đầu                            | Chờ 30-90 giây để tải 3 plugin; xem `./scripts/logs.sh lavalink`.                                                           |
| Đổi `POSTGRES_PASSWORD` sau lần chạy đầu mà bot không vào được DB | Mật khẩu chỉ có tác dụng khi volume còn trống; đổi bằng `ALTER USER` trong PostgreSQL hoặc khôi phục lại vào volume mới.    |
| Compose báo thiếu biến `DISCORD_TOKEN`, `LAVALINK_PASSWORD`, ...  | `.env` thiếu hoặc rỗng: chạy `./scripts/setup.sh`.                                                                          |

### Không dùng Docker cho bot

Có thể chạy bot trực tiếp bằng Node.js (>= 22.13), khi đó bạn tự có Lavalink, PostgreSQL và Redis (hoặc dùng [hạ tầng dev](#chạy-hạ-tầng-phát-triển-lavalink-postgresql-redis) bằng Docker Compose). Giữ nguyên các bước ở các mục [Cấu hình `.env`](#cấu-hình-env), [Lưu trữ](#lưu-trữ-postgresql--redis) và [Chạy bot](#chạy-bot):

```bash
npm ci
npm run db:migrate         # hoặc đặt AUTO_MIGRATE=true để bot tự migrate khi khởi động
npm run build && npm start
```

`AUTO_MIGRATE`, `REGISTER_COMMANDS_ON_START` và `HEARTBEAT_FILE` mặc định **tắt** khi chạy bằng `npm start` (hành vi y như v1.1); chỉ image Docker bật sẵn chúng.

### Lưu ý bảo mật khi triển khai

- Container bot chạy bằng user `node` (uid 1000), hệ tệp gốc chỉ đọc (chỉ `/tmp` ghi được), `cap_drop: ALL`, `no-new-privileges`. Bot không mở cổng HTTP nào.
- Không dịch vụ nào publish cổng ra máy chủ trong `docker-compose.yml`: Lavalink, PostgreSQL và Redis chỉ nằm trong mạng riêng của Docker (đã kiểm tra `PortBindings` rỗng cho cả 4 container). Đừng tự thêm `ports:` cho chúng.
- `.env` có quyền `600`; không commit, không dán vào issue hay chat. Nếu lộ token, vào Developer Portal chọn **Reset Token**, sửa `.env` rồi `./scripts/deploy.sh`.
- Đổi mật khẩu Lavalink/Redis: sửa `.env` rồi `docker compose up -d` (tạo lại container). Mật khẩu PostgreSQL xem bảng trên.
- Lưu ý: mật khẩu Redis và PostgreSQL nằm trong biến môi trường của container bot (`REDIS_URL`, `DATABASE_URL`) và trong tham số tiến trình của Redis, nên người dùng thuộc nhóm `docker` (tương đương root) đọc được qua `docker inspect`. Chỉ cấp nhóm `docker` cho người tin cậy.
- Image không chứa `.env`, token hay mật khẩu (đã kiểm tra `docker history` và `docker image inspect`, log của stack).

### Tài liệu chi tiết

[docs/DEPLOY.vi.md](docs/DEPLOY.vi.md): hướng dẫn VPS đầy đủ, cập nhật và quay lui, sao lưu, `doctor.sh` giải thích, giới hạn tài nguyên, dùng image dựng sẵn từ GHCR (`BOT_IMAGE`), nâng cấp từ stack dev v1.1, danh sách chưa kiểm chứng.

## Tính năng

- Phát nhạc từ YouTube, YouTube Music, SoundCloud và một số liên kết trực tiếp (Vimeo, Bandcamp, Twitch, tệp âm thanh `http(s)`), tìm kiếm bằng từ khóa kèm gợi ý tự động (autocomplete).
- Bộ lệnh điều khiển: phát, tạm dừng, tiếp tục, bỏ qua, phát lại bài trước, dừng, tua, âm lượng, lặp, xáo trộn, quản lý hàng đợi, bộ lọc âm thanh, lời bài hát.
- Thông báo "Đang phát" có các nút bấm (tạm dừng, bỏ qua, dừng, lặp, xáo trộn, hàng đợi).
- Hoạt động trên nhiều máy chủ cùng lúc: hàng đợi, cài đặt và bộ hẹn giờ đều tách riêng theo từng máy chủ.
- Vai trò DJ và cài đặt theo máy chủ qua `/settings`; cài đặt được lưu trong PostgreSQL nên không mất khi khởi động lại.
- Tự khám phá nhạc: `/autoplay` (tự thêm bài gợi ý khi hết hàng đợi), `/radio` (phát liên tục từ một bài hoặc từ khóa), `/similar` (xem và chọn bài tương tự).
- Liên kết playlist hoặc YouTube Mix được thêm toàn bộ vào hàng đợi, bắt đầu từ video đã chọn.
- Khôi phục phiên phát sau khi bot khởi động lại: bot vào lại kênh thoại và phát tiếp hàng đợi.
- Redis dùng cho cooldown, giới hạn tần suất, bộ nhớ đệm và ảnh chụp (snapshot) hàng đợi; có chế độ suy giảm khi PostgreSQL hoặc Redis không khả dụng.
- Tự rời kênh thoại khi chỉ còn một mình bot (60 giây) hoặc khi hàng đợi trống quá lâu (3 phút).
- Song ngữ: tiếng Anh (mặc định) và tiếng Việt, chọn theo máy chủ bằng `/settings language` hoặc mặc định của bot bằng `DEFAULT_LOCALE` (xem [Ngôn ngữ](#ngôn-ngữ)). Log luôn bằng tiếng Anh.

## Yêu cầu

- Triển khai bằng Docker (khuyến nghị): chỉ cần Docker Engine với Compose v2; Node.js không cần cài trên máy chủ vì bot được build trong image.
- Chạy bot trực tiếp hoặc phát triển: Node.js >= 22.13 (khuyến nghị 24 LTS, xem `.nvmrc`) cùng Docker Compose cho hạ tầng (hoặc Java 17+ nếu tự chạy Lavalink không qua Docker). Có thể bỏ PostgreSQL và Redis bằng `STORAGE_DRIVER=memory` (xem phần Lưu trữ).
- Một tài khoản Discord để tạo ứng dụng bot.

## Tạo ứng dụng bot và lấy token

1. Vào [Discord Developer Portal](https://discord.com/developers/applications), chọn **New Application**.
2. Tab **General Information**: sao chép **Application ID**. Đây là giá trị `DISCORD_CLIENT_ID`.
3. Tab **Bot**: chọn **Reset Token** để lấy token, đây là `DISCORD_TOKEN`. Token chỉ hiện một lần, không chia sẻ và không đưa vào git.
4. Bot chỉ dùng intents `Guilds` và `GuildVoiceStates`. **Không bật** bất kỳ Privileged Gateway Intent nào (Presence, Server Members, Message Content).
5. Để mời bot vào nhiều máy chủ, bật **Public Bot** trong tab **Bot** (mục này đã được bật mặc định với ứng dụng mới; nếu tắt, chỉ chủ ứng dụng mới mời được bot).

## Liên kết mời bot

Thay `<DISCORD_CLIENT_ID>` bằng Application ID của bạn:

```
https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot%20applications.commands&permissions=2150648832
```

- Scope: `bot applications.commands`.
- Quyền (permissions = `2150648832`): View Channels, Send Messages, Embed Links, Connect, Speak, Use Slash Commands.
- Giá trị `2150648832` được tính bằng `PermissionsBitField` của discord.js (1024 + 2048 + 16384 + 1048576 + 2097152 + 2147483648).

## Cấu hình `.env`

Cách nhanh: `./scripts/setup.sh` tạo `.env` từ `.env.example`, hỏi token và Application ID, tự sinh mật khẩu và điền sẵn `DATABASE_URL` / `REDIS_URL` cho chế độ chạy trên máy host. Chạy lại an toàn (không ghi đè giá trị đã có); khi `.env.example` có khóa mới, script tự thêm vào `.env` hiện có.

Cách thủ công:

```bash
cp .env.example .env
# Chạy 3 lần, mỗi lần dùng kết quả làm LAVALINK_PASSWORD, POSTGRES_PASSWORD và REDIS_PASSWORD
openssl rand -hex 24
```

Token, Application ID và mật khẩu trong `.env.example` được để trống có chủ đích: Docker Compose và bot đều từ chối khởi động cho tới khi bạn điền giá trị thật. Nên dùng chuỗi hex (chỉ ký tự `[A-Za-z0-9_-]`) để `DATABASE_URL` và `REDIS_URL` không chứa ký tự cần mã hóa. Khi sửa `.env` bằng tay, đừng để khoảng trắng, dấu nháy, `$`, `#` hay dấu backtick trong giá trị token và mật khẩu.

Chỉnh `.env` (tệp này đã nằm trong `.gitignore`, không bao giờ commit):

| Biến                          | Bắt buộc | Ý nghĩa                                                                                                                                                                                                                                 |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`               | Có       | Token bot.                                                                                                                                                                                                                              |
| `DISCORD_CLIENT_ID`           | Có       | Application ID.                                                                                                                                                                                                                         |
| `DEV_GUILD_ID`                | Không    | ID máy chủ dùng để đăng ký lệnh tức thì khi phát triển.                                                                                                                                                                                 |
| `LAVALINK_HOST`               | Có\*\*   | Địa chỉ Lavalink, mặc định `127.0.0.1`. Chỉ khi bot chạy trên máy host; `docker-compose.yml` tự đặt là `lavalink`.                                                                                                                      |
| `LAVALINK_PORT`               | Có\*\*   | Cổng Lavalink, mặc định `2333`. Khi chạy host, đây là cổng `docker-compose.dev.yml` publish (chỉ `127.0.0.1`).                                                                                                                          |
| `LAVALINK_PASSWORD`           | Có       | Mật khẩu dùng chung cho bot và Docker Compose (để trống thì cả hai đều báo lỗi). Chỉ dùng ký tự `[A-Za-z0-9_-]`.                                                                                                                        |
| `LAVALINK_SECURE`             | Không    | `true` khi Lavalink nằm sau TLS. Với `true`, thư viện yêu cầu cổng `443`. Stack Docker luôn đặt `false`.                                                                                                                                |
| `LOG_LEVEL`                   | Không    | `fatal`, `error`, `warn`, `info` (mặc định), `debug`, `trace`, `silent`. Stack trace chỉ được ghi ở `debug`/`trace`.                                                                                                                    |
| `LOG_PRETTY`                  | Không    | `true` để log dễ đọc (pino-pretty) thay vì JSON.                                                                                                                                                                                        |
| `STORAGE_DRIVER`              | Không    | `persistent` (mặc định: PostgreSQL + Redis) hoặc `memory` (mọi thứ trong bộ nhớ, không lưu gì). Stack Docker luôn dùng `persistent`.                                                                                                    |
| `DATABASE_URL`                | Có\*\*   | Chuỗi kết nối PostgreSQL khi chạy trên máy host và `persistent`; cũng dùng cho `npm run db:migrate`. Dạng `postgres://perry:<POSTGRES_PASSWORD>@127.0.0.1:<POSTGRES_PORT>/perry`. `docker-compose.yml` tự dựng URL riêng cho container. |
| `REDIS_URL`                   | Có\*\*   | Chuỗi kết nối Redis khi chạy trên máy host và `persistent`. Dạng `redis://:<REDIS_PASSWORD>@127.0.0.1:<REDIS_PORT>`. `docker-compose.yml` tự dựng URL riêng cho container.                                                              |
| `POSTGRES_PASSWORD`           | Có\*     | Mật khẩu PostgreSQL, chỉ Docker Compose đọc; phải khớp với `DATABASE_URL`.                                                                                                                                                              |
| `REDIS_PASSWORD`              | Có\*     | Mật khẩu Redis, chỉ Docker Compose đọc; phải khớp với `REDIS_URL`.                                                                                                                                                                      |
| `POSTGRES_PORT`               | Không    | Cổng PostgreSQL trên `127.0.0.1` (mặc định `5432`), chỉ `docker-compose.dev.yml` đọc. Đổi nếu bị trùng và sửa `DATABASE_URL` theo.                                                                                                      |
| `REDIS_PORT`                  | Không    | Cổng Redis trên `127.0.0.1` (mặc định `6379`), chỉ `docker-compose.dev.yml` đọc. Đổi nếu bị trùng và sửa `REDIS_URL` theo.                                                                                                              |
| `BOT_IMAGE`                   | Không    | Để trống: build image từ mã nguồn. Đặt (ví dụ `ghcr.io/<chủ-sở-hữu>/<kho>:1.3.0`) để `deploy.sh`/`update.sh` pull image dựng sẵn. Chỉ Docker Compose và script đọc.                                                                     |
| `AUTO_MIGRATE`                | Không    | `true` để bot tự chạy migration khi khởi động (khóa advisory của PostgreSQL chống chạy song song). Mặc định `true` trong image/compose, `false` khi chạy `npm start`.                                                                   |
| `REGISTER_COMMANDS_ON_START`  | Không    | `true` để bot tự đăng ký lệnh slash khi sẵn sàng, chỉ khi định nghĩa lệnh đổi. Mặc định `true` trong image/compose, `false` khi chạy `npm start`.                                                                                       |
| `REGISTER_COMMANDS_FORCE`     | Không    | `true` để bỏ qua so sánh hash và luôn đăng ký lại lệnh khi khởi động. Mặc định `false`.                                                                                                                                                 |
| `BACKUP_KEEP`                 | Không    | Số bản sao lưu PostgreSQL giữ lại khi chạy `scripts/backup.sh` (mặc định `14`).                                                                                                                                                         |
| `REDIS_KEY_PREFIX`            | Không    | Tiền tố mọi khóa Redis (`[a-z0-9_-]`, tối đa 32 ký tự, mặc định `perry`). Khóa có dạng `<prefix>:v1:...`.                                                                                                                               |
| `PLAYER_RESTORE`              | Không    | `true` (mặc định) để vào lại kênh thoại và phát tiếp hàng đợi sau khi khởi động lại.                                                                                                                                                    |
| `PLAY_HISTORY`                | Không    | `true` để ghi mọi bài đã phát (kèm ID người yêu cầu) vào PostgreSQL. Mặc định `false`.                                                                                                                                                  |
| `PUBSUB_INVALIDATION`         | Không    | `true` để nhiều tiến trình bot dùng chung việc làm mới cài đặt qua Redis pub/sub. Mặc định `false`.                                                                                                                                     |
| `DEFAULT_LOCALE`              | Không    | Ngôn ngữ mặc định của bot (v1.3): `en` (mặc định) hoặc `vi`; để trống = `en`. Dùng cho máy chủ chưa chọn ngôn ngữ bằng `/settings language`, cho trạng thái (presence) của bot và câu trả lời trong tin nhắn riêng. Giá trị khác làm bot từ chối khởi động. |
| `DISCOVERY_PROVIDERS`         | Không    | Thứ tự nguồn gợi ý, mặc định `ytmix,lastfm,lavasrc,artist`.                                                                                                                                                                             |
| `LASTFM_API_KEY`              | Không    | Khóa API Last.fm (miễn phí). Để trống thì bỏ qua nguồn `lastfm`.                                                                                                                                                                        |
| `DISCOVERY_LAVASRC_PREFIX`    | Không    | `dzrec`, `ymrec`, `vkrec` hoặc `qbrec`. Để trống thì bỏ qua nguồn `lavasrc`.                                                                                                                                                            |
| `DISCOVERY_MIN_DURATION_SEC`  | Không    | Bài gợi ý ngắn hơn giá trị này (giây) bị bỏ qua. Mặc định `60`.                                                                                                                                                                         |
| `DISCOVERY_MAX_DURATION_SEC`  | Không    | Bài gợi ý dài hơn giá trị này (giây) bị bỏ qua. Mặc định `1200`.                                                                                                                                                                        |
| `LAVALINK_JAVA_OPTS`          | Không    | Tùy chọn JVM của Lavalink (mặc định `-Xmx1G`), chỉ Docker Compose đọc.                                                                                                                                                                  |
| `LAVASRC_SPOTIFY_ENABLED`     | Không    | `true` để bật liên kết Spotify, chỉ Docker Compose đọc.                                                                                                                                                                                 |
| `SPOTIFY_CLIENT_ID`           | Không    | Client ID ứng dụng Spotify.                                                                                                                                                                                                             |
| `SPOTIFY_CLIENT_SECRET`       | Không    | Client secret ứng dụng Spotify.                                                                                                                                                                                                         |
| `SPOTIFY_COUNTRY_CODE`        | Không    | Mã quốc gia thị trường Spotify (mặc định `US`).                                                                                                                                                                                         |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | Không    | Dùng khi bật OAuth cho YouTube (xem bên dưới).                                                                                                                                                                                          |
| `YOUTUBE_PO_TOKEN`            | Không    | Dùng khi bật poToken cho YouTube.                                                                                                                                                                                                       |
| `YOUTUBE_VISITOR_DATA`        | Không    | Đi cùng `YOUTUBE_PO_TOKEN`.                                                                                                                                                                                                             |

\* Bắt buộc cho stack Docker (`docker-compose.yml`) và `docker-compose.dev.yml --profile storage`. Với `STORAGE_DRIVER=memory` chạy trên máy host chỉ cần các biến Lavalink.

\*\* Chỉ cần khi bot chạy trực tiếp trên máy host (`npm run dev` / `npm start`). `docker-compose.yml` bỏ qua các biến này và tự đặt host, URL theo tên dịch vụ trong mạng riêng của Docker.

Ngoài ra image Docker đặt sẵn `HEARTBEAT_FILE=/tmp/perry-heartbeat`: bot ghi dấu thời gian vào tệp này mỗi 15 giây khi đã kết nối Discord, và `HEALTHCHECK` của image đọc nó (`node dist/healthcheck.js`, tệp phải mới hơn 60 giây). Biến này không cần đặt trong `.env`; để trống thì bot không ghi tệp nào.

## Chạy hạ tầng phát triển (Lavalink, PostgreSQL, Redis)

Để chạy bot trên máy host bằng `npm run dev` (hoặc `npm start`), dùng `docker-compose.dev.yml`: chỉ gồm Lavalink, PostgreSQL và Redis (không có bot), cổng được publish trên `127.0.0.1`. Tệp riêng này tồn tại vì Docker Compose kiểm tra các biến bắt buộc (`${VAR:?}`) trên toàn tệp, nên không thể vừa chạy riêng Lavalink vừa giữ kiểm tra mật khẩu PostgreSQL/Redis trong `docker-compose.yml`.

```bash
# Chỉ Lavalink (STORAGE_DRIVER=memory): .env chỉ cần LAVALINK_PASSWORD
docker compose -f docker-compose.dev.yml up -d lavalink        # hoặc: npm run dev:lavalink

# Lavalink + PostgreSQL + Redis
make dev-infra                                                  # = docker compose -f docker-compose.dev.yml --profile storage up -d
docker compose -f docker-compose.dev.yml logs -f lavalink       # hoặc: npm run lavalink:logs

# Tạo bảng trong PostgreSQL rồi chạy bot trên máy host
npm run db:migrate
npm run dev                                                     # chưa kiểm chứng trong v1.2 (chỉ `npm start` được thử)

make dev-infra-down                                             # dừng, giữ dữ liệu
```

- Chế độ chỉ-Lavalink (memory) không còn đòi `POSTGRES_PASSWORD` / `REDIS_PASSWORD`; với `--profile storage`, thiếu hai mật khẩu này thì container Redis dừng với thông báo `REDIS_PASSWORD is not set in .env (REDIS_PASSWORD is empty), run ./scripts/setup.sh` trong `docker compose logs redis`, còn PostgreSQL từ chối khởi tạo volume mới khi thiếu mật khẩu.
- Lần đầu Lavalink tải 3 plugin (YouTube, LavaSrc, LavaLyrics) vào volume có tên `lavalink-plugins`, mất khoảng 30-90 giây. Một dịch vụ `lavalink-init` chạy một lần để chuyển quyền sở hữu volume cho uid 322 của Lavalink, nên bước `sudo chown -R 322:322 lavalink/plugins` của v1.1 không còn cần nữa (kể cả trên Linux).
- Khi sẵn sàng, `docker compose -f docker-compose.dev.yml ps` báo `healthy`.
- Cổng chỉ bind vào `127.0.0.1` (`LAVALINK_PORT`, `POSTGRES_PORT`, `REDIS_PORT` trong `.env`). Không mở các cổng này ra internet.
- Dừng: `make dev-infra-down` (giữ dữ liệu); thêm `-v` vào lệnh `docker compose ... down` sẽ xóa luôn volume PostgreSQL, Redis và cache plugin.
- Thay đổi `lavalink/application.yml` cần `docker compose -f docker-compose.dev.yml restart lavalink`.
- Tệp này dùng project `perry-lavalink` và tên volume/mạng của v1.1, nên dữ liệu dev cũ vẫn được gắn lại. Cache plugin trước đây là thư mục `lavalink/plugins/` nay là volume, nên plugin tải lại một lần. Stack production (`docker-compose.yml`, project `perry`) có volume riêng; muốn chuyển dữ liệu dev sang production, xem [docs/DEPLOY.vi.md](docs/DEPLOY.vi.md).
- Hai tệp compose phải dùng cùng tag image Lavalink/PostgreSQL/Redis; CI so sánh điều này.

### Cấu hình plugin YouTube

Lavalink dùng plugin [youtube-source](https://github.com/lavalink-devs/youtube-source) thay cho nguồn YouTube tích hợp sẵn. Danh sách client được cấu hình trong `lavalink/application.yml` (mục `plugins.youtube.clients`; `WEB` phải đứng trước `IOS`).

YouTube thường xuyên chặn máy chủ/IP trung tâm dữ liệu. Nếu gặp lỗi kiểu "Sign in to confirm you're not a bot", hãy dùng **tài khoản phụ** (tuyệt đối không dùng tài khoản chính) và thử một trong các cách sau, tất cả đều có sẵn dạng chú thích trong `lavalink/application.yml`:

- **OAuth**: bỏ chú thích khối `oauth`, thêm client `TV` vào `clients`, khởi động lại rồi làm theo mã hiển thị trong `docker compose logs lavalink`. Sau khi đăng nhập thành công, log in ra refresh token; lưu vào `YOUTUBE_OAUTH_REFRESH_TOKEN` trong `.env`.
- **poToken + visitorData**: bỏ chú thích khối `pot`, điền `YOUTUBE_PO_TOKEN` và `YOUTUBE_VISITOR_DATA` trong `.env`. Không dùng cùng lúc với OAuth.
- Sau khi sửa `.env` hoặc `lavalink/application.yml` cho các cách trên, chạy `docker compose up -d` để Compose nạp lại biến môi trường cho container (`docker compose restart` không nạp lại `.env`). Với hạ tầng dev, thêm `-f docker-compose.dev.yml` vào các lệnh `docker compose` trong mục này.
- **Cookies** và các lựa chọn khác: xem tài liệu của [youtube-source](https://github.com/lavalink-devs/youtube-source).

Phiên bản plugin: cấu hình đang ghim một bản snapshot (commit `2be8e542...`). Nếu bản này lỗi, quay về bản ổn định 1.18.2 bằng cách thay mục đầu tiên trong `lavalink.plugins` thành:

```yaml
- dependency: "dev.lavalink.youtube:youtube-plugin:1.18.2"
  snapshot: false
```

### Spotify (LavaSrc)

Liên kết Spotify được LavaSrc phân giải rồi tìm bản phát được trên YouTube. Để bật:

1. Tạo ứng dụng tại [Spotify for Developers](https://developer.spotify.com/dashboard) và lấy Client ID, Client Secret.
2. Trong `.env`: `LAVASRC_SPOTIFY_ENABLED=true`, `SPOTIFY_CLIENT_ID=...`, `SPOTIFY_CLIENT_SECRET=...`, `SPOTIFY_COUNTRY_CODE=...`.
3. `docker compose up -d` lại để áp dụng.

Khi chưa bật, liên kết Spotify sẽ bị từ chối với thông báo "Nguồn nhạc này chưa được bật trên bot".

## Lưu trữ (PostgreSQL + Redis)

`STORAGE_DRIVER` chọn cách lưu dữ liệu:

- `persistent` (mặc định): PostgreSQL + Redis. Trong Docker, bot tự migrate khi khởi động (`AUTO_MIGRATE=true`, có khóa advisory nên khởi động song song không giẫm chân nhau; chờ PostgreSQL sẵn sàng tối đa 10 lần cách nhau 3 giây, sau đó ghi một dòng lỗi và chạy ở chế độ suy giảm). Chạy trên máy host thì cần `DATABASE_URL`, `REDIS_URL` và `npm run db:migrate` (hoặc `AUTO_MIGRATE=true`). ORM: Drizzle; thư mục `drizzle/` chứa các migration SQL đã sinh, không sửa tay.
- `memory`: hành vi như v1, mọi thứ nằm trong tiến trình bot. Không lưu cài đặt, không có snapshot hay khôi phục phiên phát. Chỉ dùng khi chạy trên máy host; stack Docker luôn dùng `persistent`. Với `memory`, hash lệnh slash cũng nằm trong tiến trình nên lệnh được đăng ký lại ở mỗi lần khởi động.

Khởi động nhanh trên máy host (hạ tầng dev, xem mục trên):

```bash
# điền POSTGRES_PASSWORD, REDIS_PASSWORD, DATABASE_URL, REDIS_URL trong .env (./scripts/setup.sh làm giúp)
make dev-infra
npm run db:migrate
npm run build && npm start
```

Dữ liệu được lưu ở đâu:

| Dữ liệu                                               | Nơi lưu                        | Thời hạn                                               |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| Cài đặt máy chủ (DJ, âm lượng, autoplay, ngôn ngữ, ...) | PostgreSQL (`guild_settings`)  | Vĩnh viễn; bộ nhớ đệm Redis 1 giờ, cache nội bộ 5 giây |
| Lịch sử phát (chỉ khi `PLAY_HISTORY=true`)            | PostgreSQL (`play_history`)    | Vĩnh viễn                                              |
| Snapshot hàng đợi để khôi phục                        | Redis                          | 6 giờ                                                  |
| Bài đã phát gần đây (để autoplay không lặp)           | Redis (tối đa 400 mục/máy chủ) | 6 giờ                                                  |
| Cooldown lệnh, giới hạn tần suất                      | Redis                          | Vài giây tới 1 giờ                                     |
| Bộ nhớ đệm autocomplete và danh sách Last.fm          | Redis                          | 60 giây / 6 giờ                                        |
| Trạng thái `/radio`, bộ hẹn giờ, tin nhắn "Đang phát" | Chỉ trong bộ nhớ               | Mất khi bot dừng                                       |

Mọi khóa Redis có tiền tố `REDIS_KEY_PREFIX` và đều có TTL. Các bảng `playlists` và `playlist_tracks` đã được tạo sẵn cho tính năng sau này, hiện chưa dùng.

Lưu ý khi chạy:

- **Mật khẩu**: dùng `openssl rand -hex 24` cho `POSTGRES_PASSWORD` và `REDIS_PASSWORD`. Compose từ chối khởi động hai dịch vụ này khi thiếu mật khẩu.
- **Trùng cổng**: nếu `5432` hoặc `6379` đã bị dùng, đặt `POSTGRES_PORT` / `REDIS_PORT` khác trong `.env` và sửa `DATABASE_URL` / `REDIS_URL` cho khớp.
- **PostgreSQL 18**: image mới lưu dữ liệu dưới `/var/lib/postgresql/<phiên bản>/docker`, nên volume được mount tại `/var/lib/postgresql`. Nếu bạn dùng volume cũ của phiên bản trước, không mount lại trực tiếp vào thư mục này.
- **Giấy phép Redis**: image `redis` 8.x dùng giấy phép RSALv2/SSPLv1/AGPLv3 (tùy chọn). Nếu cần giấy phép mã nguồn mở thuần, có thể thay bằng [Valkey](https://valkey.io), tương thích giao thức; chỉ cần đổi image trong `docker-compose.yml` và giữ nguyên `REDIS_URL`.
- **Chế độ suy giảm**: khi PostgreSQL hoặc Redis không kết nối được, lệnh vẫn chạy. Bot ghi đúng một dòng log lỗi cho mỗi đợt sự cố, dùng cài đặt đã biết gần nhất (hoặc mặc định), giữ ghi chép đang chờ trong bộ nhớ rồi tự thử kết nối lại (1, 2, 5, 10, 30, 60 giây). Khi hồi phục có một dòng log `recovered`, các thay đổi đang chờ được ghi vào PostgreSQL. Nếu chưa chạy `npm run db:migrate`, log nhắc chạy lệnh này và bot ở chế độ suy giảm cho tới khi migrate xong. Trong lúc Redis ngừng, cooldown chỉ có hiệu lực trong từng tiến trình.
- **Nhiều tiến trình**: đặt `PUBSUB_INVALIDATION=true` để các tiến trình làm mới cài đặt ngay khi một tiến trình khác thay đổi.
- Bot rời một máy chủ thì cài đặt, snapshot và danh sách bài gần đây của máy chủ đó bị xóa.

### Khôi phục sau khi khởi động lại

Khi `PLAYER_RESTORE=true`, bot lưu ảnh chụp hàng đợi (bài đang phát, vị trí, hàng đợi tối đa 200 bài, âm lượng, chế độ lặp, kênh) vào Redis. Sau khi khởi động lại và kết nối được Lavalink, bot lần lượt (cách nhau 300 ms) vào lại kênh thoại và phát tiếp.

- Chỉ khôi phục khi vẫn còn ít nhất một người thật trong kênh thoại và bot còn đủ quyền; nếu không, snapshot bị bỏ.
- Snapshot được ghi sau khoảng 3 giây kể từ thay đổi cuối (tối đa 15 giây), kèm nhịp 20 giây khi đang phát. Nếu bot bị sập đột ngột, vị trí phát có thể lệch vài giây.
- Snapshot chỉ được giữ khi bot tắt êm (SIGINT/SIGTERM) hoặc sập. Dừng bằng `/stop`, `/leave`, hàng đợi hết hoặc bot bị đuổi sẽ xóa snapshot. Snapshot tự hết hạn sau 6 giờ.
- **Giới hạn**: nếu việc xóa snapshot thất bại vì Redis đang ngừng, bot ghi nhớ và xóa lại khi Redis hồi phục (trong cùng tiến trình; trong lúc chờ, snapshot đó bị ẩn khỏi việc khôi phục). Nếu bot khởi động lại **trong lúc Redis vẫn ngừng**, bản ghi nhớ này mất và một phiên đã kết thúc có thể vẫn được khôi phục trong vòng 6 giờ của TTL; điều kiện còn ít nhất một người thật trong kênh thoại là lớp bảo vệ còn lại.
- Trạng thái `/radio` không được khôi phục. Mất node Lavalink khi bot vẫn chạy cũng không khôi phục (bot chỉ tạo lại kết nối).
- Chế độ `memory` không có khôi phục.

## Tự khám phá nhạc

- **Autoplay** (`/autoplay state:on`): khi hàng đợi hết, bot tự thêm các bài gợi ý. `mode:related` (mặc định) gợi ý theo bài vừa phát; `mode:seed` ưu tiên bài do người dùng yêu cầu gần nhất. Cần có người trong kênh thoại. Tối đa 30 lần bổ sung mỗi giờ cho mỗi máy chủ; không tìm thấy gì thì bot báo một lần rồi im lặng cho tới khi có `/play`, `/radio` hoặc `/autoplay on`.
- **Radio** (`/radio query`): nhập liên kết hoặc từ khóa; bot phát và tự bổ sung bài liên quan mỗi khi hàng đợi gần hết. Dừng bằng `/stop`.
- **Similar** (`/similar`): hiển thị tối đa 25 bài tương tự với bài đang phát (embed 10 bài đầu); chọn bài trong menu hoặc bấm thêm tất cả. Chỉ người gọi lệnh dùng được, hết hạn sau 120 giây không thao tác.
- Mỗi máy chủ tối đa 60 lượt khám phá mỗi giờ. Bài gợi ý ngoài khoảng `DISCOVERY_MIN_DURATION_SEC`..`DISCOVERY_MAX_DURATION_SEC`, bài trùng với hàng đợi hoặc vừa phát, và livestream đều bị loại; cùng một nghệ sĩ không xuất hiện quá 2 bài liên tiếp.

### Chuỗi nguồn gợi ý

Thứ tự mặc định (đổi bằng `DISCOVERY_PROVIDERS`); nguồn nào đạt từ 3 bài hợp lệ trở lên thì dùng và dừng, nguồn cho kết quả ít hơn chỉ được dùng khi không nguồn sau nào đạt:

1. `ytmix`: YouTube Mix (`list=RD<videoId>`) của bài hiện tại, chỉ với bài từ YouTube.
2. `lastfm`: `track.getSimilar` của Last.fm rồi tìm từng bài trên YouTube. Cần `LASTFM_API_KEY` (đăng ký miễn phí tại [last.fm/api/account/create](https://www.last.fm/api/account/create)). Khóa sai (lỗi 10 hoặc 26) thì tắt nguồn này tới khi bot khởi động lại, ghi một dòng cảnh báo.
3. `lavasrc`: gợi ý của LavaSrc qua tiền tố `dzrec` (Deezer), `ymrec` (Yandex Music), `vkrec` (VK Music) hoặc `qbrec` (Qobuz). Cần đặt `DISCOVERY_LAVASRC_PREFIX` **và** bật nguồn tương ứng cùng thông tin xác thực trong `lavalink/application.yml`. Không bật Deezer khi chưa có master key: Lavalink sẽ không khởi động được.
4. `artist`: tìm theo tên nghệ sĩ trên YouTube, dùng làm phương án cuối.

Spotify không được dùng để gợi ý: Spotify đã ngừng cung cấp endpoint gợi ý cho ứng dụng mới. Spotify vẫn dùng được để phát liên kết (xem phần Spotify).

### Playlist và YouTube Mix

- Liên kết playlist hoặc Mix: thêm toàn bộ bài vào hàng đợi (tối đa 300 bài mỗi lần, hàng đợi tối đa 1000 bài). Nếu liên kết trỏ tới một video trong playlist (`watch?v=...&list=...`), danh sách được xoay để bắt đầu từ video đó và vẫn thêm đủ các bài còn lại.
- Bài trùng với hàng đợi hoặc trùng trong chính danh sách bị bỏ qua và được báo trong phản hồi.
- Liên kết rút gọn `youtu.be/<id>?list=...` giờ được hiểu như liên kết đầy đủ (trước đây chỉ thêm đúng một bài).
- Liên kết một bài và tìm kiếm bằng từ khóa không đổi: từ khóa chỉ phát kết quả khớp nhất.

## Đăng ký lệnh slash

```bash
# Phát triển: đăng ký tức thì vào máy chủ DEV_GUILD_ID (đặt trong .env)
npm run deploy-commands

# Đăng ký toàn cầu (mất tới ~1 giờ để hiển thị ở mọi máy chủ)
npm run deploy-commands -- --global

# Xóa lệnh đã đăng ký riêng trong máy chủ dev
npm run deploy-commands -- --clear-dev
```

- **Tự đăng ký khi khởi động** (`REGISTER_COMMANDS_ON_START`, bật sẵn trong image Docker): khi bot kết nối Discord thành công, nó tính hash của định nghĩa lệnh, so với hash lưu trong Redis (khóa `<REDIS_KEY_PREFIX>:v1:cmdhash:...`, TTL 30 ngày) và chỉ gọi Discord khi hash đổi. Đăng ký thất bại chỉ ghi một dòng cảnh báo, không làm bot dừng, và lần khởi động sau thử lại. `REGISTER_COMMANDS_FORCE=true` bỏ qua so sánh. Cùng quy tắc với script: có `DEV_GUILD_ID` thì đăng ký vào máy chủ dev, không thì đăng ký toàn cầu. Phần gọi Discord thật chưa được kiểm chứng (xem cuối tài liệu); logic hash đã được thử với bộ đăng ký giả.
- Script `npm run deploy-commands` vẫn dùng được như trước (các lệnh bên trên), dùng cùng mã tuần tự hóa lệnh.
- Nếu `DEV_GUILD_ID` được đặt và không có `--global`, lệnh chỉ đăng ký vào máy chủ dev.
- Lưu ý trùng lệnh: nếu cùng một lệnh vừa đăng ký toàn cầu vừa đăng ký trong máy chủ dev, máy chủ dev sẽ thấy hai bản. Hãy chạy `--clear-dev` sau khi đã đăng ký toàn cầu, hoặc để trống `DEV_GUILD_ID` ở môi trường chạy thật.
- Chạy lại lệnh mỗi khi thay đổi định nghĩa lệnh.

## Chạy bot

```bash
# Chạy thật
npm run build && npm start

# Phát triển (tự khởi động lại khi sửa mã)
npm run dev
```

Kiểm tra tĩnh: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run check-commands`.

## Danh sách lệnh

Bảng dưới đây lấy từ kết quả `npm run check-commands`. Tất cả lệnh chỉ dùng trong máy chủ. Cột "Tùy chọn" là số tùy chọn của lệnh. Từ v1.3, `check-commands` in mô tả tiếng Anh; cột "Mô tả" ở đây là bản tiếng Việt mà người dùng có ứng dụng Discord tiếng Việt nhìn thấy (xem [Ngôn ngữ](#ngôn-ngữ)).

| Lệnh          | Nhóm    | Tùy chọn                                         | Cooldown | Mô tả                                                     |
| ------------- | ------- | ------------------------------------------------ | -------- | --------------------------------------------------------- |
| `/ping`       | Chung   | 0                                                | 3s       | Kiểm tra độ trễ của bot                                   |
| `/help`       | Chung   | 0                                                | 3s       | Xem danh sách lệnh của bot                                |
| `/play`       | Âm nhạc | 3 (`query`, `source`, `next`)                    | 3s       | Phát nhạc từ liên kết hoặc từ khóa tìm kiếm               |
| `/pause`      | Âm nhạc | 0                                                | 1s       | Tạm dừng bài đang phát                                    |
| `/resume`     | Âm nhạc | 0                                                | 1s       | Tiếp tục phát nhạc                                        |
| `/skip`       | Âm nhạc | 1 (`to`)                                         | 1s       | Bỏ qua bài đang phát                                      |
| `/previous`   | Âm nhạc | 0                                                | 2s       | Phát lại bài trước đó                                     |
| `/stop`       | Âm nhạc | 0                                                | 2s       | Dừng phát nhạc và xóa hàng đợi                            |
| `/leave`      | Âm nhạc | 0                                                | 2s       | Rời kênh thoại và xóa hàng đợi                            |
| `/join`       | Âm nhạc | 0                                                | 3s       | Cho bot vào kênh thoại của bạn                            |
| `/queue`      | Âm nhạc | 1 (`page`)                                       | 2s       | Xem hàng đợi phát nhạc                                    |
| `/nowplaying` | Âm nhạc | 0                                                | 2s       | Xem bài đang phát                                         |
| `/volume`     | Âm nhạc | 1 (`level`)                                      | 1s       | Điều chỉnh âm lượng (0-150)                               |
| `/seek`       | Âm nhạc | 1 (`time`)                                       | 1s       | Tua tới một thời điểm trong bài đang phát                 |
| `/forward`    | Âm nhạc | 1 (`seconds`)                                    | 1s       | Tua tới trước                                             |
| `/rewind`     | Âm nhạc | 1 (`seconds`)                                    | 1s       | Tua lùi lại                                               |
| `/loop`       | Âm nhạc | 1 (`mode`)                                       | 1s       | Đặt chế độ lặp                                            |
| `/shuffle`    | Âm nhạc | 0                                                | 2s       | Xáo trộn thứ tự hàng đợi                                  |
| `/remove`     | Âm nhạc | 1 (`position`)                                   | 1s       | Xóa một bài khỏi hàng đợi                                 |
| `/clear`      | Âm nhạc | 0                                                | 2s       | Xóa các bài đang chờ (giữ bài đang phát)                  |
| `/move`       | Âm nhạc | 2 (`from`, `to`)                                 | 1s       | Di chuyển một bài sang vị trí khác trong hàng đợi         |
| `/filter`     | Âm nhạc | 1 (`name`)                                       | 3s       | Áp dụng bộ lọc âm thanh                                   |
| `/lyrics`     | Âm nhạc | 0                                                | 10s      | Xem lời bài hát đang phát                                 |
| `/autoplay`   | Âm nhạc | 2 (`state`, `mode`)                              | 3s       | Bật hoặc tắt tự động phát bài gợi ý khi hết hàng đợi      |
| `/radio`      | Âm nhạc | 1 (`query`)                                      | 10s      | Phát radio: tự thêm bài liên quan từ một bài hoặc từ khóa |
| `/similar`    | Âm nhạc | 0                                                | 10s      | Xem và thêm các bài tương tự với bài đang phát            |
| `/settings`   | Cài đặt | 4 lệnh con (`view`, `dj-role`, `default-volume`, `language`) | 3s       | Cài đặt bot cho máy chủ này                               |

Ghi chú:

- Hầu hết lệnh điều khiển yêu cầu bạn đang ở cùng kênh thoại với bot. `/play` và `/join` yêu cầu bạn đang ở một kênh thoại.
- `/play` nhận liên kết hoặc từ khóa; `source` chọn `youtube`, `youtubemusic` hoặc `soundcloud` cho từ khóa; `next` chèn bài lên đầu hàng đợi. Từ khóa chỉ phát kết quả tốt nhất; playlist và Mix được thêm toàn bộ (tối đa 300 bài mỗi lần, bài trùng bị bỏ qua), hàng đợi tối đa 1000 bài.
- `/autoplay` nhận `state` (`on`/`off`) và `mode` (`related`/`seed`); `/radio` nhận liên kết hoặc từ khóa. `/autoplay` cần quyền DJ khi đã đặt vai trò DJ, `/radio` và `/similar` thì không. `/autoplay` chỉ đổi cài đặt nên dùng được khi bạn không ở trong kênh thoại (không cần player hay quyền vào kênh); việc tự thêm bài vẫn cần có người trong kênh thoại.
- `/seek` nhận `mm:ss`, `h:mm:ss` hoặc số giây. `/volume` nhận 0-150.

## Vai trò DJ và `/settings`

- `/settings view`: xem cài đặt hiện tại.
- `/settings dj-role [role]`: đặt vai trò DJ; bỏ trống `role` để xóa.
- `/settings default-volume level`: âm lượng mặc định cho phiên phát mới (0-150).
- `/settings language locale` (v1.3): ngôn ngữ của bot trong máy chủ này: `English`, `Tiếng Việt` hoặc `Mặc định của bot` (xóa lựa chọn, quay về `DEFAULT_LOCALE`). Câu trả lời xác nhận dùng ngôn ngữ mới và tin nhắn "Đang phát" được vẽ lại.
- `/settings view` cũng hiển thị trạng thái và chế độ autoplay (đặt bằng `/autoplay`) và ngôn ngữ (tên ngôn ngữ đã chọn, hoặc `Mặc định (<ngôn ngữ của DEFAULT_LOCALE>)`).
- Chỉ người có quyền **Manage Server** mới dùng được `/settings`.
- Khi chưa đặt vai trò DJ, mọi người trong kênh thoại đều dùng được các lệnh điều khiển.
- Khi đã đặt vai trò DJ, các lệnh điều khiển (tạm dừng, dừng, âm lượng, lặp, ...) chỉ dành cho người có vai trò DJ hoặc quyền Manage Server. Ngoại lệ: người đang nghe một mình cùng bot; người đã thêm bài được phép `/skip`, `/previous`, `/remove`, `/seek`, `/forward`, `/rewind` trên bài của chính mình.
- Nếu vai trò DJ bị xóa khỏi máy chủ, bot coi như chưa đặt vai trò DJ và tự xóa thiết lập đó, nên người dùng không bị khóa khỏi các lệnh điều khiển.
- Cài đặt được lưu trong PostgreSQL khi `STORAGE_DRIVER=persistent`; với `memory` chúng mất khi bot khởi động lại.

## Ngôn ngữ

- Bot hỗ trợ `en` (tiếng Anh, mặc định) và `vi` (tiếng Việt).
- `DEFAULT_LOCALE` trong `.env` (`en` | `vi`, để trống = `en`) là ngôn ngữ mặc định của bot.
- `/settings language` (cần quyền Manage Server) chọn ngôn ngữ cho từng máy chủ: `English`, `Tiếng Việt` hoặc `Mặc định của bot`.
- Thứ tự chọn ngôn ngữ cho câu trả lời, tin nhắn "Đang phát" và thông báo trong kênh: cài đặt của máy chủ, rồi `DEFAULT_LOCALE`. Ngôn ngữ ứng dụng Discord của người dùng không ảnh hưởng tới các tin nhắn này. Trạng thái (presence) của bot và câu trả lời trong tin nhắn riêng dùng `DEFAULT_LOCALE`.
- Log luôn bằng tiếng Anh.
- Tên lệnh slash luôn là tiếng Anh. Mô tả lệnh, tùy chọn và tên lựa chọn hiển thị theo ngôn ngữ ứng dụng Discord của từng người (ứng dụng tiếng Việt thấy bản tiếng Việt), độc lập với cả `DEFAULT_LOCALE` lẫn `/settings language`.
- Sau khi nâng cấp lên v1.3, định nghĩa lệnh đổi nên lệnh được đăng ký lại một lần (tự động khi `REGISTER_COMMANDS_ON_START=true`, hoặc chạy `npm run deploy-commands`).
- Migration `0001_guild_language` thêm cột `guild_settings.language`. Stack Docker tự áp dụng khi khởi động (`AUTO_MIGRATE=true`); khi chạy bot trên máy host, chạy `npm run db:migrate` trước. Bot v1.3 chạy trên cơ sở dữ liệu chưa migrate sẽ ghi log `Database schema is missing or outdated` và chạy ở chế độ suy giảm.

## Bảo mật

- Stack production (`docker-compose.yml`) không publish cổng nào ra máy chủ: Lavalink, PostgreSQL và Redis chỉ nằm trong mạng riêng của Docker (Lavalink ở mạng `lavalink`, PostgreSQL/Redis ở mạng `data`, bot ở cả hai). Hạ tầng dev (`docker-compose.dev.yml`) chỉ bind `127.0.0.1`. Không mở các cổng này ra internet; nếu bot chạy ở máy khác, dùng mạng riêng hoặc TLS (`LAVALINK_SECURE=true` cùng reverse proxy cổng 443).
- Container bot chạy bằng user `node` (không phải root), hệ tệp gốc chỉ đọc (chỉ `/tmp` ghi được), `cap_drop: ALL` và `no-new-privileges`. Image không chứa `.env`, mã nguồn TypeScript, source map hay công cụ phát triển.
- Dùng mật khẩu Lavalink mạnh (`openssl rand -hex 24`, hoặc để `./scripts/setup.sh` sinh). Docker Compose từ chối khởi động nếu thiếu `LAVALINK_PASSWORD`.
- `.env` do `setup.sh` tạo có quyền `600`; script không bao giờ `source` tệp này và chỉ nhận giá trị khớp mẫu an toàn nên không bị chèn dòng. Tệp sao lưu `backups/*.dump` cũng có quyền `600` (thư mục `700`) và chứa dữ liệu thật: bảo vệ như `.env`.
- Mật khẩu nằm trong biến môi trường của container (bot: `DATABASE_URL`, `REDIS_URL`) và trong tham số tiến trình Redis, nên người dùng thuộc nhóm `docker` đọc được qua `docker inspect`. Chỉ cấp nhóm `docker` cho người tin cậy.
- Không commit `.env`, token hay mật khẩu. Token và mật khẩu được che khỏi log; lỗi hiển thị cho người dùng không chứa stack trace.
- Nguồn `http` của Lavalink được bật để phát tệp âm thanh trực tiếp. Bot chặn liên kết trỏ tới địa chỉ nội bộ (loopback, mạng riêng, link-local, `localhost`, tên miền `.local`, địa chỉ có thông tin đăng nhập, ...) trước khi gửi tới Lavalink nhằm giảm rủi ro SSRF.
- **Giới hạn của bộ lọc SSRF**: bộ lọc chỉ kiểm tra tên máy chủ (host) ghi trong liên kết. Nó không phân giải DNS (một tên miền trỏ tới địa chỉ nội bộ vẫn lọt qua) và không theo dõi chuyển hướng (redirect). Nếu chạy bot công khai, hãy thêm giới hạn ở tầng mạng cho container Lavalink (chặn egress tới dải IP nội bộ, link-local và metadata đám mây).
- PostgreSQL và Redis đều yêu cầu mật khẩu (và không được publish trong stack production). Chuỗi kết nối, mật khẩu và `LASTFM_API_KEY` được che khỏi log và lỗi. `PLAY_HISTORY=true` lưu ID người yêu cầu từng bài; chỉ bật khi cần và nêu rõ với người dùng.
- Bot không mở cổng HTTP nào; chỉ kết nối đi ra tới Discord và Lavalink. Kiểm tra sức khỏe của container dùng tệp heartbeat chứ không dùng cổng mạng.
- Intents tối thiểu: `Guilds` và `GuildVoiceStates`.

## Hạn chế đã biết

- **SoundCloud**: trong lần kiểm tra (Lavalink 4.2.2), cả tìm kiếm `scsearch` lẫn liên kết SoundCloud đều trả lỗi "Did not detect any supported formats" do lỗi phía Lavaplayer. Lệnh vẫn có tùy chọn nguồn này nhưng sẽ báo lỗi thân thiện khi nguồn gặp sự cố.
- **Lời bài hát (`/lyrics`)**: phụ thuộc plugin LavaLyrics và dịch vụ LRCLIB (có giới hạn tần suất, từng trả HTTP 429). Kết quả không ổn định; bot trả thông báo "không hỗ trợ / không tìm thấy / không lấy được" thay vì lỗi.
- **YouTube không ổn định**: YouTube liên tục thay đổi và chặn; có thể cần OAuth/poToken hoặc cập nhật plugin.
- **Cài đặt và hàng đợi**: cài đặt được lưu bền vững khi dùng `persistent`; hàng đợi chỉ được khôi phục theo các điều kiện ở phần "Khôi phục sau khi khởi động lại". Trạng thái `/radio` chỉ nằm trong bộ nhớ và mất khi bot khởi động lại. Mất node Lavalink (trong khi bot vẫn chạy) không khôi phục hàng đợi.
- **Gợi ý nhạc**: `lastfm` cần khóa API và `lavasrc` cần thông tin xác thực của dịch vụ tương ứng; khi thiếu, chuỗi nguồn chỉ còn `ytmix` và `artist`. Chất lượng YouTube Mix có thể thay đổi theo YouTube.
- **Nhiều tiến trình**: cooldown và giới hạn tần suất dùng Redis nên dùng chung được, nhưng chưa kiểm chứng việc chạy nhiều tiến trình.
- **Chế độ 24/7**: có trong mã nhưng chưa có lệnh bật; mặc định tắt.
- **Một node Lavalink**: chỉ dùng một node, chưa cân bằng tải nhiều node.
- Bandcamp và Twitch chỉ nhận liên kết (không có tìm kiếm). Kênh Stage chưa được hỗ trợ.
- `bcsearch:` không phải tính năng của Lavalink nên không có tìm kiếm Bandcamp.

## Những gì chưa được kiểm chứng runtime

Các mục dưới đây chưa được chạy với phiên Discord thật (không có token Discord thật trong quá trình kiểm tra):

- Phát âm thanh thật qua kênh thoại Discord.
- Nút bấm trên tin nhắn "Đang phát" và phân trang trên tin nhắn thật.
- Đăng ký lệnh slash lên Discord và cách hiển thị tùy chọn.
- Autocomplete qua Discord (chỉ kiểm tra logic tìm kiếm với Lavalink).
- Spotify (không có thông tin xác thực).
- Liên kết Bandcamp và Twitch.
- Lời bài hát từ đầu đến cuối.
- Chế độ 24/7 và hành vi DJ/hẹn giờ với thành viên thật.
- Bước `sudo chown -R 322:322 lavalink/plugins` trên Linux (chỉ thử trên Docker Desktop macOS). Từ v1.2 bước này được thay bằng dịch vụ `lavalink-init`, xem mục v1.2 bên dưới.
- Luồng OAuth và poToken của YouTube (không có tài khoản phụ để thử).
- Playlist thật trên 300 bài (giới hạn mới chỉ được thử với node giả lập).
- Khôi phục sau khi khởi động lại trong kênh thoại thật (vào lại kênh và phát tiếp đúng vị trí).
- `/autoplay`, `/radio`, `/similar` trên Discord thật (menu chọn, nút bấm, collector ephemeral) và autoplay sau khi hàng đợi thật sự kết thúc.
- Sự kiện `roleDelete` trong một máy chủ thật (chỉ thử bằng giả lập).
- Kết quả thật từ Last.fm (không có khóa API) và nguồn gợi ý LavaSrc (cần thông tin xác thực Deezer/Yandex/VK/Qobuz).
- Gợi ý của Spotify: không được dùng (xem phần Tự khám phá nhạc).
- Hành vi lâu dài của YouTube Mix (chỉ kiểm tra tại một thời điểm từ một địa chỉ IP; YouTube hay thay đổi).
- Dữ liệu Redis (AOF) có còn sau khi khởi động lại máy chủ hay không.
- Chạy nhiều tiến trình bot với `PUBSUB_INVALIDATION=true` (chỉ thử hai instance trong cùng một script).

Chưa được kiểm chứng ở v1.2 (đóng gói và triển khai):

- Đăng nhập Discord thật trong container: toàn bộ luồng sau `clientReady` (ghi heartbeat sau khi sẵn sàng, `HEALTHCHECK` chuyển sang `healthy`, tự đăng ký lệnh slash bằng lệnh `PUT` thật). Khi thử chỉ dùng token giả nên bot dừng ở dòng `Login failed`; hàng `bot login` PASS của `doctor.sh` chỉ phản ánh trạng thái Docker của bản giả lập.
- Tắt êm (`docker compose stop`) khi đang có gateway Discord và player thoại thật; mới thử đường tắt trước khi đăng nhập (thoát mã 0 sau khoảng 1 giây).
- Chạy image `linux/amd64` trực tiếp trên máy amd64: mới build và chạy qua giả lập (QEMU) trên máy arm64 (in ra `x64`). Build đa kiến trúc bằng một lệnh `docker buildx build --platform linux/amd64,linux/arm64` không chạy được với driver `docker` mặc định của máy thử (cần driver `docker-container` hoặc containerd image store), nên workflow `release.yml` chưa được thử như một lần build đa nền tảng.
- Workflow GitHub Actions (`ci.yml`, `release.yml`): chỉ qua actionlint và chạy lại cục bộ các lệnh shell của chúng (`docker compose config`, so sánh tag image, `docker build`, shellcheck); chưa chạy trên GitHub, chưa đẩy image lên GHCR, chưa kiểm tra quyền `packages: write` hay cài đặt hiển thị gói của GHCR.
- Kéo image dựng sẵn bằng `BOT_IMAGE` từ một registry thật (chỉ thử đường lỗi khi không kéo được).
- Máy chủ Linux thật: Docker Engine cài từ apt, `ufw`, quyền thư mục khi bind mount trên Linux (các thử nghiệm quyền dùng volume có tên trong Docker Desktop), các lệnh cài đặt Docker và tường lửa trong phần VPS.
- Bash của máy chủ Linux với `backup.sh`, `restore.sh`, `update.sh`, `doctor.sh` (chỉ `setup.sh` được chạy thêm trong container Debian 12; các script còn lại chạy bằng bash 3.2 của macOS).
- Windows (WSL2 hoặc Git Bash) và Docker Compose cũ hơn 2.32.
- `git clone` từ một kho từ xa thật (kho thử chưa có remote); nhánh `git pull --ff-only` chỉ thử với kho giả trong `/tmp`.
- Khôi phục một bản sao lưu vào cơ sở dữ liệu có lược đồ khác với mã hiện tại; xoay mật khẩu Lavalink/Redis/PostgreSQL trên stack đang chạy.
- Giới hạn tài nguyên mẫu (`deploy.resources.limits`, đang để dạng chú thích trong `docker-compose.yml`).
- Thời gian build image lần đầu trên máy trắng (lần thử có cache lớp) và dung lượng đĩa trên VPS thật.
- Giới hạn của việc xóa lại snapshot sau sự cố Redis (v1.2): chỉ hoạt động trong cùng một tiến trình; nếu bot khởi động lại khi Redis vẫn ngừng thì không thể biết snapshot nào đã bị xóa.

Chưa được kiểm chứng ở v1.3 (quốc tế hóa):

- Cách ứng dụng Discord thật hiển thị mô tả lệnh đã bản địa hóa (tiếng Anh/tiếng Việt).
- `/settings language` và việc vẽ lại tin nhắn "Đang phát" sau khi đổi ngôn ngữ trong một máy chủ thật.
- Khoảng thời gian chạy lẫn phiên bản với bộ nhớ đệm cài đặt trong Redis (tối đa 1 giờ) khi nâng cấp.
- Nâng cấp một stack đang chạy thật lên v1.3 (migration `0001` trên dữ liệu thật, đăng ký lại lệnh).

Đã kiểm chứng: PostgreSQL 18 và Redis 8 khởi động từ Docker Compose (`config -q` đạt khi có mật khẩu và báo lỗi khi thiếu), `npm run db:migrate` chạy lặp lại được, cài đặt đọc/ghi qua Redis và PostgreSQL, snapshot lưu/đọc/xóa và tắt êm giữ snapshot, cooldown và giới hạn tần suất qua Redis, chế độ suy giảm khi dừng và bật lại từng backend (một dòng log mỗi đợt, tự hồi phục, ghi bù cài đặt đang chờ), mọi khóa Redis đều có TTL, tải playlist/Mix YouTube thật (kể cả `youtu.be` và bắt đầu từ video đã chọn), chuỗi nguồn gợi ý `ytmix` và `artist` với Lavalink thật, bộ lọc tiền tố nguồn cho mọi khóa của `DefaultSources`, và bước xử lý vai trò DJ bị xóa (bằng đối tượng giả lập). Ngoài ra: Lavalink khởi động từ `docker-compose.yml` + `lavalink/application.yml` (3 plugin nạp thành công, `/v4/info` trả 401 khi không có mật khẩu và 200 khi có), tìm kiếm `ytsearch`, tải playlist YouTube, từ chối liên kết nội bộ, và khởi động bot với cấu hình thiếu/token sai không làm lộ bí mật.

Đã kiểm chứng ở v1.2 (Docker 27.5.1, Compose 2.32.4, macOS arm64, token Discord giả): image bot build được (khoảng 207 MB, chạy bằng user `node`, không có `.env`, mã nguồn, source map hay công cụ phát triển); build và chạy thử `linux/amd64` qua giả lập; cả bốn image gốc đều đa kiến trúc (amd64 và arm64) và cây phụ thuộc runtime không có module native; toàn bộ stack `docker compose up -d` (PostgreSQL, Redis, Lavalink khỏe, `lavalink-init` thoát mã 0, plugin thuộc uid 322, migration chạy lặp lại không lỗi, không container nào publish cổng, đúng một dòng `Login failed` mỗi lần khởi động, không lộ mật khẩu trong log, `docker history` hay `docker image inspect`); `docker-compose.dev.yml` (chỉ Lavalink khởi động được mà không cần mật khẩu PostgreSQL/Redis, `--profile storage`, chỉ bind `127.0.0.1`); `setup.sh` (tạo `.env` quyền 600, chạy lại không đổi, từ chối giá trị có ký tự nguy hiểm, nâng cấp `.env` cũ, chạy trong Debian 12 không có `openssl`); `deploy.sh`, `update.sh` (kể cả `--dry-run`, nhánh không có `.git`, nhánh `git pull --ff-only` với kho giả, in hướng dẫn quay lui khi lỗi), `backup.sh` (kèm dọn bản cũ), `restore.sh` (từ chối khi không có terminal, `--yes`, `--latest`), `doctor.sh` (trạng thái khỏe, hỏng và đã dừng), `logs.sh`, các target `make` (`up`, `ps`, `logs`, `doctor`, `backup`, `restore`, `restart`, `down`, `build`, `dev-infra`, `dev-infra-down`); shellcheck (v0.11.0) sạch cho mọi script; hadolint chỉ có một thông tin DL3066 (`USER node`) được chấp nhận; actionlint (1.7.12) sạch cho hai workflow; sửa lỗi v1.1: xóa snapshot được thử lại khi Redis hồi phục (thử với Redis thật bị dừng rồi bật lại), `purgeGuild` của chế độ `memory` xóa danh sách bài gần đây, `/autoplay` qua kiểm tra điều kiện khi người dùng không ở kênh thoại.

Đã kiểm chứng ở v1.3 (không có token Discord thật; container PostgreSQL 18.6 / Redis 8.8.3 dùng một lần và một bản sao của build): `npm run typecheck`, `lint`, `build` và `check-commands` đạt, và `check-commands` giờ báo lỗi khi lệnh, lệnh con hay tùy chọn thiếu mô tả tiếng Việt hoặc dài quá 100 ký tự (đã thử bằng cách bỏ một mô tả); trình biên dịch từ chối danh mục tiếng Việt thiếu khóa, thừa khóa hoặc sai kiểu tham số; migration `0001_guild_language` chạy lặp lại không lỗi (2 dòng trong `drizzle.__drizzle_migrations`), ràng buộc kiểm tra từ chối giá trị khác `en`/`vi`, và cơ sở dữ liệu chỉ có `0000_init` làm bot ghi log `Database schema is missing or outdated`; ngôn ngữ của máy chủ đi qua cache nội bộ, Redis và PostgreSQL (kể cả đặt lại về mặc định và mục cache Redis của v1.2 không có trường ngôn ngữ); `DEFAULT_LOCALE` không đặt, rỗng, `vi` và giá trị sai (thoát mã 1, không in giá trị), Docker Compose truyền biến này cho bot; tên lệnh không đổi ngoài lệnh con mới `/settings language`; mọi lệnh/lệnh con/tùy chọn có bản địa hóa tiếng Việt, lựa chọn của `/settings language` và quyền mặc định Manage Server, thứ tự chọn ngôn ngữ, embed "Đang phát" và hàng đợi hiển thị đúng cả hai ngôn ngữ với player giả; khởi động offline với `DEFAULT_LOCALE=vi`, token giả và tự migrate (migration áp dụng, kết nối Redis và PostgreSQL, đúng một dòng `Login failed`, tắt êm); script, Makefile, tệp compose, workflow và `.env.example` không còn chữ tiếng Việt, shellcheck (v0.10.0) sạch, `--help` của mọi script và `make help` in tiếng Anh, `setup.sh` thêm `DEFAULT_LOCALE` vào tệp cấu hình hiện có, `doctor.sh` in báo cáo tiếng Anh và kiểm tra biến của compose in thông báo tiếng Anh.

Khuyến nghị thử nhanh trên một máy chủ thật: `/play never gonna give you up`, `/pause`, `/resume`, `/skip`, `/queue` và các nút trên tin nhắn "Đang phát".

## Lưu ý pháp lý

Phát nhạc từ YouTube, Spotify và một số dịch vụ khác qua các công cụ như Lavalink/youtube-source có thể vi phạm Điều khoản dịch vụ của các nền tảng đó. Dự án này được cung cấp nguyên trạng. Nếu bạn chạy bot **public** cho nhiều máy chủ, bạn (chủ bot) hoàn toàn tự chịu trách nhiệm về việc tuân thủ điều khoản của nền tảng và pháp luật về bản quyền.

## Khắc phục sự cố

| Triệu chứng                                                                                                            | Cách xử lý                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Không rõ lỗi ở đâu (Docker)                                                                                            | Chạy `./scripts/doctor.sh`: bảng PASS/FAIL/WARN cho Docker, `.env` (chỉ tên biến), từng container, Lavalink và plugin, PostgreSQL, Redis, đăng nhập bot, cổng publish.                                                                                                                              |
| Bot thoát ngay với "Invalid configuration"                                                                             | Điền đủ các biến được liệt kê trong `.env` (log chỉ in tên biến, không in giá trị).                                                                                                                                                                                                                 |
| "Login failed: An invalid token was provided."                                                                         | `DISCORD_TOKEN` sai hoặc đã bị reset; lấy token mới ở tab Bot, sửa `.env` rồi `./scripts/deploy.sh`. Trong Docker, bot chờ 30 giây rồi thoát nên bị khởi động lại mỗi 30-60 giây; `doctor.sh` nhận ra dòng log này.                                                                                 |
| Lệnh slash không xuất hiện                                                                                             | Trong Docker, bot tự đăng ký khi kết nối Discord (xem log; `REGISTER_COMMANDS_FORCE=true` để buộc đăng ký lại). Chạy tay: `npm run deploy-commands`. Lệnh toàn cầu cần tới ~1 giờ. Kiểm tra bot được mời với scope `applications.commands`.                                                         |
| Container bot `unhealthy`                                                                                              | Healthcheck chỉ đạt khi bot đã kết nối Discord và ghi heartbeat trong 60 giây gần nhất; token sai thì luôn `unhealthy`. Xem `./scripts/logs.sh bot`.                                                                                                                                                |
| Thấy lệnh hiện hai lần                                                                                                 | Lệnh đã đăng ký cả toàn cầu và trong máy chủ dev; chạy `npm run deploy-commands -- --clear-dev`.                                                                                                                                                                                                    |
| "Máy chủ âm nhạc đang không khả dụng"                                                                                  | Kiểm tra `docker compose ps` và `docker compose logs lavalink`. Trong Docker, bot luôn nối tới `lavalink:2333` bằng `LAVALINK_PASSWORD` trong `.env`; khi chạy bot trên máy host, `LAVALINK_HOST`, `LAVALINK_PORT`, `LAVALINK_PASSWORD` phải khớp với `docker-compose.dev.yml`. Bot tự kết nối lại. |
| Compose báo thiếu `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `LAVALINK_PASSWORD`, `POSTGRES_PASSWORD` hoặc `REDIS_PASSWORD` | Đặt biến này trong `.env` (hoặc chạy `./scripts/setup.sh`) rồi chạy lại. Kiểm tra này áp dụng cho cả `docker compose ps/logs/down` vì Compose kiểm tra toàn tệp.                                                                                                                                    |
| Log báo PostgreSQL/Redis không khả dụng                                                                                | Bot vẫn chạy ở chế độ suy giảm và tự thử lại. Kiểm tra `docker compose ps`, mật khẩu (và cổng/URL nếu chạy trên máy host). Trong Docker bot tự migrate; chạy trên máy host mà chưa có bảng thì chạy `npm run db:migrate`.                                                                           |
| Đổi `POSTGRES_PASSWORD` mà PostgreSQL vẫn dùng mật khẩu cũ                                                             | Mật khẩu chỉ được áp dụng khi tạo volume lần đầu. Đổi bằng `ALTER USER` trong PostgreSQL, hoặc khôi phục bản sao lưu vào volume mới.                                                                                                                                                                |
| Lavalink chưa `healthy` ở lần chạy đầu                                                                                 | Bình thường: 30-90 giây để tải 3 plugin. Quyền thư mục plugin do dịch vụ `lavalink-init` xử lý nên không cần `chown` thủ công.                                                                                                                                                                      |
| "Sign in to confirm you're not a bot"                                                                                  | Cấu hình OAuth hoặc poToken cho YouTube như ở trên.                                                                                                                                                                                                                                                 |
| Bot vào kênh nhưng không có tiếng                                                                                      | Xem log Lavalink (lỗi libdave/voice); kiểm tra quyền Connect và Speak của bot.                                                                                                                                                                                                                      |
| Không phát được SoundCloud                                                                                             | Lỗi đã biết phía Lavalink, xem phần hạn chế.                                                                                                                                                                                                                                                        |
| `LAVALINK_SECURE=true` báo lỗi cổng                                                                                    | Thư viện yêu cầu cổng `443` khi bật TLS.                                                                                                                                                                                                                                                            |
| Cần thêm log chi tiết                                                                                                  | Đặt `LOG_LEVEL=debug` (có thể ghi cả stack trace; đừng chia sẻ công khai).                                                                                                                                                                                                                          |

## Cấu trúc dự án

```
src/
  index.ts            Điểm vào, đăng nhập và tắt bot an toàn
  config/             Đọc và kiểm tra biến môi trường, hằng số
  client/             BotClient và đăng ký sự kiện
  commands/           Lệnh theo nhóm: general/, music/, settings/ và index.ts (danh sách tường minh)
  events/             Sự kiện Discord (ready, guildDelete, guildRoleDelete, interaction, voice state)
  interactions/       Xử lý lệnh, nút bấm, autocomplete, cooldown
  music/              Lavalink, hàng đợi, kiểm tra điều kiện, điều khiển, tìm kiếm, lời bài hát
    discovery/        Engine gợi ý, autoplay, bộ lọc và các nguồn (providers/)
    persistence/      Snapshot hàng đợi, queue store, khôi phục sau khi khởi động lại
  storage/            Lớp lưu trữ: types, health (suy giảm), keys; memory/, redis/, postgres/ (Drizzle)
  settings/           Cài đặt theo máy chủ (bộ nhớ hoặc PostgreSQL + Redis)
  i18n/               en.ts (tiếng Anh, chuẩn), vi.ts (tiếng Việt), locales.ts, index.ts (chọn ngôn ngữ)
  types/ utils/       Kiểu dùng chung, logger, lỗi, phân trang, embed
  startup/            Migration khi khởi động (khóa advisory) và đăng ký lệnh slash theo hash
  health/             Heartbeat cho HEALTHCHECK của Docker (healthcheck.ts ở src/ chạy bằng node dist/healthcheck.js)
scripts/              Bash: setup, deploy, update, backup, restore, doctor, logs (+ lib/common.sh);
                      tsx: deploy-commands.ts, check-commands.ts, db-migrate.ts
Dockerfile            Image bot nhiều giai đoạn (Node 24 alpine, chạy bằng user node), .dockerignore đi kèm
docker-compose.yml    Stack production: bot, lavalink-init, lavalink, postgres, redis (không publish cổng)
docker-compose.dev.yml  Hạ tầng dev: Lavalink (+ PostgreSQL, Redis với --profile storage), bind 127.0.0.1
Makefile              Lệnh tắt gọi scripts/ hoặc docker compose (make help)
.github/workflows/    ci.yml (kiểm tra, build image, validate compose) và release.yml (đẩy image đa kiến trúc lên GHCR khi có tag v*)
docs/DEPLOY.md        Hướng dẫn triển khai chi tiết (tiếng Anh); docs/DEPLOY.vi.md bản tiếng Việt
README.vi.md          README tiếng Việt (README.md là bản tiếng Anh)
backups/              Sao lưu PostgreSQL do backup.sh tạo (bị .gitignore loại trừ)
drizzle/              Migration SQL đã sinh (0000_init.sql, 0001_guild_language.sql; giữ trong git, không sửa tay)
drizzle.config.ts     Cấu hình drizzle-kit
lavalink/             application.yml (thư mục plugins/ chỉ còn .gitkeep; plugin nằm trong volume Docker)
```

Các workflow GitHub Actions mới chỉ được viết và kiểm tra bằng actionlint; chưa chạy thật trên GitHub.

### Thêm module mới (ví dụ moderation)

1. Tạo thư mục `src/commands/moderation/` và viết mỗi lệnh là một đối tượng `Command` (`data`, `category`, `execute`, tùy chọn `cooldownSeconds`, `requirements`, `autocomplete`) giống các lệnh trong `src/commands/music/`.
2. Thêm nhóm mới (`moderation`) vào kiểu `category` trong `src/types/command.ts` và nhãn trong `categories` ở `src/i18n/en.ts` và `src/i18n/vi.ts`.
3. Thêm lệnh vào mảng tường minh trong `src/commands/index.ts`. Không được đọc biến môi trường khi import module lệnh.
4. Thêm chuỗi vào `src/i18n/en.ts` và bản dịch vào `src/i18n/vi.ts` (trình biên dịch báo lỗi nếu thiếu khóa); nếu cần intent mới, bật trong `src/client/bot-client.ts` và cập nhật Developer Portal.
5. Mở rộng `scripts/check-commands.ts` (thư mục quét và danh sách lệnh bắt buộc), rồi chạy `npm run check-commands`, `npm run deploy-commands`.
