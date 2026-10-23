import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  automodInvitesSchema,
  automodKeywordsSchema,
  automodMentionsSchema,
  automodPresetsSchema,
  botGuildsSchema,
  bridgeDataSchemas,
  bridgeReplySchema,
  bridgeRequestSchema,
  guildMetaSchema,
} from './protocol.js';

const GUILD = '100000000000000001';
const ROLE = '200000000000000001';
const CHANNEL = '300000000000000001';
const ID = '6f1c1b7e-2a4b-4c3d-9e8f-0a1b2c3d4e5f';
const ids = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(17, '0')}`);

const base = { v: 1, id: ID, guildId: GUILD, deadline: Date.now() + 2000 };
const keywords = {
  enabled: true,
  keywords: ['spam'],
  allowList: [],
  alertChannelId: null,
  timeoutSeconds: 0,
  exemptRoleIds: [],
  exemptChannelIds: [],
};
const actor = { id: '400000000000000001', username: 'manager' };

describe('bridge requests', () => {
  it('accepts gmeta and automod.list', () => {
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'gmeta' }).success, true);
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'automod.list' }).success, true);
  });

  it('accepts automod.put with the body of its kind', () => {
    const parsed = bridgeRequestSchema.safeParse({ ...base, type: 'automod.put', kind: 'keywords', body: keywords, actor });
    assert.equal(parsed.success, true);
  });

  it('rejects automod.put with the body of another kind', () => {
    const parsed = bridgeRequestSchema.safeParse({ ...base, type: 'automod.put', kind: 'mentions', body: keywords, actor });
    assert.equal(parsed.success, false);
  });

  it('rejects unknown types, versions, bad ids and missing deadlines', () => {
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'eval' }).success, false);
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'gmeta', v: 2 }).success, false);
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'gmeta', id: 'x' }).success, false);
    assert.equal(bridgeRequestSchema.safeParse({ ...base, type: 'gmeta', guildId: '12' }).success, false);
    const { deadline: _deadline, ...noDeadline } = base;
    assert.equal(bridgeRequestSchema.safeParse({ ...noDeadline, type: 'gmeta' }).success, false);
  });

  it('rejects an actor without a username', () => {
    const parsed = bridgeRequestSchema.safeParse({
      ...base,
      type: 'automod.put',
      kind: 'keywords',
      body: keywords,
      actor: { id: actor.id, username: '' },
    });
    assert.equal(parsed.success, false);
  });
});

describe('AutoMod rule bodies (Discord limits)', () => {
  it('keywords: 1000 keywords of 60 characters pass, 1001 or 61 characters fail', () => {
    const word = 'ạ'.repeat(60);
    const many = Array.from({ length: 1000 }, () => word);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, keywords: many }).success, true);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, keywords: [...many, word] }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, keywords: ['x'.repeat(61)] }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, keywords: [''] }).success, false);
  });

  it('keywords: allow list of 100 passes, 101 fails', () => {
    const allow = Array.from({ length: 100 }, (_, i) => `ok${i}`);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, allowList: allow }).success, true);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, allowList: [...allow, 'x'] }).success, false);
  });

  it('keywords: an enabled rule needs a keyword, a disabled one does not', () => {
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, keywords: [] }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, enabled: false, keywords: [] }).success, true);
  });

  it('exempt roles at most 20, exempt channels at most 50, no duplicates', () => {
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, exemptRoleIds: ids('2', 20) }).success, true);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, exemptRoleIds: ids('2', 21) }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, exemptChannelIds: ids('3', 50) }).success, true);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, exemptChannelIds: ids('3', 51) }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, exemptRoleIds: [ROLE, ROLE] }).success, false);
  });

  it('timeout 0..2419200 seconds', () => {
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, timeoutSeconds: 2_419_200 }).success, true);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, timeoutSeconds: 2_419_201 }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, timeoutSeconds: -1 }).success, false);
    assert.equal(automodKeywordsSchema.safeParse({ ...keywords, timeoutSeconds: 1.5 }).success, false);
  });

  it('mentions: limit 1..50', () => {
    const mentions = { ...keywords, limit: 50, raidProtection: true };
    delete (mentions as Partial<typeof mentions>).keywords;
    delete (mentions as Partial<typeof mentions>).allowList;
    assert.equal(automodMentionsSchema.safeParse(mentions).success, true);
    assert.equal(automodMentionsSchema.safeParse({ ...mentions, limit: 51 }).success, false);
    assert.equal(automodMentionsSchema.safeParse({ ...mentions, limit: 0 }).success, false);
  });

  it('presets: allow list of 1000, at least one list when enabled, no timeout field', () => {
    const presets = {
      enabled: true,
      profanity: true,
      sexualContent: false,
      slurs: false,
      allowList: Array.from({ length: 1000 }, (_, i) => `w${i}`),
      alertChannelId: CHANNEL,
      exemptRoleIds: [],
      exemptChannelIds: [],
    };
    assert.equal(automodPresetsSchema.safeParse(presets).success, true);
    assert.equal(automodPresetsSchema.safeParse({ ...presets, allowList: [...presets.allowList, 'x'] }).success, false);
    assert.equal(automodPresetsSchema.safeParse({ ...presets, profanity: false }).success, false);
    assert.equal(automodPresetsSchema.safeParse({ ...presets, timeoutSeconds: 60 }).success, false);
  });

  it('bodies are strict: unknown keys are rejected', () => {
    const invites = { enabled: true, alertChannelId: null, timeoutSeconds: 0, exemptRoleIds: [], exemptChannelIds: [] };
    assert.equal(automodInvitesSchema.safeParse(invites).success, true);
    assert.equal(automodInvitesSchema.safeParse({ ...invites, regex: '.*' }).success, false);
    // JSON.parse keeps __proto__ as an own key; the strict schema rejects it like any other unknown key.
    const poisoned: unknown = JSON.parse(JSON.stringify(keywords).replace('{', '{"__proto__":{"x":1},'));
    assert.equal(automodKeywordsSchema.safeParse(poisoned).success, false);
  });
});

describe('replies and published data', () => {
  it('accepts ok and error replies, rejects unknown errors', () => {
    assert.equal(bridgeReplySchema.safeParse({ v: 1, id: ID, ok: true, data: {} }).success, true);
    assert.equal(bridgeReplySchema.safeParse({ v: 1, id: ID, ok: false, error: 'discord_rejected', code: 30035 }).success, true);
    assert.equal(bridgeReplySchema.safeParse({ v: 1, id: ID, ok: false, error: 'boom' }).success, false);
  });

  it('botguilds: snowflake ids and names of 1..100 characters', () => {
    const value = { v: 1, at: Date.now(), guilds: [{ id: GUILD, name: 'Perry HQ', icon: null }] };
    assert.equal(botGuildsSchema.safeParse(value).success, true);
    assert.equal(botGuildsSchema.safeParse({ ...value, guilds: [{ id: GUILD, name: '', icon: null }] }).success, false);
    assert.equal(botGuildsSchema.safeParse({ ...value, v: 2 }).success, false);
  });

  it('guild data: listed channel types only', () => {
    const meta = {
      channels: [{ id: CHANNEL, name: 'general', type: 0, parentId: null, position: 0, botCanPost: true }],
      roles: [{ id: ROLE, name: 'Member', color: 0, position: 1, managed: false, assignable: true }],
      botTopRolePosition: 2,
      botPermissions: { manageRoles: true, manageGuild: false, moderateMembers: true },
    };
    assert.equal(guildMetaSchema.safeParse(meta).success, true);
    const thread = { ...meta, channels: [{ ...meta.channels[0], type: 11 }] };
    assert.equal(guildMetaSchema.safeParse(thread).success, false);
  });

  it('automod.put reply keeps the fields of each rule kind', () => {
    const mentions = {
      id: '500000000000000001',
      enabled: true,
      limit: 7,
      raidProtection: true,
      alertChannelId: null,
      timeoutSeconds: 60,
      exemptRoleIds: [],
      exemptChannelIds: [],
    };
    const parsed = bridgeDataSchemas['automod.put'].parse({ rule: mentions });
    assert.deepEqual(parsed.rule, mentions);
    assert.deepEqual(bridgeDataSchemas['automod.put'].parse({ rule: null }).rule, null);
  });
});
