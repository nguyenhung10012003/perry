import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
} from "discord.js";
import {
  DISCOVERY_TIMEOUT_MS,
  MAX_QUEUE_SIZE,
  SIMILAR_MAX_TRACKS,
} from "../../config/constants.js";
import type { Track } from "lavalink-client";
import { planAdditions } from "../../music/discovery/queue-add.js";
import type { DiscoveryContext } from "../../music/discovery/types.js";
import { formatDuration, trackLink, truncate } from "../../music/format.js";
import { runGuards } from "../../music/guards.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { baseEmbed, errorEmbed } from "../../utils/embeds.js";
import { safeError, UserError } from "../../utils/errors.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { requirePlayer } from "./shared.js";

const SIMILAR_PREFIX = "sim:";
const SELECT_ID = `${SIMILAR_PREFIX}select`;
const ADD_ALL_ID = `${SIMILAR_PREFIX}all`;
/** Same timings as the paginator (src/utils/pagination.ts). */
const IDLE_MS = 120_000;
/** Interaction tokens stay valid for 15 minutes; stop a little earlier so the final edit still works. */
const MAX_MS = 14 * 60_000;
const MAX_LISTED = 10;
/** Discord allows at most 25 options in a select menu. */
const MAX_OPTIONS = 25;
const NO_MENTIONS = { parse: [] as never[] };

/** A suggestion keeps its position in the original list; the select menu uses it as option value. */
interface Suggestion {
  index: number;
  track: Track;
}

