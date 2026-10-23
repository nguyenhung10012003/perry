import type { GuildSettings } from '../settings/guild-settings.js';

/** What the XP rules need to know about a message (built from discord.js objects by toXpFacts). */
export interface XpMessageFacts {
  inGuild: boolean;
  authorIsBot: boolean;
  isWebhook: boolean;
  isSystem: boolean;
  /** The channel id, the thread's parent id when the channel is a thread, and the category id. */
  channelIds: readonly string[];
  /** The member's role ids (from the member object that comes with MESSAGE_CREATE). */
  roleIds: readonly string[];
}

/**
 * Pure: true when the message may earn XP (A10, A11). False for DMs, bots, webhooks, system messages, a guild with
 * leveling off, and when the channel, its thread parent, its category or one of the member's roles is ignored.
 */
export function isXpEligible(
  m: XpMessageFacts,
  s: Pick<GuildSettings, 'levelingEnabled' | 'xpIgnoredChannelIds' | 'xpIgnoredRoleIds'>,
): boolean {
  if (!m.inGuild || m.authorIsBot || m.isWebhook || m.isSystem || !s.levelingEnabled) return false;
  if (m.channelIds.some((id) => s.xpIgnoredChannelIds.includes(id))) return false;
  return !m.roleIds.some((id) => s.xpIgnoredRoleIds.includes(id));
}
