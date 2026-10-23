import 'server-only';
import { guildParamsSchema, leaderboardQuerySchema, rewardsPutSchema } from '../../shared/api.js';
import { ApiError, jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';
import { leaderboardPage } from '../leaderboard.js';
import { checkRewards } from '../semantic-checks.js';

/**
 * Route 15: PUT /api/guilds/:guildId/leveling/rewards. Stored reward roles that were deleted are dropped silently;
 * new ones must be assignable by the bot. The save replaces the whole set under a per-guild advisory lock, so two
 * concurrent saves never merge; a unique violation (defensive only) answers 409 conflict.
 */
export const putRewards = apiRoute(
  { route: '/api/guilds/[guildId]/leveling/rewards', auth: 'manage', params: guildParamsSchema, body: rewardsPutSchema },
  async ({ deps, params, body }) => {
    const { guildId } = params;
    const stored = await deps.levels.rewards(guildId);
    let rewards = body.rewards;
    if (rewards.length > 0) {
      const meta = await deps.guildData.guildMeta(guildId);
      const checked = checkRewards(guildId, stored, meta, rewards);
      if (checked.issues.length > 0) throw new ApiError('invalid_body', { issues: checked.issues });
      rewards = checked.value;
    }
    const result = await deps.levels.replaceRewards(guildId, rewards);
    if (result.conflict) throw new ApiError('conflict');
    return jsonResponse({ rewards: result.rewards });
  },
);

/** Route 16: GET /api/guilds/:guildId/leaderboard?page=1..100. */
export const getLeaderboard = apiRoute(
  { route: '/api/guilds/[guildId]/leaderboard', auth: 'manage', params: guildParamsSchema, query: leaderboardQuerySchema },
  async ({ deps, params, query }) => jsonResponse(await leaderboardPage(deps, params.guildId, query.page)),
);
