import 'server-only';
import { pino } from 'pino';
import type { AutomodList, BotGuilds, GuildMeta } from '../../../src/bridge/protocol.js';
import { defaultSettings, validateSettingsPatch } from '../../../src/settings/guild-settings.js';
import type { GuildSettings } from '../../../src/settings/guild-settings.js';
import { createKeys } from '../../../src/storage/keys.js';
import { MemoryRateLimiter } from '../../../src/storage/memory/memory-cooldowns.js';
import type { LevelReward, MemberLevel } from '../../../src/storage/types.js';
import type { BridgeClient } from '../bridge-client.js';
import { parseWebConfig } from '../config.js';
import type { WebConfig } from '../config.js';
import { cookieNames } from '../cookies.js';
import { deriveSealKey, randomToken, seal } from '../crypto.js';
import type { LevelsGateway, SettingsGateway, WebDeps } from '../deps.js';
import type { DiscordApi, DiscordUser, OAuthToken, UserGuild } from '../discord-api.js';
import { ApiError } from '../errors.js';
import { createGuildData } from '../guild-data.js';
import { createOAuthStateStore } from '../oauth.js';
import { createWebRateLimits } from '../rate-limit.js';
import { MemoryRawCache } from '../raw-cache.js';
import { createSessionStore } from '../session.js';
import { createPublicLeaderboardCache } from '../settings-writer.js';

/**
 * In-memory WebDeps for `npm test` (never imported by app/). The real session, OAuth-state, guild-data and cache
 * modules run on a MemoryRawCache; Discord and the bot bridge are stubs, Postgres is replaced by maps.
 */

export const FAKE_ORIGIN = 'http://localhost:3000';
export const FAKE_ENV = {
  NODE_ENV: 'test',
  DISCORD_CLIENT_ID: '123456789012345678',
  DISCORD_CLIENT_SECRET: 'fakesecretfakesecret0',
  PUBLIC_URL: FAKE_ORIGIN,
  SESSION_SECRET: 'f'.repeat(64),
  DATABASE_URL: 'postgres://perry:pw@127.0.0.1:5432/perry',
  REDIS_URL: 'redis://:pw@127.0.0.1:6379',
};

export function fakeConfig(env: Record<string, string> = {}): WebConfig {
  const parsed = parseWebConfig({ ...FAKE_ENV, ...env });
  if (!parsed.ok) throw new Error(`fake config invalid: ${parsed.error.message}`);
  return parsed.config;
}

export class StubDiscord implements DiscordApi {
  readonly calls: string[] = [];
  token: OAuthToken | Error = { accessToken: 'stub-access-token-0001', expiresIn: 604_800, scopes: ['identify', 'guilds'] };
  user: DiscordUser = { id: '200000000000000001', username: 'manager', globalName: 'Manager', avatar: null };
  guilds: UserGuild[] = [];
  guildsError: ApiError | null = null;
  revoked: string[] = [];

  exchangeCode(code: string): Promise<OAuthToken> {
    this.calls.push(`exchange ${code}`);
    return this.token instanceof Error ? Promise.reject(this.token) : Promise.resolve(this.token);
  }
  revokeToken(accessToken: string): Promise<void> {
    this.revoked.push(accessToken);
    return Promise.resolve();
  }
  getCurrentUser(): Promise<DiscordUser> {
    this.calls.push('getCurrentUser');
    return Promise.resolve(this.user);
  }
  getUserGuilds(): Promise<UserGuild[]> {
    this.calls.push('getUserGuilds');
    return this.guildsError !== null ? Promise.reject(this.guildsError) : Promise.resolve(this.guilds);
  }
}

export class StubBridge implements BridgeClient {
  botGuildList: BotGuilds | null = { v: 1, at: Date.now(), guilds: [] };
  meta = new Map<string, GuildMeta>();
  automod = new Map<string, AutomodList>();
  puts: { guildId: string; payload: unknown }[] = [];
  requests: string[] = [];
  failWith: ApiError | null = null;

