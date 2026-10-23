/** Redis key scheme: `<prefix>:v1:<kind>:...`. Every key written with these helpers must carry a TTL. */
export interface Keys {
  settings(guildId: string): string;
  snapshot(guildId: string): string;
  snapshotScan(): string;
  recent(guildId: string): string;
  cooldown(command: string, userId: string): string;
  rate(scope: string, id: string): string;
  autocomplete(source: string, hash: string): string;
  lastfm(hash: string): string;
  settingsEvents(): string;
  /** Hash of the last registered slash-command definitions; scope is `global` or `guild:<id>`. */
  commandsHash(clientId: string, scope: string): string;
  /** Web session record; hash is sha256 of the session id, so a Redis dump holds no usable cookie. */
  webSession(hash: string): string;
  webOAuthState(state: string): string;
  /** The user's guild list from Discord (60 s). */
  webUserGuilds(userId: string): string;
  /** The bot's guild list, written by the bot (180 s). */
  botGuilds(): string;
  /** Pub/sub channel of bridge requests (web publishes, bot subscribes). */
  bridgeEvents(): string;
  /** Bridge reply, written by the bot (30 s). */
  bridgeResponse(requestId: string): string;
  /** Web cache of the bot's guild data reply (60 s); the bot deletes it when a channel or role is deleted. */
  guildMeta(guildId: string): string;
  /** Public leaderboard page data (30 s). */
  webPublicLeaderboard(guildId: string, page: number): string;
}

export function createKeys(prefix: string): Keys {
  const base = `${prefix}:v1`;
  return {
    settings: (guildId) => `${base}:settings:${guildId}`,
    snapshot: (guildId) => `${base}:snap:${guildId}`,
    snapshotScan: () => `${base}:snap:*`,
    recent: (guildId) => `${base}:recent:${guildId}`,
    cooldown: (command, userId) => `${base}:cd:${command}:${userId}`,
    rate: (scope, id) => `${base}:rl:${scope}:${id}`,
    autocomplete: (source, hash) => `${base}:ac:${source}:${hash}`,
    lastfm: (hash) => `${base}:lfm:${hash}`,
    settingsEvents: () => `${base}:evt:settings`,
    commandsHash: (clientId, scope) => `${base}:cmdhash:${clientId}:${scope}`,
    webSession: (hash) => `${base}:web:sess:${hash}`,
    webOAuthState: (state) => `${base}:web:oauth:${state}`,
    webUserGuilds: (userId) => `${base}:web:uguilds:${userId}`,
    botGuilds: () => `${base}:botguilds`,
    bridgeEvents: () => `${base}:evt:bridge`,
    bridgeResponse: (requestId) => `${base}:bridge:res:${requestId}`,
    guildMeta: (guildId) => `${base}:gmeta:${guildId}`,
    webPublicLeaderboard: (guildId, page) => `${base}:web:publb:${guildId}:${page}`,
  };
}
