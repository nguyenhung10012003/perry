import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  PermissionFlagsBits,
} from 'discord.js';
import type { AutoModerationActionOptions, AutoModerationRule, AutoModerationTriggerMetadataOptions, Guild } from 'discord.js';
import type { AutomodBodies, AutomodKind, AutomodList, AutomodRule, AutomodRules, BridgeActor } from './protocol.js';

/**
 * Discord native AutoMod rules managed from the dashboard (DP-1 (b)). Perry only touches the rules it created: the
 * bot is their creator and their name is one of RULE_NAMES (all start with "Perry: "). Rules made by anyone else are
 * never edited or deleted.
 */

export const PERRY_RULE_PREFIX = 'Perry: ';

export const RULE_NAMES: Record<AutomodKind, string> = {
  keywords: `${PERRY_RULE_PREFIX}banned words`,
  invites: `${PERRY_RULE_PREFIX}invite links`,
  mentions: `${PERRY_RULE_PREFIX}mention spam`,
  presets: `${PERRY_RULE_PREFIX}keyword presets`,
};

const TRIGGERS: Record<AutomodKind, AutoModerationRuleTriggerType> = {
  keywords: AutoModerationRuleTriggerType.Keyword,
  invites: AutoModerationRuleTriggerType.Keyword,
  mentions: AutoModerationRuleTriggerType.MentionSpam,
  presets: AutoModerationRuleTriggerType.KeywordPreset,
};

/** Discord invite links (Rust regex, case-insensitive). */
export const INVITE_REGEX = '(?i)(discord\\.gg|discord(app)?\\.com/invite)/[a-z0-9-]+';

/** Calls for one guild run one after another, so two concurrent PUTs never both create a rule. */
const chains = new Map<string, Promise<void>>();

export function inGuildChain<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(guildId) ?? Promise.resolve();
  const run = previous.then(task);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(guildId, settled);
  void settled.then(() => {
    if (chains.get(guildId) === settled) chains.delete(guildId);
  });
  return run;
}

function kindOf(rule: AutoModerationRule, botId: string): AutomodKind | null {
  if (rule.creatorId !== botId || !rule.name.startsWith(PERRY_RULE_PREFIX)) return null;
  for (const kind of Object.keys(RULE_NAMES) as AutomodKind[]) {
    if (RULE_NAMES[kind] === rule.name && TRIGGERS[kind] === rule.triggerType) return kind;
  }
  return null;
}

function emptyRules(): AutomodRules {
  return { keywords: null, invites: null, mentions: null, presets: null };
}

/** The dashboard view of a Perry rule (rule id plus the fields of its request body). */
function toView(kind: AutomodKind, rule: AutoModerationRule): NonNullable<AutomodRules[AutomodKind]> {
  const alert = rule.actions.find((action) => action.type === AutoModerationActionType.SendAlertMessage);
  const timeout = rule.actions.find((action) => action.type === AutoModerationActionType.Timeout);
  const common = {
    id: rule.id,
    enabled: rule.enabled,
    alertChannelId: alert?.metadata.channelId ?? null,
    exemptRoleIds: [...rule.exemptRoles.keys()],
    exemptChannelIds: [...rule.exemptChannels.keys()],
  };
  const timeoutSeconds = timeout?.metadata.durationSeconds ?? 0;
  const { triggerMetadata: meta } = rule;
  switch (kind) {
    case 'keywords':
      return { ...common, keywords: [...meta.keywordFilter], allowList: [...meta.allowList], timeoutSeconds };
    case 'invites':
      return { ...common, timeoutSeconds };
    case 'mentions':
      return {
        ...common,
        limit: Math.min(Math.max(meta.mentionTotalLimit ?? 1, 1), 50),
        raidProtection: meta.mentionRaidProtectionEnabled,
        timeoutSeconds,
      };
    case 'presets':
      return {
        ...common,
        profanity: meta.presets.includes(AutoModerationRuleKeywordPresetType.Profanity),
        sexualContent: meta.presets.includes(AutoModerationRuleKeywordPresetType.SexualContent),
        slurs: meta.presets.includes(AutoModerationRuleKeywordPresetType.Slurs),
        allowList: [...meta.allowList],
      };
  }
}

function botId(guild: Guild): string {
  return guild.client.user.id;
}

