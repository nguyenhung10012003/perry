import 'server-only';
import { SNOWFLAKE_RE, hasManagePermission } from '../shared/discord.js';
import type { WebDeps } from './deps.js';
import type { UserGuild } from './discord-api.js';
import { ApiError } from './errors.js';
import { inviteUrl } from './invite.js';
import type { Session } from './session.js';

export interface ManageableGuild {
  /** The user's view of the guild (name, icon, permissions). */
  readonly guild: UserGuild;
  /** The bot's view of the guild (from botguilds). */
  readonly botGuild: { id: string; name: string; icon: string | null };
}

/**
 * Server-side permission re-check of every guild route and guild page (design 4.12), never trusting the client:
 * 1. guildId is a snowflake (400 invalid_params);
 * 2. the user's guild list (cached 60 s) has the guild with owner, Manage Server or Administrator (403 forbidden);
 * 3. the bot's guild list exists (503 bot_unavailable) and contains the guild (404 bot_not_in_guild + inviteUrl).
 */
export async function requireManageableGuild(deps: WebDeps, session: Session, guildId: string): Promise<ManageableGuild> {
  if (!SNOWFLAKE_RE.test(guildId)) throw new ApiError('invalid_params', { message: 'guildId must be a snowflake' });
  const guilds = await deps.guildData.userGuilds(session);
  const guild = guilds.find((candidate) => candidate.id === guildId);
  if (guild === undefined || !hasManagePermission(guild)) throw new ApiError('forbidden');
  const bot = await deps.guildData.botGuilds();
  const botGuild = bot.guilds.find((candidate) => candidate.id === guildId);
  if (botGuild === undefined) {
    throw new ApiError('bot_not_in_guild', { inviteUrl: inviteUrl(deps.config.clientId, guildId) });
  }
  return { guild, botGuild };
}
