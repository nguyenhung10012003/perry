/** All user-facing strings (Vietnamese). Later features append new groups here. */
export const vi = {
  commands: {
    ping: { description: "Kiểm tra độ trễ của bot" },
    help: { description: "Xem danh sách lệnh của bot" },
    play: {
      description: "Phát nhạc từ liên kết hoặc từ khóa tìm kiếm",
      query: "Liên kết hoặc từ khóa tìm kiếm",
      source: "Nguồn tìm kiếm khi nhập từ khóa (mặc định: YouTube)",
      next: "Đưa vào đầu hàng đợi để phát ngay sau bài hiện tại",
      sources: {
        youtube: "YouTube",
        youtubemusic: "YouTube Music",
        soundcloud: "SoundCloud",
      },
    },
    pause: { description: "Tạm dừng bài đang phát" },
    resume: { description: "Tiếp tục phát nhạc" },
    skip: {
      description: "Bỏ qua bài đang phát",
      to: "Vị trí trong hàng đợi để chuyển tới (bỏ qua các bài trước đó)",
    },
    previous: { description: "Phát lại bài trước đó" },
    stop: { description: "Dừng phát nhạc và xóa hàng đợi" },
    leave: { description: "Rời kênh thoại và xóa hàng đợi" },
    join: { description: "Cho bot vào kênh thoại của bạn" },
    queue: {
      description: "Xem hàng đợi phát nhạc",
      page: "Số trang muốn xem",
    },
    nowplaying: { description: "Xem bài đang phát" },
    volume: {
      description: "Điều chỉnh âm lượng (0-150)",
      level: "Mức âm lượng từ 0 đến 150",
    },
    seek: {
      description: "Tua tới một thời điểm trong bài đang phát",
      time: "Thời điểm, ví dụ 1:30, 1:02:03 hoặc 90 (giây)",
    },
    forward: {
      description: "Tua tới trước",
      seconds: "Số giây muốn tua (1-600, mặc định 10)",
    },
    rewind: {
      description: "Tua lùi lại",
      seconds: "Số giây muốn tua (1-600, mặc định 10)",
    },
    loop: {
      description: "Đặt chế độ lặp",
      mode: "Chế độ lặp",
    },
    shuffle: { description: "Xáo trộn thứ tự hàng đợi" },
    remove: {
      description: "Xóa một bài khỏi hàng đợi",
      position: "Vị trí của bài trong hàng đợi",
    },
    clear: { description: "Xóa các bài đang chờ (giữ bài đang phát)" },
    move: {
      description: "Di chuyển một bài sang vị trí khác trong hàng đợi",
      from: "Vị trí hiện tại của bài",
      to: "Vị trí mới",
    },
    filter: {
      description: "Áp dụng bộ lọc âm thanh",
      name: "Bộ lọc muốn dùng",
    },
    lyrics: { description: "Xem lời bài hát đang phát" },
    autoplay: {
      description: "Bật hoặc tắt tự động phát bài gợi ý khi hết hàng đợi",
      state: "Bật hoặc tắt tự động phát",
      mode: "Cách chọn bài gợi ý (bỏ trống để giữ cài đặt hiện tại)",
      states: { on: "Bật", off: "Tắt" },
      modes: {
        related: "Theo bài vừa phát",
        seed: "Theo bài được yêu cầu gần nhất",
      },
    },
    radio: {
      description: "Phát radio: tự thêm bài liên quan từ một bài hoặc từ khóa",
      query: "Liên kết hoặc từ khóa của bài làm gốc cho radio",
    },
    similar: {
      description: "Xem và thêm các bài tương tự với bài đang phát",
    },
    settings: {
      description: "Cài đặt bot cho máy chủ này",
      view: { description: "Xem cài đặt hiện tại" },
      djRole: {
        description: "Đặt hoặc xóa vai trò DJ",
        role: "Vai trò DJ (bỏ trống để xóa)",
      },
      defaultVolume: {
        description: "Đặt âm lượng mặc định cho phiên phát mới",
        level: "Mức âm lượng từ 0 đến 150",
      },
    },
  },
  categories: {
    music: "🎵 Âm nhạc",
    general: "🧰 Chung",
    settings: "⚙️ Cài đặt",
  },
  errors: {
    generic: "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
    onCooldown: (seconds: number) =>
      `Bạn thao tác quá nhanh. Hãy thử lại sau ${seconds} giây.`,
    guildOnly: "Lệnh này chỉ dùng được trong máy chủ.",
    unknownCommand: "Không tìm thấy lệnh này.",
    shuttingDown: "Bot đang tắt để bảo trì. Vui lòng thử lại sau ít phút.",
    notInVoice: "Bạn cần vào một kênh thoại trước.",
    differentChannel: (channelName: string) =>
      `Bạn cần ở cùng kênh thoại với bot (**${channelName}**).`,
    noPlayer: "Hiện chưa có phiên phát nhạc nào. Hãy dùng `/play` trước.",
    nothingPlaying: "Hiện không có bài nào đang phát.",
    missingPerms: (channelName: string, perms: string[]) =>
      `Bot thiếu quyền trong kênh **${channelName}**: ${perms.join(", ")}.`,
    channelFull: "Kênh thoại đã đầy nên bot không thể vào.",
    stageUnsupported: "Bot chưa hỗ trợ kênh sân khấu (Stage).",
    djRequired: "Bạn cần vai trò DJ để dùng lệnh này.",
    noNode:
      "Máy chủ âm nhạc đang không khả dụng. Vui lòng thử lại sau ít phút.",
    loadFailed:
      "Không tải được bài hát này. Nguồn có thể đang gặp sự cố, hãy thử lại hoặc chọn nguồn khác.",
    noResults: "Không tìm thấy kết quả nào.",
    sourceDisabled: "Nguồn nhạc này chưa được bật trên bot.",
    unsafeUrl: "Liên kết không hợp lệ hoặc không được phép.",
    queueFull: (max: number) => `Hàng đợi đã đạt giới hạn ${max} bài.`,
    discoveryRateLimited:
      "Bot đã tìm bài gợi ý quá nhiều lần trong giờ qua. Hãy thử lại sau ít phút.",
    allDuplicates: "Tất cả các bài trong danh sách này đã có trong hàng đợi nên không thêm bài nào.",
    invalidTime:
      "Thời gian không hợp lệ. Dùng `mm:ss`, `h:mm:ss` hoặc số giây.",
    outOfRange: (max: number) =>
      `Vị trí không hợp lệ. Hãy chọn từ 1 đến ${max}.`,
    volumeOutOfRange: (max: number) => `Âm lượng phải từ 0 đến ${max}.`,
    buttonExpired:
      "Nút này đã hết hạn. Hãy dùng nút trên tin nhắn mới nhất hoặc dùng lệnh.",
    notSeekable: "Bài hát này không hỗ trợ tua.",
    seekBeyond: (duration: string) =>
      `Vị trí tua vượt quá độ dài bài hát (${duration}).`,
    noPrevious: "Không có bài nào phát trước đó.",
    queueEmpty: "Hàng đợi đang trống.",
    queueTooShort: "Cần ít nhất 2 bài trong hàng đợi.",
    ownerOnly: "Chỉ người dùng lệnh mới điều khiển được trang này.",
  },
  permissions: {
    ViewChannel: "Xem kênh",
    Connect: "Kết nối",
    Speak: "Nói",
    SendMessages: "Gửi tin nhắn",
    EmbedLinks: "Nhúng liên kết",
  },
  ping: {
    title: "🏓 Pong!",
    api: (ms: number) => `Độ trễ API: **${ms} ms**`,
    ws: (ms: number) => `Độ trễ WebSocket: **${ms} ms**`,
    wsUnknown: "Độ trễ WebSocket: **chưa có dữ liệu**",
    lavalink: (ms: number) => `Độ trễ Lavalink: **${ms} ms**`,
    lavalinkOffline: "Lavalink: **không kết nối**",
  },
  music: {
    paused: "⏸ Đã tạm dừng.",
    resumed: "▶ Đã tiếp tục phát.",
    alreadyPaused: "Trình phát đang tạm dừng sẵn.",
    notPaused: "Trình phát không ở trạng thái tạm dừng.",
    skipped: (title: string) => `⏭ Đã bỏ qua **${title}**.`,
    skippedTo: (position: number, title: string) =>
      `⏭ Đã chuyển tới bài thứ ${position}: **${title}**.`,
    previous: (title: string) => `⏮ Đang phát lại **${title}**.`,
    stopped: "⏹ Đã dừng phát và xóa hàng đợi.",
    stoppedLeft: "⏹ Đã dừng phát, xóa hàng đợi và rời kênh thoại.",
    left: "👋 Đã rời kênh thoại.",
    joined: (channelName: string) => `🔊 Đã vào kênh **${channelName}**.`,
    volumeSet: (level: number) => `🔊 Âm lượng: **${level}%**`,
    seeked: (position: string) => `⏩ Đã tua tới **${position}**.`,
    loopSet: (mode: string) => `🔁 Chế độ lặp: **${mode}**`,
    loopModes: { off: "Tắt", track: "Bài hiện tại", queue: "Cả hàng đợi" },
    shuffled: (count: number) => `🔀 Đã xáo trộn ${count} bài trong hàng đợi.`,
    removed: (title: string) => `🗑 Đã xóa **${title}** khỏi hàng đợi.`,
    cleared: (count: number) => `🧹 Đã xóa ${count} bài khỏi hàng đợi.`,
    moved: (title: string, to: number) =>
      `↕ Đã chuyển **${title}** tới vị trí ${to}.`,
    filterSet: (name: string) => `🎚 Đã bật bộ lọc **${name}**.`,
    filterOff: "🎚 Đã tắt bộ lọc âm thanh.",
    playingNow: (title: string) => `▶ Phát ngay **${title}**.`,
    queueTrimmed: (added: number, dropped: number) =>
      `Hàng đợi chỉ còn chỗ cho ${added} bài nên đã bỏ qua ${dropped} bài.`,
    added: (title: string, position: number) =>
      `➕ Đã thêm **${title}** vào hàng đợi (vị trí ${position}).`,
    addedNext: (title: string) => `➕ Đã thêm **${title}** vào đầu hàng đợi.`,
    playlistAdded: (
      name: string,
      count: number,
      dropped: number,
      duplicates = 0,
    ) =>
      `📃 Đã thêm danh sách **${name}** (${count} bài)${dropped > 0 ? `, bỏ qua ${dropped} bài vượt giới hạn` : ""}${duplicates > 0 ? `, bỏ qua ${duplicates} bài đã có trong hàng đợi` : ""}.`,
    playlistStartsFrom: (title: string) =>
      `▶ Danh sách bắt đầu từ bài đã chọn: **${title}**.`,
    trackFailed: (titles: string[], more = 0) =>
      `⚠ Không phát được: ${titles.map((title) => `**${title}**`).join(", ")}${more > 0 ? ` và ${more} bài khác` : ""}. Bot đã tự động bỏ qua.`,
    tooManyErrors:
      "⚠ Có quá nhiều lỗi phát nhạc liên tiếp nên bot đã dừng và rời kênh thoại.",
    nodeLost:
      "⚠ Mất kết nối tới máy chủ âm nhạc nên phiên phát đã dừng. Bot sẽ tự kết nối lại.",
    aloneLeft: "👋 Không còn ai trong kênh thoại nên bot đã rời kênh.",
    idleLeft: "👋 Không có hoạt động trong 3 phút nên bot đã rời kênh.",
    restored: (count: number) =>
      `♻ Đã khôi phục phiên phát trước khi bot khởi động lại (${count} bài).`,
  },
  nowPlaying: {
    title: "Đang phát",
    author: "Nghệ sĩ",
    duration: "Thời lượng",
    live: "🔴 TRỰC TIẾP",
    requestedBy: "Yêu cầu bởi",
    loop: "Lặp",
    volume: "Âm lượng",
    filter: "Bộ lọc",
    unknownRequester: "Không rõ",
    autoplayRequester: "Gợi ý tự động",
  },
  autoplay: {
    state: (enabled: boolean, modeName: string) =>
      `🔁 Tự động phát: **${enabled ? "Bật" : "Tắt"}** (chế độ: **${modeName}**).`,
    nothingFound:
      "Không tìm thấy bài liên quan nên tự động phát đã tạm dừng. Dùng `/play`, `/radio` hoặc `/autoplay` để tiếp tục.",
  },
  radio: {
    started: (title: string, count: number) =>
      `📻 Đã bắt đầu radio từ **${title}** và thêm ${count} bài. Bot sẽ tự thêm bài liên quan mỗi khi hết hàng đợi.`,
    skipped: (duplicates: number, dropped: number) =>
      `Bỏ qua${duplicates > 0 ? ` ${duplicates} bài đã có trong hàng đợi` : ""}${duplicates > 0 && dropped > 0 ? " và" : ""}${dropped > 0 ? ` ${dropped} bài vượt giới hạn` : ""}.`,
    noRelated:
      "Chưa tìm được bài liên quan ngay lúc này. Bot sẽ thử lại khi hết hàng đợi.",
  },
  similar: {
    title: (track: string) => `Bài tương tự với ${track}`,
    footer: (total: number) =>
      `${total} gợi ý • Chọn bài trong danh sách hoặc thêm tất cả`,
    footerAdded: (added: number, remaining: number) =>
      `Đã thêm ${added} bài • Còn ${remaining} gợi ý`,
    footerDone: (added: number) => `Đã thêm ${added} bài, không còn gợi ý nào.`,
    more: (count: number) => `… và ${count} bài khác trong danh sách chọn`,
    placeholder: "Chọn bài muốn thêm vào hàng đợi",
    addAll: "Thêm tất cả",
    none: "Không tìm thấy bài tương tự nào cho bài đang phát.",
    added: (count: number) => `➕ Đã thêm ${count} bài vào hàng đợi.`,
  },
  queue: {
    title: "📜 Hàng đợi",
    current: "Đang phát",
    upNext: "Tiếp theo",
    empty: "Hàng đợi trống.",
    footer: (
      page: number,
      totalPages: number,
      count: number,
      duration: string,
      loop: string,
    ) =>
      `Trang ${page}/${totalPages} • ${count} bài • ${duration} • Lặp: ${loop}`,
  },
  lyrics: {
    unsupported: "Máy chủ âm nhạc hiện chưa hỗ trợ lời bài hát.",
    notFound: "Không tìm thấy lời cho bài hát này.",
    failed: "Không lấy được lời bài hát lúc này. Vui lòng thử lại sau.",
    title: (track: string) => `Lời bài hát: ${track}`,
    footer: (page: number, totalPages: number) => `Trang ${page}/${totalPages}`,
  },
  settings: {
    title: "⚙️ Cài đặt máy chủ",
    djRole: "Vai trò DJ",
    defaultVolume: "Âm lượng mặc định",
    twentyFourSeven: "Chế độ 24/7",
    autoplay: "Tự động phát",
    autoplayMode: "Chế độ tự động phát",
    notSet: "Chưa đặt",
    on: "Bật",
    off: "Tắt",
    djRoleSet: (roleId: string) => `✅ Đã đặt vai trò DJ là <@&${roleId}>.`,
    djRoleCleared:
      "✅ Đã xóa vai trò DJ. Mọi người đều có thể điều khiển nhạc.",
    djRoleInvalid:
      "Không thể dùng @everyone hoặc vai trò của bot làm vai trò DJ.",
    defaultVolumeSet: (level: number) =>
      `✅ Âm lượng mặc định: **${level}%** (áp dụng cho phiên phát mới).`,
    noPermission: "Bạn cần quyền Quản lý máy chủ để dùng lệnh này.",
  },
  filters: {
    names: {
      bassboost: "Bass Boost",
      nightcore: "Nightcore",
      "8d": "8D",
      vaporwave: "Vaporwave",
      karaoke: "Karaoke",
      off: "Tắt",
    },
  },
  buttons: {
    pause: "Tạm dừng",
    resume: "Tiếp tục",
    skip: "Bỏ qua",
    stop: "Dừng",
    loop: "Lặp",
    shuffle: "Xáo trộn",
    queue: "Hàng đợi",
    prev: "Trước",
    next: "Sau",
  },
  help: {
    title: "Danh sách lệnh",
    footer: "Dùng / để xem chi tiết từng lệnh.",
    empty: "Chưa có lệnh nào.",
  },
  presence: {
    activity: "Đang phát nhạc | /help",
  },
} as const;

export type Messages = typeof vi;
