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
  };
}
