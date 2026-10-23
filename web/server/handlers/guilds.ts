import 'server-only';
import { discordQuerySchema, generalView, guildParamsSchema, levelingView, moderationView } from '../../shared/api.js';
import type { GuildListItem, GuildSettingsResponse } from '../../shared/api.js';
import { guildIconUrl, hasManagePermission } from '../../shared/discord.js';
import type { WebDeps } from '../deps.js';
import type { Session } from '../session.js';
import { jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';
import { inviteUrl } from '../invite.js';

/** The guilds the user can manage, the ones with the bot first, then by name. 503 bot_unavailable without botguilds. */
export async function manageableGuilds(deps: WebDeps, session: Session): Promise<GuildListItem[]> {
  const [userGuilds, bot] = await Promise.all([deps.guildData.userGuilds(session), deps.guildData.botGuilds()]);
  const botIds = new Set(bot.guilds.map((guild) => guild.id));
  return userGuilds
    .filter(hasManagePermission)
    .map((guild) => {
      const botPresent = botIds.has(guild.id);
      return {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild.id, guild.icon),
        botPresent,
        inviteUrl: botPresent ? null : inviteUrl(deps.config.clientId, guild.id),
      };
    })
    .sort((a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name));
}

/** Route 9: GET /api/guilds. */
export const listGuilds = apiRoute({ route: '/api/guilds', auth: 'session' }, async ({ deps, session }) =>
  jsonResponse({ guilds: await manageableGuilds(deps, session) }),
);

/** Route 10: GET /api/guilds/:guildId. Settings and rewards from Postgres (the web keeps no settings cache). */
export const getGuild = apiRoute(
  { route: '/api/guilds/[guildId]', auth: 'manage', params: guildParamsSchema },
  async ({ deps, params, access }) => {
    const [settings, rewards] = await Promise.all([
      deps.settings.read(params.guildId),
      deps.levels.rewards(params.guildId),
    ]);
    const body: GuildSettingsResponse = {
      guild: { id: params.guildId, name: access.guild.name, iconUrl: guildIconUrl(params.guildId, access.guild.icon) },
      general: generalView(settings),
      moderation: moderationView(settings),
      leveling: { ...levelingView(settings), rewards },
    };
    return jsonResponse(body);
  },
);

/** Route 11: GET /api/guilds/:guildId/discord[?refresh=1]: channels and roles for the pickers, from the bot. */
export const getGuildData = apiRoute(
  {
    route: '/api/guilds/[guildId]/discord',
    auth: 'manage',
    params: guildParamsSchema,
    query: discordQuerySchema,
    extraLimit: (query) => (query.refresh === '1' ? 'web-refresh' : null),
  },
  async ({ deps, params, query }) =>
    jsonResponse(await deps.guildData.guildMeta(params.guildId, { refresh: query.refresh === '1' })),
);