  request<T extends 'gmeta' | 'automod.list' | 'automod.put'>(type: T, guildId: string, payload: unknown): Promise<never> {
    this.requests.push(`${type} ${guildId}`);
    if (this.failWith !== null) return Promise.reject(this.failWith);
    if (this.botGuildList === null) return Promise.reject(new ApiError('bot_unavailable'));
    if (!this.botGuildList.guilds.some((guild) => guild.id === guildId)) return Promise.reject(new ApiError('bot_not_in_guild'));
    if (type === 'gmeta') {
      const meta = this.meta.get(guildId);
      return meta === undefined ? Promise.reject(new ApiError('bot_unavailable')) : (Promise.resolve(structuredClone(meta)) as Promise<never>);
    }
    const list = this.automod.get(guildId) ?? {
      available: true,
      rules: { keywords: null, invites: null, mentions: null, presets: null },
    };
    if (type === 'automod.list') return Promise.resolve(structuredClone(list)) as Promise<never>;
    this.puts.push({ guildId, payload });
    const { kind, body } = payload as { kind: keyof AutomodList['rules']; body: Record<string, unknown> };
    return Promise.resolve({ rule: { ...body, id: '900000000000000001' }, kind }) as Promise<never>;
  }
  botGuilds(): Promise<BotGuilds> {
    return this.botGuildList === null ? Promise.reject(new ApiError('bot_unavailable')) : Promise.resolve(this.botGuildList);
  }
  forgetBotGuilds(): void {}
}

export interface FakeWorld {
  deps: WebDeps;
  config: WebConfig;
  cache: MemoryRawCache;
  discord: StubDiscord;
  bridge: StubBridge;
  settings: Map<string, GuildSettings>;
  writes: { guildId: string; patch: Partial<GuildSettings> }[];
  rewards: Map<string, LevelReward[]>;
  members: Map<string, MemberLevel[]>;
  state: { pgUp: boolean; schemaOutdated: boolean; rewardConflict: boolean; now: number };
}

export function createFakeWorld(env: Record<string, string> = {}): FakeWorld {
  const config = fakeConfig(env);
  const keys = createKeys('perrytest');
  const logger = pino({ level: 'silent' });
  const state = { pgUp: true, schemaOutdated: false, rewardConflict: false, now: Date.now() };
  const now = () => state.now;
  const cache = new MemoryRawCache(now);
  const discord = new StubDiscord();
  const bridge = new StubBridge();
  const settingsMap = new Map<string, GuildSettings>();
  const writes: FakeWorld['writes'] = [];
  const rewards = new Map<string, LevelReward[]>();
  const members = new Map<string, MemberLevel[]>();
  const pg = (): void => {
    if (!state.pgUp) throw new ApiError(state.schemaOutdated ? 'schema_outdated' : 'storage_unavailable');
  };
  const settings: SettingsGateway = {
    read(guildId) {
      pg();
      return Promise.resolve({ ...(settingsMap.get(guildId) ?? defaultSettings()) });
    },
    write(guildId, patch) {
      validateSettingsPatch(patch);
      pg();
      const next = { ...(settingsMap.get(guildId) ?? defaultSettings()), ...patch };
      settingsMap.set(guildId, next);
      writes.push({ guildId, patch });
      return Promise.resolve({ ...next });
    },
  };
  const levels: LevelsGateway = {
    rewards(guildId) {
      pg();
      return Promise.resolve([...(rewards.get(guildId) ?? [])]);
    },
    replaceRewards(guildId, next) {
      pg();
      if (state.rewardConflict) return Promise.resolve({ conflict: true });
      const sorted = [...next].sort((a, b) => a.level - b.level);
      rewards.set(guildId, sorted);
      return Promise.resolve({ conflict: false, rewards: sorted });
    },
    count(guildId) {
      pg();
      return Promise.resolve((members.get(guildId) ?? []).length);
    },
    page(guildId, offset, limit) {
      pg();
      const sorted = [...(members.get(guildId) ?? [])].sort(
        (a, b) => b.xp - a.xp || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
      );
      return Promise.resolve(sorted.slice(offset, offset + limit));
    },
  };
  const sessions = createSessionStore(cache, keys);
  const deps: WebDeps = {
    config,
    logger,
    keys,
    sealKey: deriveSealKey(config.sessionSecret),
    sessions,
    oauthStates: createOAuthStateStore(cache, keys),
    rateLimits: createWebRateLimits(new MemoryRateLimiter()),
    discord,
    guildData: createGuildData({ cache, keys, discord, bridge, sessions, logger }),
    bridge,
    settings,
    levels,
    publicLeaderboards: createPublicLeaderboardCache(cache, keys),
    health: {
      postgresUp: () => state.pgUp,
      redisUp: () => cache.up,
      schemaOutdated: () => state.schemaOutdated,
    },
    now,
  };
  return { deps, config, cache, discord, bridge, settings: settingsMap, writes, rewards, members, state };
}

