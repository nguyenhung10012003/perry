import { DiscordAPIError, MessageFlags } from 'discord.js';
import type { Guild, GuildMember, User } from 'discord.js';
import { fetchMe, parseUserId, targetCheckInput } from '../commands/moderation/shared.js';
import type { Messages } from '../i18n/index.js';
import { truncate } from '../music/format.js';
import type { ModCase, NewCase } from '../storage/types.js';
import type { CommandContext } from '../types/command.js';
import { infoEmbed } from '../utils/embeds.js';
import { safeError } from '../utils/errors.js';
import { replyError, replyInfo } from '../utils/respond.js';
import { formatDuration, parseDuration } from './duration.js';
import { buildCaseEmbed, DM_ACTIONS, displayTag, postModLog } from './mod-log.js';
import { invokerHas, missingGuildPermissions } from './permissions.js';
import type { PermissionKey } from './permissions.js';
import type { ModAction, TargetCheckFailure } from './target-check.js';
import { checkModerationTarget } from './target-check.js';

/** Discord's limit for the X-Audit-Log-Reason header. */
const AUDIT_REASON_MAX = 512;

/** Discord error codes mapped to a localized reply; every other error is rethrown (generic reply, error log). */
const DISCORD_ERRORS: ReadonlyMap<number, TargetCheckFailure | 'unknownUser' | 'notBanned'> = new Map([
  // Missing Permissions: a role moved between the check and the call.
  [50_013, 'botNotHigher'],
  [10_007, 'notMember'],
  [10_013, 'unknownUser'],
  [10_026, 'notBanned'],
] as const);

export type ModActionTarget =
  /** A user picked with a user option; member is null when they are not in the server. */
  | { kind: 'user'; user: User; member: GuildMember | null }
  /** /unban: the raw text option (id or mention, A7). */
  | { kind: 'id'; raw: string };

export interface ModActionSpec {
  action: ModAction;
  /** Runtime invoker permission (M2); the bot needs the same guild permission when botNeedsPermission is set. */
  permission: Extract<PermissionKey, 'BanMembers' | 'KickMembers' | 'ModerateMembers'>;
  botNeedsPermission: boolean;
  target: ModActionTarget;
  /** Already trimmed and cut to MOD_REASON_MAX_LENGTH (readReason). */
  reason: string | null;
  /** /timeout set: the raw duration text. */
  duration?: string;
  /** /ban: seconds of message history to delete. */
  deleteMessageSeconds?: number;
}

function discordCode(err: unknown): number | undefined {
  return err instanceof DiscordAPIError && typeof err.code === 'number' ? err.code : undefined;
}

/** REST pre-check of /ban (A9): a found ban means already banned, 10026 Unknown Ban means not banned. */
async function isBanned(guild: Guild, userId: string): Promise<boolean> {
  try {
    await guild.bans.fetch({ user: userId, force: true });
    return true;
  } catch (err) {
    if (discordCode(err) === 10_026) return false;
    throw err;
  }
}

function successLine(t: Messages, action: ModAction, user: string, durationMs: number | null, n: number | null): string {
  switch (action) {
    case 'ban':
      return t.moderation.banned(user, n);
    case 'unban':
      return t.moderation.unbanned(user, n);
    case 'kick':
      return t.moderation.kicked(user, n);
    case 'timeout':
      return t.moderation.timedOut(user, formatDuration(durationMs ?? 0), n);
    case 'untimeout':
      return t.moderation.timeoutRemoved(user, n);
    case 'warn':
      return t.moderation.warned(user, n);
  }
}

function dmText(t: Messages, action: ModAction, guildName: string, durationMs: number | null): string {
  switch (action) {
    case 'ban':
      return t.moderation.dmBan(guildName);
    case 'kick':
      return t.moderation.dmKick(guildName);
    case 'timeout':
      return t.moderation.dmTimeout(guildName, formatDuration(durationMs ?? 0));
    default:
      return t.moderation.dmWarn(guildName);
  }
}

/**
 * The moderation pipeline shared by ban, unban, kick, timeout set/remove and warn (design 4.6.2):
 * 1 invoker permission, 2 bot permission, 3 target check, 4 local pre-checks (steps 1-4 answer within Discord's 3 s),
 * 5 ephemeral defer and REST pre-checks, 6 warn: case first, 7 DM (before a ban or kick, after a timeout or warning),
 * 8 the Discord call, 9 the case, 10 the mod log, 11 the reply with its notes.
 */
