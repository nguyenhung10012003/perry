import { z } from 'zod';

/**
 * Wire format of the Redis bridge between the web and the bot (DP-10 (b)). Pure (imports only zod), so the bot,
 * the web server and the dashboard's client components share one definition.
 *
 * The web publishes a request on `<prefix>:v1:evt:bridge`; the bot answers into `<prefix>:v1:bridge:res:<id>` (30 s).
 * The bot writes its guild list to `<prefix>:v1:botguilds` (180 s). The web never holds the bot token: these request
 * types are the only things it can ask the bot to do.
 */

export const BRIDGE_VERSION = 1;

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord snowflake');

/** A list of distinct snowflakes with at most max entries. */
function snowflakeSet(max: number) {
  return z
    .array(snowflake)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'must not contain duplicates' });
}

/** Discord's longest AutoMod timeout: 28 days. */
export const AUTOMOD_TIMEOUT_MAX_SECONDS = 2_419_200;
export const AUTOMOD_KEYWORDS_MAX = 1000;
export const AUTOMOD_KEYWORD_ALLOW_MAX = 100;
export const AUTOMOD_PRESET_ALLOW_MAX = 1000;
export const AUTOMOD_WORD_MAX_LENGTH = 60;
export const AUTOMOD_EXEMPT_ROLES_MAX = 20;
export const AUTOMOD_EXEMPT_CHANNELS_MAX = 50;
export const AUTOMOD_MENTION_LIMIT_MAX = 50;

/** AutoMod keyword or allow-list entry: Discord allows 1..60 characters. */
const automodWord = z.string().min(1).max(AUTOMOD_WORD_MAX_LENGTH);

const common = {
  enabled: z.boolean(),
  alertChannelId: snowflake.nullable(),
  exemptRoleIds: snowflakeSet(AUTOMOD_EXEMPT_ROLES_MAX),
  exemptChannelIds: snowflakeSet(AUTOMOD_EXEMPT_CHANNELS_MAX),
};
const timeoutSeconds = z.number().int().min(0).max(AUTOMOD_TIMEOUT_MAX_SECONDS);

const keywordsShape = {
  ...common,
  keywords: z.array(automodWord).max(AUTOMOD_KEYWORDS_MAX),
  allowList: z.array(automodWord).max(AUTOMOD_KEYWORD_ALLOW_MAX),
  timeoutSeconds,
};
const invitesShape = { ...common, timeoutSeconds };
const mentionsShape = {
  ...common,
  limit: z.number().int().min(1).max(AUTOMOD_MENTION_LIMIT_MAX),
  raidProtection: z.boolean(),
  timeoutSeconds,
};
const presetsShape = {
  ...common,
  profanity: z.boolean(),
  sexualContent: z.boolean(),
  slurs: z.boolean(),
  allowList: z.array(automodWord).max(AUTOMOD_PRESET_ALLOW_MAX),
};

/** Request bodies: strict (unknown keys are rejected) with the checks Discord would otherwise answer with a 4xx. */
export const automodKeywordsSchema = z
  .strictObject(keywordsShape)
  .refine((rule) => !rule.enabled || rule.keywords.length > 0, {
    message: 'an enabled rule needs at least one keyword',
    path: ['keywords'],
  });
export const automodInvitesSchema = z.strictObject(invitesShape);
export const automodMentionsSchema = z.strictObject(mentionsShape);
export const automodPresetsSchema = z
  .strictObject(presetsShape)
  .refine((rule) => !rule.enabled || rule.profanity || rule.sexualContent || rule.slurs, {
    message: 'an enabled rule needs at least one word list',
    path: ['profanity'],
  });

export type AutomodKeywords = z.infer<typeof automodKeywordsSchema>;
export type AutomodInvites = z.infer<typeof automodInvitesSchema>;
export type AutomodMentions = z.infer<typeof automodMentionsSchema>;
export type AutomodPresets = z.infer<typeof automodPresetsSchema>;

export const AUTOMOD_KINDS = ['keywords', 'invites', 'mentions', 'presets'] as const;
export type AutomodKind = (typeof AUTOMOD_KINDS)[number];

export interface AutomodBodies {
  keywords: AutomodKeywords;
  invites: AutomodInvites;
  mentions: AutomodMentions;
  presets: AutomodPresets;
}

/** Request body schema of each rule kind (PUT /api/guilds/:id/automod/:kind and the automod.put request). */
export const automodBodySchemas = {
  keywords: automodKeywordsSchema,
  invites: automodInvitesSchema,
  mentions: automodMentionsSchema,
  presets: automodPresetsSchema,
} as const;

/** A Perry rule as it exists in Discord: its rule id plus the fields of the body that describes it. */
const ruleId = { id: snowflake };
export const automodRulesSchema = z.object({
  keywords: z.object({ ...keywordsShape, ...ruleId }).nullable(),
  invites: z.object({ ...invitesShape, ...ruleId }).nullable(),
  mentions: z.object({ ...mentionsShape, ...ruleId }).nullable(),
  presets: z.object({ ...presetsShape, ...ruleId }).nullable(),
});
export type AutomodRules = z.infer<typeof automodRulesSchema>;
export type AutomodRule<K extends AutomodKind> = NonNullable<AutomodRules[K]>;

