import type { Messages } from "./en.js";

/** " (vụ #n)", or nothing when the case could not be recorded. */
const caseRef = (n: number | null): string =>
  n === null ? "" : ` (vụ #${n})`;

/**
 * Vietnamese catalog (second locale). Typed against `Messages` from the English source-of-truth catalog (en.ts),
 * so keys and function signatures must match exactly. Consumers get it through getMessages() / ctx.t only.
 */
export const vi: Messages = {
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
    ban: {
      description: "Cấm một người dùng khỏi máy chủ này",
      user: "Người dùng cần cấm (dùng được cả với người không ở trong máy chủ)",
      reason: "Lý do (hiện trong nhật ký kiểm tra và nhật ký kiểm duyệt)",
      deleteMessages: "Xóa các tin nhắn gần đây của người dùng",
      deleteChoices: {
        none: "Không xóa",
        "1h": "1 giờ qua",
        "6h": "6 giờ qua",
        "12h": "12 giờ qua",
        "24h": "24 giờ qua",
        "3d": "3 ngày qua",
        "7d": "7 ngày qua",
      },
    },
    unban: {
      description: "Gỡ lệnh cấm của một người dùng",
      user: "ID hoặc lượt nhắc (mention) của người dùng bị cấm",
      reason: "Lý do (hiện trong nhật ký kiểm tra và nhật ký kiểm duyệt)",
    },
    kick: {
      description: "Đuổi một thành viên khỏi máy chủ này",
      user: "Thành viên cần đuổi",
      reason: "Lý do (hiện trong nhật ký kiểm tra và nhật ký kiểm duyệt)",
    },
    timeout: {
      description: "Hạn chế một thành viên hoặc gỡ hạn chế",
      set: {
        description: "Hạn chế (timeout) một thành viên",
        user: "Thành viên cần hạn chế",
        duration: "Thời lượng, ví dụ 10m, 1h30m hoặc 7d (tối đa 28d)",
        reason: "Lý do (hiện trong nhật ký kiểm tra và nhật ký kiểm duyệt)",
      },
      remove: {
        description: "Gỡ hạn chế của một thành viên",
        user: "Thành viên cần gỡ hạn chế",
        reason: "Lý do (hiện trong nhật ký kiểm tra và nhật ký kiểm duyệt)",
      },
    },
    warn: {
      description: "Cảnh cáo một thành viên",
      user: "Thành viên cần cảnh cáo",
      reason: "Lý do cảnh cáo",
    },
    warnings: {
      description: "Xem hoặc xóa các cảnh cáo của một người dùng",
      list: {
        description: "Xem các cảnh cáo của một người dùng",
        user: "Người dùng cần xem cảnh cáo",
      },
      clear: {
        description: "Xóa mọi cảnh cáo của một người dùng (cần quyền Quản lý máy chủ)",
        user: "Người dùng cần xóa cảnh cáo",
      },
    },
    case: {
      description: "Xem hoặc sửa các vụ kiểm duyệt",
      view: {
        description: "Xem một vụ",
        number: "Số vụ",
      },
      reason: {
        description: "Đổi lý do của một vụ",
        number: "Số vụ",
        reason: "Lý do mới",
      },
      delete: {
        description: "Xóa một vụ (cần quyền Quản lý máy chủ)",
        number: "Số vụ",
      },
    },
    purge: {
      description: "Xóa các tin nhắn gần đây trong kênh này",
      amount: "Số tin nhắn cần xóa (1-100)",
      user: "Chỉ xóa tin nhắn của người dùng này",
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
      language: {
        description: "Đổi ngôn ngữ của bot trong máy chủ này",
        locale: "Ngôn ngữ muốn dùng",
        default: "Mặc định của bot",
      },
      modLog: {
        description: "Đặt hoặc xóa kênh nhật ký kiểm duyệt",
        channel: "Kênh nhật ký kiểm duyệt (bỏ trống để tắt)",
      },
      modDm: {
        description: "Bật hoặc tắt tin nhắn riêng gửi cho người bị xử lý",
        enabled: "Nhắn riêng cho người dùng khi bị cấm, đuổi, hạn chế hoặc cảnh cáo",
      },
    },
  },
  categories: {
    music: "🎵 Âm nhạc",
    moderation: "🛡️ Kiểm duyệt",
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
    BanMembers: "Cấm thành viên",
    KickMembers: "Đuổi thành viên",
    ModerateMembers: "Hạn chế thành viên",
    ManageMessages: "Quản lý tin nhắn",
    ReadMessageHistory: "Đọc lịch sử tin nhắn",
    ManageGuild: "Quản lý máy chủ",
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
    language: "Ngôn ngữ",
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
    languageDefault: (name: string) => `Mặc định (${name})`,
    languageSet: (name: string) => `✅ Đã đổi ngôn ngữ sang **${name}**.`,
    languageReset: (name: string) =>
      `✅ Đã dùng lại ngôn ngữ mặc định của bot (**${name}**).`,
    noPermission: "Bạn cần quyền Quản lý máy chủ để dùng lệnh này.",
    modLog: "Nhật ký kiểm duyệt",
    modLogSet: (channelId: string) =>
      `✅ Đã đặt kênh nhật ký kiểm duyệt là <#${channelId}>.`,
    modLogCleared: "✅ Đã tắt nhật ký kiểm duyệt.",
    modLogNoAccess:
      "Bot không thể gửi tin nhắn trong kênh đó. Bot cần quyền Xem kênh, Gửi tin nhắn và Nhúng liên kết ở đó.",
    modDm: "Nhắn riêng khi xử lý",
    modDmSet: (enabled: boolean) =>
      `✅ Nhắn riêng khi xử lý: **${enabled ? "Bật" : "Tắt"}**.`,
  },
  moderation: {
    self: "Bạn không thể dùng lệnh này với chính mình.",
    bot: "Bot không thể tự xử lý chính nó.",
    owner: "Không thể xử lý chủ máy chủ.",
    notMember: "Người dùng này không phải thành viên của máy chủ.",
    invokerNotHigher:
      "Bạn chỉ có thể xử lý thành viên có vai trò cao nhất thấp hơn bạn.",
    botNotHigher:
      "Vai trò cao nhất của bot phải cao hơn vai trò cao nhất của thành viên đó. Hãy kéo vai trò của bot lên trong Cài đặt máy chủ > Vai trò.",
    targetAdmin: "Không thể hạn chế thành viên có quyền Quản trị viên.",
    invokerMissing: (permission: string) =>
      `Bạn cần quyền **${permission}** để dùng lệnh này.`,
    botMissing: (permissions: string[]) =>
      `Bot thiếu quyền: ${permissions.join(", ")}.`,
    invalidUser:
      "Hãy nhập ID hoặc lượt nhắc của người dùng, ví dụ `123456789012345678` hoặc `<@123456789012345678>`.",
    unknownUser: "Không có người dùng Discord nào có ID này.",
    notTimedOut: "Thành viên này không bị hạn chế.",
    invalidDuration:
      "Thời lượng không hợp lệ. Dùng số kèm s, m, h, d hoặc w, ví dụ `10m`, `1h30m` hoặc `7d`.",
    durationTooLong: "Thời gian hạn chế tối đa là 28 ngày.",
    alreadyBanned: "Người dùng này đã bị cấm rồi.",
    notBanned: "Người dùng này không bị cấm.",
    caseNotFound: "Không tìm thấy vụ này.",
    purgeNoAccess: "Bot không thể đọc hoặc xóa tin nhắn trong kênh này.",
    storageUnavailable:
      "Hồ sơ kiểm duyệt tạm thời không khả dụng. Vui lòng thử lại sau.",
    banned: (user: string, n: number | null) =>
      `🔨 Đã cấm **${user}**${caseRef(n)}.`,
    unbanned: (user: string, n: number | null) =>
      `🔓 Đã gỡ lệnh cấm **${user}**${caseRef(n)}.`,
    kicked: (user: string, n: number | null) =>
      `👢 Đã đuổi **${user}**${caseRef(n)}.`,
    timedOut: (user: string, duration: string, n: number | null) =>
      `⏳ Đã hạn chế **${user}** trong ${duration}${caseRef(n)}.`,
    timeoutRemoved: (user: string, n: number | null) =>
      `✅ Đã gỡ hạn chế cho **${user}**${caseRef(n)}.`,
    warned: (user: string, n: number | null) =>
      `⚠️ Đã cảnh cáo **${user}**${caseRef(n)}.`,
    purged: (n: number) => `🧹 Đã xóa ${n} tin nhắn.`,
    purgeSkipped: (m: number) =>
      `${m} tin nhắn không bị xóa: bot chỉ xét 100 tin nhắn gần nhất và bỏ qua tin nhắn đã ghim, tin nhắn cũ hơn 14 ngày và (khi lọc theo người dùng) tin nhắn của người khác.`,
    caseReasonUpdated: (n: number) => `✏️ Đã cập nhật lý do của vụ #${n}.`,
    caseDeleted: (n: number) =>
      `🗑 Đã xóa vụ #${n}. Tin nhắn trong nhật ký kiểm duyệt vẫn được giữ.`,
    warningsCleared: (user: string, count: number) =>
      `🧹 Đã xóa ${count} cảnh cáo của **${user}**.`,
    dmFailed: "Không gửi được tin nhắn riêng cho người dùng.",
    caseNotRecorded: "Đã thực hiện, nhưng hiện chưa lưu được hồ sơ vụ việc.",
    dmAlreadySent: "Người dùng đã được thông báo qua tin nhắn riêng.",
    dmBan: (guild: string) => `Bạn đang bị cấm khỏi **${guild}**.`,
    dmKick: (guild: string) => `Bạn đang bị đuổi khỏi **${guild}**.`,
    dmTimeout: (guild: string, duration: string) =>
      `Bạn đã bị hạn chế ${duration} trong máy chủ **${guild}**.`,
    dmWarn: (guild: string) =>
      `Bạn đã nhận một cảnh cáo trong máy chủ **${guild}**.`,
    dmReason: (reason: string) => `Lý do: ${reason}`,
    log: {
      caseTitle: (action: string, n: number | null) =>
        n === null ? `${action} | Chưa lưu hồ sơ` : `${action} | Vụ #${n}`,
      notRecorded: "Không lưu được hồ sơ nên vụ này không có số.",
      target: "Người dùng",
      moderator: "Người kiểm duyệt",
      reason: "Lý do",
      noReason: "Không có lý do",
      duration: "Thời lượng",
      dm: "Tin nhắn riêng",
      dmSent: "Đã gửi",
      dmNotSent: "Không gửi",
      dmOff: "Tắt",
      purgeTitle: "Đã dọn tin nhắn",
      channel: "Kênh",
      count: "Đã xóa",
      userFilter: "Chỉ của",
    },
    actions: {
      ban: "Cấm",
      unban: "Gỡ cấm",
      kick: "Đuổi",
      timeout: "Hạn chế",
      untimeout: "Gỡ hạn chế",
      warn: "Cảnh cáo",
    },
    warnings: {
      title: (user: string) => `Cảnh cáo của ${user}`,
      empty: "Người dùng này không có cảnh cáo nào.",
      footer: (page: number, totalPages: number, total: number) =>
        `Trang ${page}/${totalPages} • ${total} cảnh cáo`,
    },
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
};