export interface SeededSession {
  sessionId: string;
  csrfToken: string;
  cookie: string;
}

/** Writes a session through the real SessionStore (sealed fake token) and returns its cookie and CSRF token. */
export async function seedSession(world: FakeWorld, accessToken = 'stub-access-token-0001'): Promise<SeededSession> {
  const csrfToken = randomToken();
  const sessionId = await world.deps.sessions.create(
    {
      v: 1,
      userId: world.discord.user.id,
      username: world.discord.user.username,
      globalName: world.discord.user.globalName,
      avatar: null,
      accessToken: seal(world.deps.sealKey, accessToken),
      tokenExpiresAt: world.state.now + 3_600_000,
      csrfToken,
      createdAt: world.state.now,
    },
    3600,
  );
  if (sessionId === null) throw new Error('could not seed a session');
  const name = cookieNames(world.config.secureCookies).session;
  return { sessionId, csrfToken, cookie: `${name}=${sessionId}` };
}

export interface FakeRequestInit {
  method?: string;
  session?: SeededSession;
  /** false: omit X-CSRF-Token; a string: send that token. Default: the session's token. */
  csrf?: string | false;
  origin?: string | null;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
}

/** A Request as the browser of FAKE_ORIGIN would send it. */
export function fakeRequest(path: string, init: FakeRequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (init.session !== undefined) {
    headers.set('cookie', init.session.cookie);
    if (init.csrf !== false) headers.set('x-csrf-token', init.csrf ?? init.session.csrfToken);
  }
  if (init.origin !== null) headers.set('origin', init.origin ?? FAKE_ORIGIN);
  headers.set('x-forwarded-for', headers.get('x-forwarded-for') ?? '203.0.113.7');
  let body = init.body;
  if (init.json !== undefined) {
    body = JSON.stringify(init.json);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new Request(`${FAKE_ORIGIN}${path}`, { method: init.method ?? 'GET', headers, body, duplex: 'half' } as RequestInit);
}

/** The second Route Handler argument. */
export function routeContext(params: Record<string, string> = {}): { params: Promise<Record<string, string>> } {
  return { params: Promise.resolve(params) };
}

/** Guild data of a fake guild: text channels (one where the bot cannot post), a voice channel, roles. */
export function fakeGuildMeta(guildId: string): GuildMeta {
  return {
    channels: [
      { id: '300000000000000001', name: 'general', type: 0, parentId: null, position: 0, botCanPost: true },
      { id: '300000000000000002', name: 'read-only', type: 0, parentId: null, position: 1, botCanPost: false },
      { id: '300000000000000003', name: 'Voice', type: 2, parentId: null, position: 2, botCanPost: false },
      { id: '300000000000000004', name: 'news', type: 5, parentId: null, position: 3, botCanPost: true },
      { id: '300000000000000005', name: 'Category', type: 4, parentId: null, position: 4, botCanPost: false },
    ],
    roles: [
      { id: guildId, name: '@everyone', color: 0, position: 0, managed: false, assignable: false },
      { id: '400000000000000001', name: 'Member', color: 0, position: 1, managed: false, assignable: true },
      { id: '400000000000000002', name: 'Perry', color: 0, position: 2, managed: true, assignable: false },
      { id: '400000000000000003', name: 'Admin', color: 0, position: 3, managed: false, assignable: false },
      { id: '400000000000000004', name: 'Regular', color: 0, position: 1, managed: false, assignable: true },
    ],
    botTopRolePosition: 2,
    botPermissions: { manageRoles: true, manageGuild: true, moderateMembers: true },
  };
}