/** automod.list reply: available is false when the bot lacks Manage Server (the rules are then all null). */
export const automodListSchema = z.object({ available: z.boolean(), rules: automodRulesSchema });
export type AutomodList = z.infer<typeof automodListSchema>;

/** Channel types the dashboard lists: text, voice, category, announcement, stage, forum, media (no threads). */
export const GUILD_META_CHANNEL_TYPES = [0, 2, 4, 5, 13, 15, 16] as const;
export type GuildMetaChannelType = (typeof GUILD_META_CHANNEL_TYPES)[number];

export const guildMetaSchema = z.object({
  channels: z
    .array(
      z.object({
        id: snowflake,
        name: z.string(),
        type: z.literal(GUILD_META_CHANNEL_TYPES),
        parentId: snowflake.nullable(),
        position: z.number().int(),
        /** ViewChannel + SendMessages + EmbedLinks after overwrites; false for categories, forums and media. */
        botCanPost: z.boolean(),
      }),
    )
    .max(1000),
  roles: z
    .array(
      z.object({
        id: snowflake,
        name: z.string(),
        color: z.number().int().min(0),
        position: z.number().int(),
        managed: z.boolean(),
        /** Not managed, not @everyone, strictly below the bot's highest role. */
        assignable: z.boolean(),
      }),
    )
    .max(1000),
  botTopRolePosition: z.number().int(),
  botPermissions: z.object({ manageRoles: z.boolean(), manageGuild: z.boolean(), moderateMembers: z.boolean() }),
});
export type GuildMeta = z.infer<typeof guildMetaSchema>;
export type GuildMetaChannel = GuildMeta['channels'][number];
export type GuildMetaRole = GuildMeta['roles'][number];

/** The bot's guild list (`botguilds`). */
export const botGuildsSchema = z.object({
  v: z.literal(BRIDGE_VERSION),
  at: z.number(),
  guilds: z
    .array(z.object({ id: snowflake, name: z.string().min(1).max(100), icon: z.string().nullable() }))
    .max(10_000),
});
export type BotGuilds = z.infer<typeof botGuildsSchema>;

const requestBase = {
  v: z.literal(BRIDGE_VERSION),
  id: z.uuid(),
  guildId: snowflake,
  /** Absolute deadline (epoch ms); the bot drops a request that arrives later. */
  deadline: z.number().int().positive(),
};

const actorSchema = z.object({ id: snowflake, username: z.string().min(1).max(64) });
export type BridgeActor = z.infer<typeof actorSchema>;

const putBase = { ...requestBase, type: z.literal('automod.put'), actor: actorSchema };

export const bridgeRequestSchema = z.union([
  z.object({ ...requestBase, type: z.literal('gmeta') }),
  z.object({ ...requestBase, type: z.literal('automod.list') }),
  z.discriminatedUnion('kind', [
    z.object({ ...putBase, kind: z.literal('keywords'), body: automodKeywordsSchema }),
    z.object({ ...putBase, kind: z.literal('invites'), body: automodInvitesSchema }),
    z.object({ ...putBase, kind: z.literal('mentions'), body: automodMentionsSchema }),
    z.object({ ...putBase, kind: z.literal('presets'), body: automodPresetsSchema }),
  ]),
]);
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeRequestType = BridgeRequest['type'];

export type AutomodPutPayload = {
  [K in AutomodKind]: { kind: K; body: AutomodBodies[K]; actor: BridgeActor };
}[AutomodKind];

/** What the caller adds to the common request fields (v, id, guildId, deadline) for each type. */
export interface BridgePayloads {
  gmeta: Record<string, never>;
  'automod.list': Record<string, never>;
  'automod.put': AutomodPutPayload;
}

/** Reply data of each request type; automod.put answers null when a disabled rule did not exist. */
export interface BridgeDataTypes {
  gmeta: GuildMeta;
  'automod.list': AutomodList;
  'automod.put': { rule: AutomodRules[AutomodKind] };
}

/** Reply data schema of each request type (the web validates every reply). */
export const bridgeDataSchemas = {
  gmeta: guildMetaSchema,
  'automod.list': automodListSchema,
  'automod.put': z.object({
    // Most specific first: the invites shape is a subset of the others, so it must be tried last.
    rule: z.union([
      automodRulesSchema.shape.keywords,
      automodRulesSchema.shape.mentions,
      automodRulesSchema.shape.presets,
      automodRulesSchema.shape.invites,
    ]),
  }),
} as const;

export const BRIDGE_ERRORS = [
  'not_in_guild',
  'missing_permission',
  'discord_rejected',
  'invalid_request',
  'internal',
] as const;
export type BridgeError = (typeof BRIDGE_ERRORS)[number];

export const bridgeReplySchema = z.union([
  z.object({ v: z.literal(BRIDGE_VERSION), id: z.uuid(), ok: z.literal(true), data: z.unknown() }),
  z.object({
    v: z.literal(BRIDGE_VERSION),
    id: z.uuid(),
    ok: z.literal(false),
    error: z.enum(BRIDGE_ERRORS),
    code: z.number().int().optional(),
  }),
]);
export type BridgeReply = z.infer<typeof bridgeReplySchema>;
