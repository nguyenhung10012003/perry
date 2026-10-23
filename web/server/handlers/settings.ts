import 'server-only';
import type { GuildSettings } from '../../../src/settings/guild-settings.js';
import {
  generalPatchSchema,
  generalView,
  guildParamsSchema,
  levelingPatchSchema,
  levelingView,
  moderationPatchSchema,
  moderationView,
} from '../../shared/api.js';
import type { WebDeps } from '../deps.js';
import { ApiError, jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';
import { checkGuildPatch, patchNeedsGuildData } from '../semantic-checks.js';

/**
 * Routes 12-14. After zod: the semantic checks against the stored settings and, only when the patch carries a channel
 * or role id, the bot's guild data (saves of toggles and numbers need no bridge round trip); then the write, which
 * invalidates the bot's cache (design 4.15).
 */
async function applyPatch(deps: WebDeps, guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings> {
  const stored = await deps.settings.read(guildId);
  const meta = patchNeedsGuildData(patch) ? await deps.guildData.guildMeta(guildId) : null;
  const checked = checkGuildPatch(guildId, stored, meta, patch);
  if (checked.issues.length > 0) throw new ApiError('invalid_body', { issues: checked.issues });
  return deps.settings.write(guildId, checked.value);
}

export const patchGeneral = apiRoute(
  { route: '/api/guilds/[guildId]/general', auth: 'manage', params: guildParamsSchema, body: generalPatchSchema },
  async ({ deps, params, body }) => jsonResponse({ general: generalView(await applyPatch(deps, params.guildId, body)) }),
);

export const patchModeration = apiRoute(
  { route: '/api/guilds/[guildId]/moderation', auth: 'manage', params: guildParamsSchema, body: moderationPatchSchema },
  async ({ deps, params, body }) =>
    jsonResponse({ moderation: moderationView(await applyPatch(deps, params.guildId, body)) }),
);

export const patchLeveling = apiRoute(
  { route: '/api/guilds/[guildId]/leveling', auth: 'manage', params: guildParamsSchema, body: levelingPatchSchema },
  async ({ deps, params, body }) => {
    const written = await applyPatch(deps, params.guildId, body);
    // A hidden leaderboard must never be served from the 30 s public cache.
    if (body.leaderboardPublic === false) await deps.publicLeaderboards.clear(params.guildId);
    return jsonResponse({ leveling: levelingView(written) });
  },
);
