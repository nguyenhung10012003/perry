import { PermissionFlagsBits } from 'discord.js';
import type { GuildMember, Message } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import { XP_COOLDOWN_SECONDS } from '../config/constants.js';
import { getMessages, resolveLocale } from '../i18n/index.js';
import { Cooldowns } from '../interactions/cooldowns.js';
import type { GuildSettings } from '../settings/guild-settings.js';
import { postableTextChannel } from '../utils/channels.js';
import { baseEmbed } from '../utils/embeds.js';
import { safeError } from '../utils/errors.js';
import type { XpMessageFacts } from './eligibility.js';
import { isXpEligible } from './eligibility.js';
import { rewardDiff } from './rewards.js';
import { rollXp } from './xp.js';

const REWARD_REASON = 'Level reward';
const NO_MENTIONS = { parse: [] as never[] };

/**
 * Adapter from a discord.js message to the pure eligibility facts: the channel id, the thread parent id and the
 * category id, and the member's role ids. Null when the message has no member (DMs, webhooks).
 */
export function toXpFacts(message: Message): XpMessageFacts | null {
  if (!message.inGuild() || message.member === null) return null;
  const { channel } = message;
  const channelIds = [channel.id];
  if (channel.isThread()) {
    if (channel.parentId) channelIds.push(channel.parentId);
    // The category of the thread's parent channel (null when the parent is not cached).
    const categoryId = channel.parent?.parentId;
    if (categoryId) channelIds.push(categoryId);
  } else if (channel.parentId) {
    channelIds.push(channel.parentId);
  }
  return {
    inGuild: true,
    authorIsBot: message.author.bot,
    isWebhook: message.webhookId !== null,
    isSystem: message.system,
    channelIds,
    roleIds: [...message.member.roles.cache.keys()],
  };
}

/** XP per message, level-up announcements and role reward sync (design 4.7.2, 4.7.4, 4.7.5). */
export class LevelingService {
  /** In-process pre-check, so members already on cooldown cost no Redis round trip; Redis stays authoritative. */
  private readonly cooldowns = new Cooldowns();
  /** Warnings already logged at warn level in this process (per guild and role, or per guild). */
  private readonly warned = new Set<string>();

  constructor(private readonly client: BotClient) {}

  /** messageCreate: grants XP to an eligible message, then announces a level-up and syncs rewards in the background. */
  async handleMessage(message: Message): Promise<void> {
    // Cheap early return before any storage call (isXpEligible re-checks both).
    if (!message.inGuild() || message.author.bot) return;
    const { guildId } = message;
    const settings = await this.client.settings.get(guildId);
    const facts = toXpFacts(message);
    const member = message.member;
    if (facts === null || member === null || !isXpEligible(facts, settings)) return;

    const userId = message.author.id;
    const cooldownName = `xp:${guildId}`;
    if (this.cooldowns.check(cooldownName, userId, XP_COOLDOWN_SECONDS) > 0) return;
    if ((await this.client.storage.cooldowns.check(cooldownName, userId, XP_COOLDOWN_SECONDS)) > 0) return;

    const result = await this.client.storage.levels.grant({
      guildId,
      userId,
      amount: rollXp(settings.xpMultiplierPercent),
      username: member.displayName,
      avatar: message.author.avatar,
    });
    // Postgres unavailable: no XP for this message (no queue, A16).
    if (!result.ok || result.value.level <= result.value.previousLevel) return;
    const { level } = result.value;
    this.background(
      (async () => {
        const gained = await this.syncRewards(member, level);
        await this.announce(message, settings, level, gained);
      })(),
      'levelUp',
    );
  }

  /**
   * Gives and removes the reward roles for `level` (DP-3 (c) mode of the guild) and returns the roles added.
   * Rewards whose role is gone, managed or not below the bot's highest role are skipped (warn once per guild and
   * role); without Manage Roles nothing is changed (warn once per guild). Never rejects.
   */
  async syncRewards(member: GuildMember, level: number): Promise<string[]> {
    const { guild } = member;
    try {
      const rewards = await this.client.storage.levels.rewards(guild.id);
      if (!rewards.ok) {
        this.client.logger.debug({ guildId: guild.id }, 'Level rewards unavailable, skipping the reward sync');
        return [];
      }
      if (rewards.value.length === 0) return [];
      const me = guild.members.me ?? (await guild.members.fetchMe());
      if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
        this.warnOnce(guild.id, 'ManageRoles', {}, 'The bot needs Manage Roles to give level rewards');
        return [];
      }
      const usable = rewards.value.filter((reward) => {
        const role = guild.roles.cache.get(reward.roleId);
        const problem = !role
          ? 'The role of a level reward no longer exists'
          : role.managed
            ? 'The role of a level reward is managed by an integration'
            : me.roles.highest.comparePositionTo(role) <= 0
              ? 'The role of a level reward is not below the highest role of the bot'
              : null;
        if (problem !== null) {
          this.warnOnce(guild.id, reward.roleId, { roleId: reward.roleId, level: reward.level }, problem);
        }
        return problem === null;
      });
      const { levelRewardMode } = await this.client.settings.get(guild.id);
      const diff = rewardDiff({
        rewards: usable,
        level,
        mode: levelRewardMode,
        memberRoleIds: new Set(member.roles.cache.keys()),
      });
      // One PUT or DELETE per role. The array forms PATCH the full role list built from the member cache, which a
      // write does not update, so a remove after an add would drop the role just added.
      for (const roleId of diff.add) await member.roles.add(roleId, REWARD_REASON);
      for (const roleId of diff.remove) await member.roles.remove(roleId, REWARD_REASON);
      return diff.add;
    } catch (err) {
      const details = { err: safeError(err), userId: member.id };
      this.warnOnce(guild.id, 'sync', details, 'Could not update the level rewards of a member');
      return [];
    }
  }

  /** Posts the level-up message per the guild's mode (off, current, channel, dm), in the guild language. */
  private async announce(
    message: Message<true>,
    settings: GuildSettings,
    level: number,
    gained: readonly string[],
  ): Promise<void> {
    if (settings.levelUpMode === 'off') return;
    const t = getMessages(resolveLocale(settings.language, this.client.config.defaultLocale));
    const lines = [t.leveling.levelUp(`<@${message.author.id}>`, level)];
    if (gained.length > 0) lines.push(t.leveling.rewardsGained(gained.map((roleId) => `<@&${roleId}>`)));
    const payload = { embeds: [baseEmbed().setDescription(lines.join('\n'))], allowedMentions: NO_MENTIONS };
    if (settings.levelUpMode === 'dm') {
      await message.author.send(payload);
      return;
    }
    // 'channel' falls back to the message's channel when the configured one is not usable.
    const configured =
      settings.levelUpMode === 'channel' ? postableTextChannel(this.client, settings.levelUpChannelId) : null;
    const channel = configured ?? postableTextChannel(this.client, message.channelId);
    if (channel) await channel.send(payload);
  }

  /** Runs a task without awaiting it; failures (channel gone, DM closed, ...) are logged at debug. */
  private background(task: Promise<unknown>, label: string): void {
    task.catch((err: unknown) => {
      this.client.logger.debug({ err: safeError(err), task: label }, 'Background leveling task failed');
    });
  }

  private warnOnce(guildId: string, key: string, details: Record<string, unknown>, message: string): void {
    const id = `${guildId}:${key}`;
    if (this.warned.has(id)) {
      this.client.logger.debug({ ...details, guildId }, message);
      return;
    }
    this.warned.add(id);
    this.client.logger.warn({ ...details, guildId }, message);
  }
}
