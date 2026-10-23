/**
 * All user-facing strings (English). This catalog is the source of truth: its shape defines `Messages`,
 * and every other locale must provide exactly the same keys and function signatures.
 * Deliberately NOT `as const`, so string leaves widen to `string` and other locales can hold different text.
 */

/** English count + noun: plural(1, "track", "tracks") -> "1 track". Local to this catalog; signatures stay unchanged. */
const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** " (case #n)", or nothing when the case could not be recorded. */
const caseRef = (n: number | null): string =>
  n === null ? "" : ` (case #${n})`;

export const en = {
  commands: {
    ping: { description: "Check the bot's latency" },
    help: { description: "Show the list of bot commands" },
    play: {
      description: "Play music from a link or a search query",
      query: "Link or search query",
      source: "Search source used for a query (default: YouTube)",
      next: "Put it at the front of the queue to play right after the current track",
      sources: {
        youtube: "YouTube",
        youtubemusic: "YouTube Music",
        soundcloud: "SoundCloud",
      },
    },
    pause: { description: "Pause the current track" },
    resume: { description: "Resume playback" },
    skip: {
      description: "Skip the current track",
      to: "Queue position to jump to (skips the tracks before it)",
    },
    previous: { description: "Play the previous track again" },
    stop: { description: "Stop playback and clear the queue" },
    leave: { description: "Leave the voice channel and clear the queue" },
    join: { description: "Make the bot join your voice channel" },
    queue: {
      description: "Show the music queue",
      page: "Page number to show",
    },
    nowplaying: { description: "Show the current track" },
    volume: {
      description: "Adjust the volume (0-150)",
      level: "Volume level from 0 to 150",
    },
    seek: {
      description: "Seek to a position in the current track",
      time: "Position, e.g. 1:30, 1:02:03 or 90 (seconds)",
    },
    forward: {
      description: "Fast-forward",
      seconds: "Number of seconds to skip ahead (1-600, default 10)",
    },
    rewind: {
      description: "Rewind",
      seconds: "Number of seconds to go back (1-600, default 10)",
    },
    loop: {
      description: "Set the loop mode",
      mode: "Loop mode",
    },
    shuffle: { description: "Shuffle the queue" },
    remove: {
      description: "Remove a track from the queue",
      position: "Position of the track in the queue",
    },
    clear: {
      description: "Remove the upcoming tracks (keeps the current track)",
    },
    move: {
      description: "Move a track to another position in the queue",
      from: "Current position of the track",
      to: "New position",
    },
    filter: {
      description: "Apply an audio filter",
      name: "Filter to use",
    },
    lyrics: { description: "Show the lyrics of the current track" },
    autoplay: {
      description:
        "Turn autoplay of suggested tracks on or off when the queue ends",
      state: "Turn autoplay on or off",
      mode: "How suggested tracks are picked (leave empty to keep the current setting)",
      states: { on: "On", off: "Off" },
      modes: {
        related: "Based on the last played track",
        seed: "Based on the last requested track",
      },
    },
    radio: {
      description:
        "Start a radio: keeps adding related tracks from a track or query",
      query: "Link or search query of the track that seeds the radio",
    },
    similar: {
      description: "Browse and add tracks similar to the current track",
    },
    ban: {
      description: "Ban a user from this server",
      user: "User to ban (also works for users who are not in the server)",
      reason: "Reason (shown in the audit log and the mod log)",
      deleteMessages: "Delete the user's recent messages",
      deleteChoices: {
        none: "Don't delete any",
        "1h": "Previous hour",
        "6h": "Previous 6 hours",
        "12h": "Previous 12 hours",
        "24h": "Previous 24 hours",
        "3d": "Previous 3 days",
        "7d": "Previous 7 days",
      },
    },
    unban: {
      description: "Lift the ban of a user",
      user: "User ID or mention of the banned user",
      reason: "Reason (shown in the audit log and the mod log)",
    },
    kick: {
      description: "Kick a member from this server",
      user: "Member to kick",
      reason: "Reason (shown in the audit log and the mod log)",
    },
    timeout: {
      description: "Time out a member or remove a timeout",
      set: {
        description: "Time out a member",
        user: "Member to time out",
        duration: "Duration, e.g. 10m, 1h30m or 7d (at most 28d)",
        reason: "Reason (shown in the audit log and the mod log)",
      },
      remove: {
        description: "Remove the timeout of a member",
        user: "Member whose timeout to remove",
        reason: "Reason (shown in the audit log and the mod log)",
      },
    },
    warn: {
      description: "Warn a member",
      user: "Member to warn",
      reason: "Reason for the warning",
    },
    warnings: {
      description: "Show or delete the warnings of a user",
      list: {
        description: "Show the warnings of a user",
        user: "User whose warnings to show",
      },
      clear: {
        description: "Delete every warning of a user (needs Manage Server)",
        user: "User whose warnings to delete",
      },
    },
    case: {
      description: "Show or edit moderation cases",
      view: {
        description: "Show a case",
        number: "Case number",
      },
      reason: {
        description: "Change the reason of a case",
        number: "Case number",
        reason: "New reason",
      },
      delete: {
        description: "Delete a case (needs Manage Server)",
        number: "Case number",
      },
    },
    purge: {
      description: "Delete recent messages in this channel",
      amount: "Number of messages to delete (1-100)",
      user: "Only delete messages from this user",
    },
    rank: {
      description: "Show the level, XP and rank of a member",
      user: "Member to show (default: you)",
    },
    leaderboard: {
      description: "Show the XP leaderboard of this server",
      page: "Page number to show",
    },
    xp: {
      description: "Change the XP of a member (needs Manage Server)",
      add: {
        description: "Give XP to a member",
        user: "Member who gets the XP",
        amount: "XP to add (1-1,000,000)",
      },
      remove: {
        description: "Take XP away from a member",
        user: "Member who loses the XP",
        amount: "XP to remove (1-1,000,000)",
      },
      set: {
        description: "Set the total XP of a member",
        user: "Member whose XP to set",
        xp: "New total XP (0-2,000,000,000)",
      },
      reset: {
        description: "Delete the XP and level of a member",
        user: "Member whose XP to delete",
      },
    },
    settings: {
      description: "Bot settings for this server",
      view: { description: "Show the current settings" },
      djRole: {
        description: "Set or clear the DJ role",
        role: "DJ role (leave empty to clear it)",
      },
      defaultVolume: {
        description: "Set the default volume for new sessions",
        level: "Volume level from 0 to 150",
      },
      language: {
        description: "Change the bot language for this server",
        locale: "Language to use",
        default: "Bot default",
      },
      modLog: {
        description: "Set or clear the moderation log channel",
        channel: "Channel for the mod log (leave empty to turn it off)",
      },
      modDm: {
        description: "Turn the DM to moderated users on or off",
        enabled: "DM the user on a ban, kick, timeout or warning",
      },
      leveling: {
        description:
          "Show or change leveling: XP on or off and where level-ups are announced",
        enabled: "Members earn XP for their messages",
        announce: "Where level-up messages go",
        channel: "Channel for level-up messages; picking one sends them there",
        modes: {
          off: "Off",
          current: "Channel of the message",
          channel: "Configured channel",
          dm: "Direct message",
        },
      },
    },
  },
  categories: {
    music: "🎵 Music",
    moderation: "🛡️ Moderation",
    leveling: "🏆 Leveling",
    general: "🧰 General",
    settings: "⚙️ Settings",
  },
  errors: {
    generic: "Something went wrong. Please try again later.",
    onCooldown: (seconds: number) =>
      `You're going too fast. Try again in ${plural(seconds, "second", "seconds")}.`,
    guildOnly: "This command can only be used in a server.",
    unknownCommand: "This command was not found.",
    shuttingDown:
      "The bot is shutting down for maintenance. Please try again in a few minutes.",
    notInVoice: "You need to join a voice channel first.",
    differentChannel: (channelName: string) =>
      `You need to be in the same voice channel as the bot (**${channelName}**).`,
    noPlayer: "There is no music session yet. Use `/play` first.",
    nothingPlaying: "Nothing is playing right now.",
    missingPerms: (channelName: string, perms: string[]) =>
      `The bot is missing permissions in **${channelName}**: ${perms.join(", ")}.`,
    channelFull: "The voice channel is full, so the bot cannot join.",
    stageUnsupported: "The bot does not support Stage channels yet.",
    djRequired: "You need the DJ role to use this command.",
    noNode:
      "The music server is unavailable. Please try again in a few minutes.",
    loadFailed:
      "Could not load this track. The source may be having issues, try again or pick another source.",
    noResults: "No results found.",
    sourceDisabled: "This music source is not enabled on the bot.",
    unsafeUrl: "The link is invalid or not allowed.",
    queueFull: (max: number) =>
      `The queue has reached its limit of ${max} tracks.`,
    discoveryRateLimited:
      "The bot has looked up suggestions too many times in the past hour. Try again in a few minutes.",
    allDuplicates:
      "Every track in this list is already in the queue, so nothing was added.",
    invalidTime: "Invalid time. Use `mm:ss`, `h:mm:ss` or a number of seconds.",
    outOfRange: (max: number) =>
      `Invalid position. Pick a number from 1 to ${max}.`,
    volumeOutOfRange: (max: number) => `Volume must be between 0 and ${max}.`,
    buttonExpired:
      "This button has expired. Use the buttons on the latest message or use a command.",
    notSeekable: "This track does not support seeking.",
    seekBeyond: (duration: string) =>
      `The seek position is past the end of the track (${duration}).`,
    noPrevious: "There is no previous track.",
    queueEmpty: "The queue is empty.",
    queueTooShort: "The queue needs at least 2 tracks.",
    ownerOnly: "Only the user who ran the command can control this page.",
  },
  permissions: {
    ViewChannel: "View Channel",
    Connect: "Connect",
    Speak: "Speak",
    SendMessages: "Send Messages",
    EmbedLinks: "Embed Links",
    BanMembers: "Ban Members",
    KickMembers: "Kick Members",
    ModerateMembers: "Timeout Members",
    ManageMessages: "Manage Messages",
    ReadMessageHistory: "Read Message History",
    ManageGuild: "Manage Server",
    ManageRoles: "Manage Roles",
  },
  ping: {
    title: "🏓 Pong!",
    api: (ms: number) => `API latency: **${ms} ms**`,
    ws: (ms: number) => `WebSocket latency: **${ms} ms**`,
    wsUnknown: "WebSocket latency: **no data yet**",
    lavalink: (ms: number) => `Lavalink latency: **${ms} ms**`,
    lavalinkOffline: "Lavalink: **not connected**",
  },
  music: {
    paused: "⏸ Paused.",
    resumed: "▶ Resumed.",
    alreadyPaused: "The player is already paused.",
    notPaused: "The player is not paused.",
    skipped: (title: string) => `⏭ Skipped **${title}**.`,
    skippedTo: (position: number, title: string) =>
      `⏭ Jumped to track ${position}: **${title}**.`,
    previous: (title: string) => `⏮ Playing **${title}** again.`,
    stopped: "⏹ Stopped playback and cleared the queue.",
    stoppedLeft:
      "⏹ Stopped playback, cleared the queue and left the voice channel.",
    left: "👋 Left the voice channel.",
    joined: (channelName: string) => `🔊 Joined **${channelName}**.`,
    volumeSet: (level: number) => `🔊 Volume: **${level}%**`,
    seeked: (position: string) => `⏩ Seeked to **${position}**.`,
    loopSet: (mode: string) => `🔁 Loop mode: **${mode}**`,
    loopModes: { off: "Off", track: "Current track", queue: "Whole queue" },
    shuffled: (count: number) =>
      `🔀 Shuffled ${plural(count, "track", "tracks")} in the queue.`,
    removed: (title: string) => `🗑 Removed **${title}** from the queue.`,
    cleared: (count: number) =>
      `🧹 Removed ${plural(count, "track", "tracks")} from the queue.`,
    moved: (title: string, to: number) =>
      `↕ Moved **${title}** to position ${to}.`,
    filterSet: (name: string) => `🎚 Enabled the **${name}** filter.`,
    filterOff: "🎚 Audio filter turned off.",
    playingNow: (title: string) => `▶ Playing **${title}** now.`,
    queueTrimmed: (added: number, dropped: number) =>
      `The queue only had room for ${plural(added, "track", "tracks")}, so ${plural(dropped, "track was", "tracks were")} skipped.`,
    added: (title: string, position: number) =>
      `➕ Added **${title}** to the queue (position ${position}).`,
    addedNext: (title: string) =>
      `➕ Added **${title}** to the front of the queue.`,
    playlistAdded: (
      name: string,
      count: number,
      dropped: number,
      duplicates = 0,
    ) =>
      `📃 Added playlist **${name}** (${plural(count, "track", "tracks")})${dropped > 0 ? `, skipped ${plural(dropped, "track", "tracks")} over the limit` : ""}${duplicates > 0 ? `, skipped ${plural(duplicates, "track", "tracks")} already in the queue` : ""}.`,
    playlistStartsFrom: (title: string) =>
      `▶ The playlist starts from the selected track: **${title}**.`,
    trackFailed: (titles: string[], more = 0) =>
      `⚠ Could not play: ${titles.map((title) => `**${title}**`).join(", ")}${more > 0 ? ` and ${more} more` : ""}. The bot skipped them automatically.`,
    tooManyErrors:
      "⚠ Too many playback errors in a row, so the bot stopped and left the voice channel.",
    nodeLost:
      "⚠ Lost the connection to the music server, so the session stopped. The bot will reconnect automatically.",
    aloneLeft: "👋 Nobody is left in the voice channel, so the bot left.",
    idleLeft:
      "👋 No activity for 3 minutes, so the bot left the voice channel.",
    restored: (count: number) =>
      `♻ Restored the session from before the bot restarted (${plural(count, "track", "tracks")}).`,
  },
  nowPlaying: {
    title: "Now playing",
    author: "Artist",
    duration: "Duration",
    live: "🔴 LIVE",
    requestedBy: "Requested by",
    loop: "Loop",
    volume: "Volume",
    filter: "Filter",
    unknownRequester: "Unknown",
    autoplayRequester: "Autoplay",
  },
  autoplay: {
    state: (enabled: boolean, modeName: string) =>
      `🔁 Autoplay: **${enabled ? "On" : "Off"}** (mode: **${modeName}**).`,
    nothingFound:
      "No related tracks found, so autoplay is paused. Use `/play`, `/radio` or `/autoplay` to continue.",
  },
  radio: {
    started: (title: string, count: number) =>
      `📻 Started a radio from **${title}** and added ${plural(count, "track", "tracks")}. The bot will add related tracks whenever the queue runs out.`,
    skipped: (duplicates: number, dropped: number) =>
      `Skipped${duplicates > 0 ? ` ${plural(duplicates, "track", "tracks")} already in the queue` : ""}${duplicates > 0 && dropped > 0 ? " and" : ""}${dropped > 0 ? ` ${plural(dropped, "track", "tracks")} over the limit` : ""}.`,
    noRelated:
      "No related tracks found right now. The bot will try again when the queue runs out.",
  },
  similar: {
    title: (track: string) => `Tracks similar to ${track}`,
    footer: (total: number) =>
      `${plural(total, "suggestion", "suggestions")} • Pick tracks from the list or add them all`,
    footerAdded: (added: number, remaining: number) =>
      `Added ${plural(added, "track", "tracks")} • ${plural(remaining, "suggestion", "suggestions")} left`,
    footerDone: (added: number) =>
      `Added ${plural(added, "track", "tracks")}, no suggestions left.`,
    more: (count: number) => `… and ${count} more in the select menu`,
    placeholder: "Pick tracks to add to the queue",
    addAll: "Add all",
    none: "No similar tracks found for the current track.",
    added: (count: number) =>
      `➕ Added ${plural(count, "track", "tracks")} to the queue.`,
  },
  queue: {
    title: "📜 Queue",
    current: "Now playing",
    upNext: "Up next",
    empty: "The queue is empty.",
    footer: (
      page: number,
      totalPages: number,
      count: number,
      duration: string,
      loop: string,
    ) =>
      `Page ${page}/${totalPages} • ${plural(count, "track", "tracks")} • ${duration} • Loop: ${loop}`,
  },
  lyrics: {
    unsupported: "The music server does not support lyrics yet.",
    notFound: "No lyrics found for this track.",
    failed: "Could not fetch the lyrics right now. Please try again later.",
    title: (track: string) => `Lyrics: ${track}`,
    footer: (page: number, totalPages: number) => `Page ${page}/${totalPages}`,
  },
  settings: {
    title: "⚙️ Server settings",
    djRole: "DJ role",
    defaultVolume: "Default volume",
    twentyFourSeven: "24/7 mode",
    autoplay: "Autoplay",
    autoplayMode: "Autoplay mode",
    language: "Language",
    notSet: "Not set",
    on: "On",
    off: "Off",
    djRoleSet: (roleId: string) => `✅ DJ role set to <@&${roleId}>.`,
    djRoleCleared: "✅ DJ role cleared. Everyone can control the music.",
    djRoleInvalid:
      "@everyone or the bot's own role cannot be used as the DJ role.",
    defaultVolumeSet: (level: number) =>
      `✅ Default volume: **${level}%** (applies to new sessions).`,
    languageDefault: (name: string) => `Default (${name})`,
    languageSet: (name: string) => `✅ Language set to **${name}**.`,
    languageReset: (name: string) =>
      `✅ Using the bot default language again (**${name}**).`,
    noPermission: "You need the Manage Server permission to use this command.",
    modLog: "Mod log",
    modLogSet: (channelId: string) =>
      `✅ Mod log channel set to <#${channelId}>.`,
    modLogCleared: "✅ Mod log turned off.",
    modLogNoAccess:
      "The bot can't post in that channel. It needs View Channel, Send Messages and Embed Links there.",
    modDm: "DM on action",
    modDmSet: (enabled: boolean) =>
      `✅ DM on moderation actions: **${enabled ? "On" : "Off"}**.`,
    leveling: "Leveling",
    levelUpMode: "Level-up messages",
    levelUpChannel: "Level-up channel",
    levelUpNoAccess:
      "I can't post in that channel. I need View Channel, Send Messages and Embed Links there.",
    levelingSaved: "✅ Leveling settings saved.",
  },
  moderation: {
    self: "You can't use this on yourself.",
    bot: "The bot can't moderate itself.",
    owner: "The server owner can't be moderated.",
    notMember: "That user is not a member of this server.",
    invokerNotHigher:
      "You can only act on members whose highest role is below yours.",
    botNotHigher:
      "The bot's highest role must be above the member's highest role. Move the bot's role up in Server Settings > Roles.",
    targetAdmin: "Members with the Administrator permission can't be timed out.",
    invokerMissing: (permission: string) =>
      `You need the **${permission}** permission to use this command.`,
    botMissing: (permissions: string[]) =>
      `The bot is missing permissions: ${permissions.join(", ")}.`,
    invalidUser:
      "Enter a user ID or mention, e.g. `123456789012345678` or `<@123456789012345678>`.",
    unknownUser: "No Discord user has that ID.",
    notTimedOut: "That member is not timed out.",
    invalidDuration:
      "Invalid duration. Use numbers with s, m, h, d or w, e.g. `10m`, `1h30m` or `7d`.",
    durationTooLong: "A timeout can last at most 28 days.",
    alreadyBanned: "That user is already banned.",
    notBanned: "That user is not banned.",
    caseNotFound: "That case does not exist.",
    purgeNoAccess: "The bot can't read or delete messages in this channel.",
    storageUnavailable:
      "Moderation records are temporarily unavailable. Please try again later.",
    banned: (user: string, n: number | null) =>
      `🔨 Banned **${user}**${caseRef(n)}.`,
    unbanned: (user: string, n: number | null) =>
      `🔓 Unbanned **${user}**${caseRef(n)}.`,
    kicked: (user: string, n: number | null) =>
      `👢 Kicked **${user}**${caseRef(n)}.`,
    timedOut: (user: string, duration: string, n: number | null) =>
      `⏳ Timed out **${user}** for ${duration}${caseRef(n)}.`,
    timeoutRemoved: (user: string, n: number | null) =>
      `✅ Removed the timeout of **${user}**${caseRef(n)}.`,
    warned: (user: string, n: number | null) =>
      `⚠️ Warned **${user}**${caseRef(n)}.`,
    purged: (n: number) =>
      `🧹 Deleted ${plural(n, "message", "messages")}.`,
    purgeSkipped: (m: number) =>
      `${plural(m, "message was", "messages were")} not deleted: only the last 100 messages are checked, and pinned messages, messages older than 14 days and (with a user filter) messages from other users are skipped.`,
    caseReasonUpdated: (n: number) => `✏️ Updated the reason of case #${n}.`,
    caseDeleted: (n: number) =>
      `🗑 Deleted case #${n}. Its mod-log message stays.`,
    warningsCleared: (user: string, count: number) =>
      `🧹 Deleted ${plural(count, "warning", "warnings")} of **${user}**.`,
    dmFailed: "The user could not be notified by DM.",
    caseNotRecorded:
      "The action was done, but the case could not be saved right now.",
    dmAlreadySent: "The user was already notified by DM.",
    dmBan: (guild: string) => `You are being banned from **${guild}**.`,
    dmKick: (guild: string) => `You are being kicked from **${guild}**.`,
    dmTimeout: (guild: string, duration: string) =>
      `You have been timed out in **${guild}** for ${duration}.`,
    dmWarn: (guild: string) => `You have received a warning in **${guild}**.`,
    dmReason: (reason: string) => `Reason: ${reason}`,
    log: {
      caseTitle: (action: string, n: number | null) =>
        n === null ? `${action} | Case not recorded` : `${action} | Case #${n}`,
      notRecorded: "The case could not be saved, so it has no number.",
      target: "User",
      moderator: "Moderator",
      reason: "Reason",
      noReason: "No reason given",
      duration: "Duration",
      dm: "DM",
      dmSent: "Sent",
      dmNotSent: "Not sent",
      dmOff: "Off",
      purgeTitle: "Messages purged",
      channel: "Channel",
      count: "Deleted",
      userFilter: "Only from",
    },
    actions: {
      ban: "Ban",
      unban: "Unban",
      kick: "Kick",
      timeout: "Timeout",
      untimeout: "Timeout removed",
      warn: "Warning",
    },
    warnings: {
      title: (user: string) => `Warnings of ${user}`,
      empty: "This user has no warnings.",
      footer: (page: number, totalPages: number, total: number) =>
        `Page ${page}/${totalPages} • ${plural(total, "warning", "warnings")}`,
    },
  },
  leveling: {
    disabled: "Leveling is turned off in this server.",
    botsNoXp: "Bots do not earn XP.",
    storageUnavailable:
      "Levels are temporarily unavailable. Please try again later.",
    rank: {
      title: "📊 Rank",
      level: "Level",
      xp: "XP",
      totalXp: "Total XP",
      rank: "Rank",
      rankOf: (rank: string, total: string) => `#${rank} of ${total}`,
      unranked: "This member has no XP yet.",
    },
    leaderboard: {
      title: "🏆 Leaderboard",
      line: (rank: string, mention: string, level: string, xp: string) =>
        `**${rank}.** ${mention} · Lv ${level} · ${xp} XP`,
      empty: "Nobody has earned XP in this server yet.",
      footer: (page: number, totalPages: number) => `Page ${page}/${totalPages}`,
    },
    levelUp: (mention: string, level: number) =>
      `🎉 ${mention} reached level **${level}**!`,
    rewardsGained: (roleMentions: string[]) =>
      `🎁 New ${roleMentions.length === 1 ? "role" : "roles"}: ${roleMentions.join(", ")}`,
    xp: {
      added: (user: string, amount: string, xp: string, level: string) =>
        `✅ Added ${amount} XP to ${user}. Now **${xp} XP**, level **${level}**.`,
      removed: (user: string, amount: string, xp: string, level: string) =>
        `✅ Removed ${amount} XP from ${user}. Now **${xp} XP**, level **${level}**.`,
      set: (user: string, xp: string, level: string) =>
        `✅ Set the XP of ${user} to **${xp} XP**, level **${level}**.`,
      reset: (user: string) => `✅ Deleted the XP and level of ${user}.`,
      notFound: "That member has no XP yet.",
      amountOutOfRange: (min: string, max: string) =>
        `The amount must be a whole number from ${min} to ${max}.`,
    },
  },
  filters: {
    names: {
      bassboost: "Bass Boost",
      nightcore: "Nightcore",
      "8d": "8D",
      vaporwave: "Vaporwave",
      karaoke: "Karaoke",
      off: "Off",
    },
  },
  buttons: {
    pause: "Pause",
    resume: "Resume",
    skip: "Skip",
    stop: "Stop",
    loop: "Loop",
    shuffle: "Shuffle",
    queue: "Queue",
    prev: "Previous",
    next: "Next",
  },
  help: {
    title: "Command list",
    footer: "Type / to see the details of each command.",
    empty: "No commands yet.",
  },
  presence: {
    activity: "Playing music | /help",
  },
};

export type Messages = typeof en;