async function perryRules(guild: Guild): Promise<Map<AutomodKind, AutoModerationRule>> {
  const fetched = await guild.autoModerationRules.fetch();
  const found = new Map<AutomodKind, AutoModerationRule>();
  for (const rule of fetched.values()) {
    const kind = kindOf(rule, botId(guild));
    if (kind !== null && !found.has(kind)) found.set(kind, rule);
  }
  return found;
}

/** True when the bot holds Manage Server, which every AutoMod call needs. */
export function automodAvailable(guild: Guild): boolean {
  return guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** The guild's Perry rules. Without Manage Server nothing is fetched and available is false. */
export async function listPerryRules(guild: Guild): Promise<AutomodList> {
  if (!automodAvailable(guild)) return { available: false, rules: emptyRules() };
  const found = await perryRules(guild);
  const rules = emptyRules();
  for (const [kind, rule] of found) Object.assign(rules, { [kind]: toView(kind, rule) });
  return { available: true, rules };
}

function triggerMetadata<K extends AutomodKind>(kind: K, body: AutomodBodies[K]): AutoModerationTriggerMetadataOptions {
  switch (kind) {
    case 'keywords': {
      const rule = body as AutomodBodies['keywords'];
      return { keywordFilter: rule.keywords, allowList: rule.allowList, regexPatterns: [] };
    }
    case 'invites':
      return { regexPatterns: [INVITE_REGEX] };
    case 'mentions': {
      const rule = body as AutomodBodies['mentions'];
      return { mentionTotalLimit: rule.limit, mentionRaidProtectionEnabled: rule.raidProtection };
    }
    default: {
      const rule = body as AutomodBodies['presets'];
      const presets: AutoModerationRuleKeywordPresetType[] = [];
      if (rule.profanity) presets.push(AutoModerationRuleKeywordPresetType.Profanity);
      if (rule.sexualContent) presets.push(AutoModerationRuleKeywordPresetType.SexualContent);
      if (rule.slurs) presets.push(AutoModerationRuleKeywordPresetType.Slurs);
      return { presets, allowList: rule.allowList };
    }
  }
}

/** BLOCK_MESSAGE always; SEND_ALERT_MESSAGE with an alert channel; TIMEOUT (not for presets) when timeoutSeconds > 0. */
function actions<K extends AutomodKind>(kind: K, body: AutomodBodies[K]): AutoModerationActionOptions[] {
  const list: AutoModerationActionOptions[] = [{ type: AutoModerationActionType.BlockMessage }];
  if (body.alertChannelId !== null) {
    list.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: body.alertChannelId } });
  }
  if (kind !== 'presets') {
    const { timeoutSeconds } = body as AutomodBodies['keywords' | 'invites' | 'mentions'];
    if (timeoutSeconds > 0) {
      list.push({ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: timeoutSeconds } });
    }
  }
  return list;
}

export type PutOutcome<K extends AutomodKind> = { dropped: true } | { dropped: false; rule: AutomodRule<K> | null };

/**
 * Creates or edits the guild's Perry rule of this kind (idempotent: a retry edits the same rule). enabled false
 * disables an existing rule and keeps its config; without a rule nothing is created (rule null). The deadline is
 * checked again right before the first Discord call: a request that waited too long behind another one for the
 * same guild is dropped (the web has already answered 503), so it can never change a rule late.
 */
export async function putPerryRule<K extends AutomodKind>(
  guild: Guild,
  kind: K,
  body: AutomodBodies[K],
  actor: BridgeActor,
  deadline: number,
  now: () => number = Date.now,
): Promise<PutOutcome<K>> {
  if (now() > deadline) return { dropped: true };
  const existing = (await perryRules(guild)).get(kind);
  const reason = `Perry dashboard: ${actor.username}`;
  const manager = guild.autoModerationRules;
  if (!body.enabled) {
    if (existing === undefined) return { dropped: false, rule: null };
    const disabled = await manager.edit(existing, { enabled: false, reason });
    return { dropped: false, rule: toView(kind, disabled) as AutomodRule<K> };
  }
  const options = {
    name: RULE_NAMES[kind],
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata: triggerMetadata(kind, body),
    actions: actions(kind, body),
    enabled: true,
    exemptRoles: body.exemptRoleIds,
    exemptChannels: body.exemptChannelIds,
    reason,
  };
  const saved =
    existing === undefined
      ? await manager.create({ ...options, triggerType: TRIGGERS[kind] })
      : await manager.edit(existing, options);
  return { dropped: false, rule: toView(kind, saved) as AutomodRule<K> };
}
