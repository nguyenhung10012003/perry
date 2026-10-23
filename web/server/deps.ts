import 'server-only';
import type { GuildSettings } from '../../src/settings/guild-settings.js';
import type { Keys } from '../../src/storage/keys.js';
import type { ReplaceRewardsResult } from '../../src/storage/postgres/level-repo.js';
import type { LevelReward, MemberLevel } from '../../src/storage/types.js';
import type { Logger } from '../../src/utils/logger.js';
import type { PublicLeaderboard } from '../shared/api.js';
import type { BridgeClient } from './bridge-client.js';
import type { WebConfig } from './config.js';
import type { DiscordApi } from './discord-api.js';
import type { GuildData } from './guild-data.js';
import type { OAuthStateStore } from './oauth.js';
import type { WebRateLimits } from './rate-limit.js';
import type { SessionStore } from './session.js';

/**
 * Guild settings for the web. The web keeps no settings cache: reads go to Postgres, writes go to Postgres and then
 * invalidate the bot's cache (design 4.15). Both throw ApiError 503 storage_unavailable / schema_outdated.
 */
export interface SettingsGateway {
  read(guildId: string): Promise<GuildSettings>;
  write(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings>;
}

/** Levels and role rewards; every method throws ApiError 503 when Postgres is unavailable. */
export interface LevelsGateway {
  rewards(guildId: string): Promise<LevelReward[]>;
  replaceRewards(guildId: string, rewards: readonly LevelReward[]): Promise<ReplaceRewardsResult>;
  count(guildId: string): Promise<number>;
  page(guildId: string, offset: number, limit: number): Promise<MemberLevel[]>;
}

/** 30 s cache of the public leaderboard pages (web:publb:<guildId>:<page>). */
export interface PublicLeaderboardCache {
  get(guildId: string, page: number): Promise<PublicLeaderboard | null>;
  set(guildId: string, page: number, value: PublicLeaderboard): Promise<void>;
  /** Deletes every page of the guild (called before answering a PATCH that hides the leaderboard). */
  clear(guildId: string): Promise<void>;
}

/** The only way handlers and page loaders reach a backend (fakes in testing/fakes.ts). */
export interface WebDeps {
  readonly config: WebConfig;
  readonly logger: Logger;
  readonly keys: Keys;
  /** HKDF key that seals the Discord tokens kept in sessions. */
  readonly sealKey: Buffer;
  readonly sessions: SessionStore;
  readonly oauthStates: OAuthStateStore;
  readonly rateLimits: WebRateLimits;
  readonly discord: DiscordApi;
  readonly guildData: GuildData;
  readonly bridge: BridgeClient;
  readonly settings: SettingsGateway;
  readonly levels: LevelsGateway;
  readonly publicLeaderboards: PublicLeaderboardCache;
  readonly health: {
    postgresUp(): boolean;
    redisUp(): boolean;
    schemaOutdated(): boolean;
  };
  readonly now: () => number;
}
