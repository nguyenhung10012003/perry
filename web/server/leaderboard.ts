import 'server-only';
import { WEB_LEADERBOARD_PAGE_SIZE } from '../../src/config/constants.js';
import { xpForNext, xpIntoLevel } from '../../src/leveling/xp.js';
import { clampPage } from '../../src/moderation/limits.js';
import type { Leaderboard, PublicLeaderboard } from '../shared/api.js';
import { avatarUrl, guildIconUrl } from '../shared/discord.js';
import type { WebDeps } from './deps.js';

/** One leaderboard page (25 members); a page past the end shows the last page, and Postgres reads that offset. */
export async function leaderboardPage(deps: WebDeps, guildId: string, requested: number): Promise<Leaderboard> {
  const total = await deps.levels.count(guildId);
  const totalPages = Math.max(1, Math.ceil(total / WEB_LEADERBOARD_PAGE_SIZE));
  const page = clampPage(requested, totalPages);
  const offset = (page - 1) * WEB_LEADERBOARD_PAGE_SIZE;
  const rows = total === 0 ? [] : await deps.levels.page(guildId, offset, WEB_LEADERBOARD_PAGE_SIZE);
  return {
    page,
    pageSize: WEB_LEADERBOARD_PAGE_SIZE,
    totalPages,
    total,
    entries: rows.map((row, index) => ({
      rank: offset + index + 1,
      userId: row.userId,
      username: row.username,
      avatarUrl: avatarUrl(row.userId, row.avatar),
      level: row.level,
      xp: row.xp,
      xpIntoLevel: xpIntoLevel(row.xp, row.level),
      xpForNext: xpForNext(row.level),
    })),
  };
}

/**
 * The public leaderboard (DP-5 (b)) after the caller's web-public limit: null when the bot is not in the guild or
 * the guild has not enabled the page (both answer 404, so the page does not reveal whether a guild uses Perry).
 * Pages are cached 30 s. Throws ApiError 503 when Postgres, Redis or the bot's guild list is unavailable.
 */
export async function publicLeaderboard(deps: WebDeps, guildId: string, requested: number): Promise<PublicLeaderboard | null> {
  const bot = await deps.guildData.botGuilds();
  const botGuild = bot.guilds.find((guild) => guild.id === guildId);
  if (botGuild === undefined) return null;
  const cached = await deps.publicLeaderboards.get(guildId, requested);
  if (cached !== null) return cached;
  const settings = await deps.settings.read(guildId);
  if (!settings.leaderboardPublic) return null;
  const board = await leaderboardPage(deps, guildId, requested);
  const value: PublicLeaderboard = {
    ...board,
    guild: { name: botGuild.name, iconUrl: guildIconUrl(botGuild.id, botGuild.icon) },
  };
  await deps.publicLeaderboards.set(guildId, requested, value);
  return value;
}
