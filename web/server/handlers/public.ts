import 'server-only';
import { guildParamsSchema, publicLeaderboardQuerySchema } from '../../shared/api.js';
import { ApiError, jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';
import { publicLeaderboard } from '../leaderboard.js';

/** Route 19: GET /api/public/leaderboard/:guildId?page=1..40 (DP-5 (b)); 404 also when the page is disabled. */
export const getPublicLeaderboard = apiRoute(
  {
    route: '/api/public/leaderboard/[guildId]',
    auth: 'public',
    ipLimit: 'web-public',
    params: guildParamsSchema,
    query: publicLeaderboardQuerySchema,
  },
  async ({ deps, params, query }) => {
    const board = await publicLeaderboard(deps, params.guildId, query.page);
    if (board === null) throw new ApiError('not_found');
    return jsonResponse(board);
  },
);