export async function runModAction(ctx: CommandContext, spec: ModActionSpec): Promise<void> {
  const { interaction, client, t } = ctx;
  const { guild } = interaction;
  const { action } = spec;

  // 1. Invoker permission.
  if (!invokerHas(interaction, spec.permission)) {
    await replyError(interaction, t.moderation.invokerMissing(t.permissions[spec.permission]));
    return;
  }

  // 2. Bot guild permission.
  const me = await fetchMe(guild);
  if (spec.botNeedsPermission) {
    const missing = missingGuildPermissions(me, [spec.permission]);
    if (missing.length > 0) {
      await replyError(interaction, t.moderation.botMissing(missing.map((key) => t.permissions[key])));
      return;
    }
  }

  // 3. Target check (an unban target is parsed from text first: there is nothing to check without an id).
  let user: User | null = null;
  let member: GuildMember | null = null;
  let targetId: string;
  if (spec.target.kind === 'id') {
    const parsed = parseUserId(spec.target.raw);
    if (parsed === null) {
      await replyError(interaction, t.moderation.invalidUser);
      return;
    }
    targetId = parsed;
  } else {
    ({ user, member } = spec.target);
    targetId = user.id;
  }
  const check = checkModerationTarget(targetCheckInput(action, interaction.member, targetId, member, me, guild.ownerId));
  if (!check.ok) {
    await replyError(interaction, t.moderation[check.reason]);
    return;
  }

  // 4. Local pre-checks.
  if (action === 'untimeout' && !member?.isCommunicationDisabled()) {
    await replyError(interaction, t.moderation.notTimedOut);
    return;
  }
  let durationMs: number | null = null;
  if (action === 'timeout') {
    const parsed = parseDuration(spec.duration ?? '');
    if (!parsed.ok) {
      await replyError(interaction, t.moderation[parsed.reason]);
      return;
    }
    durationMs = parsed.ms;
  }

  // 5. Defer, then REST pre-checks. Errors from here on edit the deferred ephemeral reply (replyError).
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === 'ban' && (await isBanned(guild, targetId))) {
    await replyError(interaction, t.moderation.alreadyBanned);
    return;
  }
  if (user === null) {
    try {
      user = await client.users.fetch(targetId);
    } catch (err) {
      if (discordCode(err) !== 10_013) throw err;
      await replyError(interaction, t.moderation.unknownUser);
      return;
    }
  }
  const target = user;

  const { cases } = client.storage;
  const settings = await client.settings.get(guild.id);
  const moderatorTag = interaction.user.tag;
  const draft: NewCase = {
    guildId: guild.id,
    action,
    targetId,
    targetTag: target.tag,
    moderatorId: interaction.user.id,
    moderatorTag,
    reason: spec.reason,
    durationSeconds: durationMs === null ? null : durationMs / 1000,
    dmSent: false,
  };

  // 6. A warning is only a record: without storage there is nothing to do.
  let recorded: ModCase | null = null;
  if (action === 'warn') {
    const created = await cases.create(draft);
    if (!created.ok) {
      await replyError(interaction, t.moderation.storageUnavailable);
      return;
    }
    recorded = created.value;
  }

  // 7. DM, in the guild language. A failed DM never blocks the action.
  const wantsDm = DM_ACTIONS.has(action) && settings.modDmTarget;
  let dm: 'sent' | 'failed' | 'off' | undefined = DM_ACTIONS.has(action) && !wantsDm ? 'off' : undefined;
  const sendDm = async (): Promise<'sent' | 'failed'> => {
    const lines = [dmText(t, action, displayTag(guild.name), durationMs)];
    if (spec.reason) lines.push(t.moderation.dmReason(spec.reason));
    try {
      await target.send({ embeds: [infoEmbed(lines.join('\n'))] });
      return 'sent';
    } catch (err) {
      // Usually 50007: the user does not accept DMs from this server.
      client.logger.debug({ err: safeError(err), guildId: guild.id }, 'Could not DM the moderation target');
      return 'failed';
    }
  };
  // Before a ban or kick: afterwards the bot may share no server with the user (A2).
  if (wantsDm && (action === 'ban' || action === 'kick')) dm = await sendDm();

  // 8. The Discord call. Kick and timeouts always have a member here (the target check refuses non-members).
  const requireMember = (): GuildMember => {
    if (member === null) throw new Error(`No target member for ${action}`);
    return member;
  };
  const auditReason = truncate(`${moderatorTag}: ${spec.reason ?? '-'}`, AUDIT_REASON_MAX);
  try {
    switch (action) {
      case 'ban':
        await guild.bans.create(targetId, { reason: auditReason, deleteMessageSeconds: spec.deleteMessageSeconds ?? 0 });
        break;
      case 'unban':
        await guild.bans.remove(targetId, auditReason);
        break;
      case 'kick':
        await requireMember().kick(auditReason);
        break;
      case 'timeout':
        await requireMember().timeout(durationMs, auditReason);
        break;
      case 'untimeout':
        await requireMember().timeout(null, auditReason);
        break;
      case 'warn':
        break;
    }
  } catch (err) {
    const code = discordCode(err);
    const failure = code === undefined ? undefined : DISCORD_ERRORS.get(code);
    if (failure === undefined) throw err;
    if (code === 50_013) {
      client.logger.warn({ code, guildId: guild.id, action }, 'Discord refused a moderation action (missing permission)');
    }
    const lines = [t.moderation[failure]];
    if (dm === 'sent') lines.push(t.moderation.dmAlreadySent);
    await replyError(interaction, lines.join('\n'));
    return;
  }
  if (wantsDm && (action === 'timeout' || action === 'warn')) dm = await sendDm();
  const dmSent = dm === 'sent';

  // 9. The case (a warning already has one, created before its DM). The action is done, so a failure only adds a note.
  if (recorded === null) {
    const created = await cases.create({ ...draft, dmSent });
    if (created.ok) recorded = created.value;
  } else if (dmSent) {
    await cases.setDmSent(guild.id, recorded.caseNumber, true);
    recorded = { ...recorded, dmSent };
  }

  // 10. Mod log: the case embed, or the same data marked as not recorded.
  const embed = buildCaseEmbed(t, recorded ?? { ...draft, dmSent, caseNumber: null, createdAt: new Date() }, dm ? { dm } : {});
  const logged = await postModLog(client, guild.id, embed);
  if (logged && recorded) await cases.setLogMessage(guild.id, recorded.caseNumber, logged.channelId, logged.messageId);

  // 11. Reply.
  const lines = [successLine(t, action, displayTag(target.tag), durationMs, recorded?.caseNumber ?? null)];
  if (dm === 'failed') lines.push(t.moderation.dmFailed);
  if (recorded === null) lines.push(t.moderation.caseNotRecorded);
  await replyInfo(interaction, lines.join('\n'));
}
