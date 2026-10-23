import 'server-only';
import { z } from 'zod';
import { WEB_AUTOMOD_BODY_LIMIT_BYTES } from '../../../src/config/constants.js';
import type { AutomodPutPayload } from '../../../src/bridge/protocol.js';
import { automodBodySchemas, automodParamsSchema, guildParamsSchema, zodIssues } from '../../shared/api.js';
import { ApiError, jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';
import { checkAutomodBody } from '../semantic-checks.js';

/** Route 17: GET /api/guilds/:guildId/automod (DP-1 (b)): the Perry rules, read by the bot with discord.js. */
export const getRules = apiRoute(
  { route: '/api/guilds/[guildId]/automod', auth: 'manage', params: guildParamsSchema },
  async ({ deps, params }) => jsonResponse(await deps.bridge.request('automod.list', params.guildId, {})),
);

/**
 * Route 18: PUT /api/guilds/:guildId/automod/:kind (body limit 256 KiB: 1000 keywords of 60 characters). The stored
 * ids for the semantic checks come from the guild's current Perry rule of that kind (one automod.list request).
 */
export const putRule = apiRoute(
  {
    route: '/api/guilds/[guildId]/automod/[kind]',
    auth: 'manage',
    params: automodParamsSchema,
    body: z.unknown(),
    bodyLimit: WEB_AUTOMOD_BODY_LIMIT_BYTES,
  },
  async ({ deps, params, body, session }) => {
    const { guildId, kind } = params;
    const parsed = automodBodySchemas[kind].safeParse(body);
    if (!parsed.success) throw new ApiError('invalid_body', { issues: zodIssues(parsed.error) });
    const list = await deps.bridge.request('automod.list', guildId, {});
    if (!list.available) throw new ApiError('bot_missing_permission');
    const meta = await deps.guildData.guildMeta(guildId);
    const checked = checkAutomodBody(guildId, list.rules[kind], meta, parsed.data);
    if (checked.issues.length > 0) throw new ApiError('invalid_body', { issues: checked.issues });
    const actor = { id: session.record.userId, username: (session.record.globalName ?? session.record.username).slice(0, 64) };
    const payload = { kind, body: checked.value, actor } as AutomodPutPayload;
    return jsonResponse(await deps.bridge.request('automod.put', guildId, payload));
  },
);
