import { ChannelType, escapeMarkdown, PermissionFlagsBits } from "discord.js";
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import type { Player, Track, UnresolvedTrack } from "lavalink-client";
import type { BotClient } from "../client/bot-client.js";
import type { Messages } from "../i18n/index.js";
import type { Requirements } from "../types/command.js";
import { countHumans } from "./lifecycle.js";
import { getRequester } from "./requester.js";

export interface GuardInput {
  interaction:
    | ChatInputCommandInteraction<"cached">
    | ButtonInteraction<"cached">
    | StringSelectMenuInteraction<"cached">;
  client: BotClient;
  requirements: Requirements;
  /** Messages of the guild's language, used for every failure message. */
  t: Messages;
}

export type GuardResult =
  | { ok: true; player?: Player }
  | { ok: false; message: string };

/** True when at least one requirement flag is set. */
export function hasRequirements(
  requirements: Requirements | undefined,
): requirements is Requirements {
  return (
    requirements !== undefined && Object.values(requirements).some(Boolean)
  );
}

const fail = (message: string): GuardResult => ({ ok: false, message });

const JOIN_PERMISSIONS = [
  { flag: PermissionFlagsBits.ViewChannel, key: "ViewChannel" },
  { flag: PermissionFlagsBits.Connect, key: "Connect" },
  { flag: PermissionFlagsBits.Speak, key: "Speak" },
] as const;

/**
 * The track a requester-bypass applies to. Defaults to the current track; `/remove` targets the queue slot
 * given by `position`, and `/skip to:N` (N > 1) also drops other people's tracks so no bypass applies.
 */
function affectedTrack(
  interaction: GuardInput["interaction"],
  player: Player,
): Track | UnresolvedTrack | null {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "remove") {
      const position = interaction.options.getInteger("position");
      return position !== null
        ? (player.queue.tracks[position - 1] ?? null)
        : null;
    }
    if (interaction.commandName === "skip") {
      const to = interaction.options.getInteger("to");
      if (to !== null && to > 1) return null;
    }
  }
  return player.queue.current;
}

/**
 * Shared requirement runner for slash commands, buttons and select menus. Order:
 * voice -> same channel (idleJoin exception) -> bot permissions when joining -> player/playing -> DJ (D13/D21).
 */
export async function runGuards(input: GuardInput): Promise<GuardResult> {
  const { interaction, client, requirements: req, t } = input;
  if (!hasRequirements(req)) return { ok: true };
  const service = client.music;
  const { guild, member } = interaction;
  const player = service.getPlayer(guild.id);

  if (req.needsVoice) {
    const channel = member.voice.channel;
    if (!channel) return fail(t.errors.notInVoice);
    if (channel.type === ChannelType.GuildStageVoice)
      return fail(t.errors.stageUnsupported);

    if (player?.voiceChannelId && player.voiceChannelId !== channel.id) {
      const idle = !player.queue.current && player.queue.tracks.length === 0;
      if (!(req.idleJoin && idle)) {
        const botChannel = guild.channels.cache.get(player.voiceChannelId);
        return fail(
          t.errors.differentChannel(escapeMarkdown(botChannel?.name ?? "?")),
        );
      }
    }

    // Permissions only matter when the bot has to join this channel (new player or idle move).
    if (!player || player.voiceChannelId !== channel.id) {
      const me = guild.members.me ?? (await guild.members.fetchMe());
      const permissions = channel.permissionsFor(me);
      const missing = JOIN_PERMISSIONS.filter(
        ({ flag }) => !permissions?.has(flag),
      ).map(({ key }) => t.permissions[key]);
      if (missing.length > 0)
        return fail(
          t.errors.missingPerms(escapeMarkdown(channel.name), missing),
        );
      if (channel.full && !permissions?.has(PermissionFlagsBits.MoveMembers))
        return fail(t.errors.channelFull);
    }
  }

  if ((req.needsPlayer || req.needsPlaying) && !player)
    return fail(t.errors.noPlayer);
  if (req.needsPlaying && !player?.queue.current)
    return fail(t.errors.nothingPlaying);

  // Also without a player (e.g. /autoplay only edits settings); the bypasses below need one.
  if (req.djOnly) {
    const settings = await client.settings.get(guild.id);
    // A deleted DJ role must not lock everyone out: treat it as unset (only trusted when the cache is populated).
    let djRoleId = settings.djRoleId;
    if (
      djRoleId &&
      guild.roles.cache.size > 0 &&
      !guild.roles.cache.has(djRoleId)
    ) {
      djRoleId = null;
      client.settings.update(guild.id, { djRoleId: null }).catch(() => {
        client.logger.warn(
          { guildId: guild.id },
          "Could not clear the deleted DJ role",
        );
      });
    }
    if (djRoleId) {
      const privileged =
        member.roles.cache.has(djRoleId) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild);
      if (!privileged) {
        const botChannelId = player?.voiceChannelId ?? null;
        const soleListener =
          player !== undefined &&
          botChannelId !== null &&
          member.voice.channelId === botChannelId &&
          countHumans(guild, botChannelId, client.user?.id ?? "") === 1;
        const isRequester =
          player !== undefined &&
          req.requesterBypass === true &&
          getRequester(affectedTrack(interaction, player))?.id === member.id;
        if (!soleListener && !isRequester) return fail(t.errors.djRequired);
      }
    }
  }

  return player ? { ok: true, player } : { ok: true };
}