export const similar: Command = {
  data: createCommand("similar", (m) => m.commands.similar.description),
  category: "music",
  cooldownSeconds: 10,
  requirements: REQ.similar,
  async execute({ interaction, client, t }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const music = client.music;
    music.ensureReady();
    const guildId = interaction.guildId;
    const current = requirePlayer(client, guildId).queue.current;
    if (!current) {
      await replyError(interaction, t.errors.nothingPlaying);
      return;
    }
    if (!(await music.autoplay.allowDiscovery(guildId))) {
      throw new UserError((m) => m.errors.discoveryRateLimited);
    }

    const ctx: DiscoveryContext = {
      service: music,
      guildId,
      requester: { id: interaction.user.id, username: interaction.user.username },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS + 2000),
      logger: music.logger,
    };
    // Only the queue is deduplicated: the user asked for suggestions, not for "never heard before".
    const result = await music.discovery.discover(ctx, current, {
      limit: SIMILAR_MAX_TRACKS,
      ignoreHistory: true,
    });
    if (result.tracks.length === 0) {
      await replyError(interaction, t.similar.none);
      return;
    }

    let remaining: Suggestion[] = result.tracks
      .slice(0, MAX_OPTIONS)
      .map((track, index) => ({ index, track }));
    const total = remaining.length;
    let addedTotal = 0;

    const buildEmbed = () => {
      const lines = remaining
        .slice(0, MAX_LISTED)
        .map(
          ({ index, track }) =>
            `${index + 1}. ${trackLink(track.info.title, track.info.uri, 60)} \`${formatDuration(track.info.duration)}\``,
        );
      if (remaining.length > MAX_LISTED) {
        lines.push(t.similar.more(remaining.length - MAX_LISTED));
      }
      const footer =
        addedTotal === 0
          ? t.similar.footer(total)
          : remaining.length > 0
            ? t.similar.footerAdded(addedTotal, remaining.length)
            : t.similar.footerDone(addedTotal);
      return baseEmbed()
        .setTitle(truncate(t.similar.title(current.info.title), 256))
        .setDescription(lines.join("\n") || "-")
        .setFooter({ text: footer });
    };

    const buildComponents = (disabled: boolean) => {
      if (remaining.length === 0) return [];
      const menu = new StringSelectMenuBuilder()
        .setCustomId(SELECT_ID)
        .setPlaceholder(t.similar.placeholder)
        .setMinValues(1)
        .setMaxValues(Math.min(remaining.length, MAX_OPTIONS))
        .setDisabled(disabled)
        .addOptions(
          remaining.slice(0, MAX_OPTIONS).map(({ index, track }) => ({
            label: truncate(`${index + 1}. ${track.info.title}`, 100),
            description: truncate(
              `${track.info.author} • ${formatDuration(track.info.duration)}`,
              100,
            ),
            value: String(index),
          })),
        );
      const addAll = new ButtonBuilder()
        .setCustomId(ADD_ALL_ID)
        .setLabel(t.similar.addAll)
        .setEmoji("➕")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled);
      return [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        new ActionRowBuilder<ButtonBuilder>().addComponents(addAll),
      ];
    };

    await interaction.editReply({
      embeds: [buildEmbed()],
      components: buildComponents(false),
      allowedMentions: NO_MENTIONS,
    });

    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({
      idle: IDLE_MS,
      time: MAX_MS,
      filter: (component) => component.customId.startsWith(SIMILAR_PREFIX),
    });
    // Clicks are handled one after another so two quick clicks cannot add the same tracks twice.
    let chain: Promise<void> = Promise.resolve();

    collector.on("collect", (component) => {
      chain = chain.then(async () => {
        try {
          if (component.user.id !== interaction.user.id) {
            await component.reply({
              content: t.errors.ownerOnly,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }
          if (!component.inCachedGuild()) return;
          if (!component.isButton() && !component.isStringSelectMenu()) return;
          await component.deferUpdate();

          const fail = (text: string): Promise<unknown> =>
            component.followUp({
              embeds: [errorEmbed(text)],
              flags: MessageFlags.Ephemeral,
              allowedMentions: NO_MENTIONS,
            });

          const guard = await runGuards({
            interaction: component,
            client,
            requirements: REQ.play,
            t,
          });
          if (!guard.ok) {
            await fail(guard.message);
            return;
          }

          let picked: Suggestion[];
          if (component.isStringSelectMenu()) {
            const wanted = new Set(component.values.map(Number));
            picked = remaining.filter((entry) => wanted.has(entry.index));
          } else {
            picked = [...remaining];
          }
          if (picked.length === 0) return;

          const voiceChannel = component.member.voice.channel;
          if (!voiceChannel) {
            await fail(t.errors.notInVoice);
            return;
          }
          const player = await music.getOrCreatePlayer({
            guild: component.guild,
            voiceChannelId: voiceChannel.id,
            textChannelId: interaction.channelId,
          });
          const plan = planAdditions(
            player,
            picked.map((entry) => entry.track),
            { dedupe: true },
          );
          if (plan.toAdd.length === 0) {
            await fail(
              plan.trimmedByQueueCap === 0 && plan.duplicates > 0
                ? t.errors.allDuplicates
                : t.errors.queueFull(MAX_QUEUE_SIZE),
            );
            return;
          }

          const startsNow =
            !player.queue.current && !player.playing && !player.paused;
          await player.queue.add(plan.toAdd);
          music.cancelIdleTimer(guildId);
          if (startsNow) await player.play();

          const added = new Set<Track>(plan.toAdd);
          remaining = remaining.filter((entry) => !added.has(entry.track));
          addedTotal += plan.toAdd.length;
          await component.editReply({
            embeds: [buildEmbed()],
            components: buildComponents(false),
            allowedMentions: NO_MENTIONS,
          });
        } catch (err) {
          if (!(err instanceof UserError)) {
            client.logger.warn({ err: safeError(err) }, "Similar menu action failed");
          }
          // The click was acknowledged already; tell the user privately (best effort).
          await component
            .followUp({
              embeds: [
                errorEmbed(err instanceof UserError ? err.localized(t) : t.errors.generic),
              ],
              flags: MessageFlags.Ephemeral,
              allowedMentions: NO_MENTIONS,
            })
            .catch(() => undefined);
        }
      });
    });

    collector.on("end", () => {
      interaction
        .editReply({ components: buildComponents(true) })
        .catch(() => undefined);
    });
  },
};
