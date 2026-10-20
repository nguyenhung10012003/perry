import {
  DISCOVERY_MIN_RESULTS,
  MAX_QUEUE_SIZE,
} from "../../config/constants.js";
import { planAdditions, trackKey } from "../../music/discovery/queue-add.js";
import { trackLink } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import { autocompleteSearch, loadTracks } from "../../music/search.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand, describe } from "../builder.js";
import { announce, loadErrorMessage, respondAutocomplete } from "./shared.js";


export const radio: Command = {
  data: createCommand("radio", (m) => m.commands.radio.description).addStringOption(
    (option) =>
      describe(option.setName("query"), (m) => m.commands.radio.query)
        .setRequired(true)
        .setAutocomplete(true)
        .setMaxLength(500),
  ),
  category: "music",
  cooldownSeconds: 10,
  requirements: REQ.play,
  async execute({ interaction, client, t }) {
    await interaction.deferReply();
    const music = client.music;
    music.ensureReady();

    const query = interaction.options.getString("query", true);
    const outcome = await loadTracks(music, query, undefined, {
      id: interaction.user.id,
      username: interaction.user.username,
    });
    if (outcome.kind !== "ok") {
      await replyError(interaction, loadErrorMessage(outcome, t));
      return;
    }

    // A playlist or Mix link goes through the same add path as /play (deduplicated); otherwise the best match
    // is the single seed track. Either way the first loaded track anchors the radio.
    const isList = outcome.loadType === "playlist";
    const loaded = isList ? outcome.tracks : outcome.tracks.slice(0, 1);
    const seed = outcome.tracks[0];
    if (!seed) {
      await replyError(interaction, t.errors.noResults);
      return;
    }

    const plan = planAdditions(music.getPlayer(interaction.guildId), loaded, {
      dedupe: isList,
    });
    if (plan.toAdd.length === 0) {
      await replyError(
        interaction,
        plan.trimmedByQueueCap === 0 && plan.duplicates > 0
          ? t.errors.allDuplicates
          : t.errors.queueFull(MAX_QUEUE_SIZE),
      );
      return;
    }

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await replyError(interaction, t.errors.notInVoice);
      return;
    }
    const player = await music.getOrCreatePlayer({
      guild: interaction.guild,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
    });

    const state = music.getOrCreateState(interaction.guildId);
    state.radio = {
      seedKey: trackKey(seed),
      seedTitle: seed.info.title,
      seed,
    };
    state.autoplayPaused = false;
    state.discoveryNoticeSent = false;

    const startsNow =
      !player.queue.current && !player.playing && !player.paused;
    await player.queue.add(plan.toAdd);
    music.cancelIdleTimer(interaction.guildId);
    if (startsNow) await player.play();

    // Not enough upcoming tracks yet: fill right away instead of waiting for the queue to run dry.
    let filled = 0;
    let rateLimited = false;
    let nothingFound = false;
    if (player.queue.tracks.length < DISCOVERY_MIN_RESULTS) {
      const result = await music.autoplay.fill(player, seed, "radio");
      if (result.kind === "added") filled = result.count;
      else if (result.kind === "rateLimited") rateLimited = true;
      else if (result.kind === "empty") nothingFound = true;
    }

    const lines = [
      t.radio.started(
        trackLink(seed.info.title, seed.info.uri, 80),
        plan.toAdd.length + filled,
      ),
    ];
    if (plan.duplicates > 0 || outcome.droppedCount > 0) {
      lines.push(t.radio.skipped(plan.duplicates, outcome.droppedCount));
    }
    if (plan.trimmedByQueueCap > 0) {
      lines.push(t.music.queueTrimmed(plan.toAdd.length, plan.trimmedByQueueCap));
    }
    // The radio itself is running; these only explain why the immediate fill added nothing.
    if (rateLimited) lines.push(t.errors.discoveryRateLimited);
    if (nothingFound) lines.push(t.radio.noRelated);
    await announce(interaction, lines.join("\n"));
  },
  async autocomplete({ interaction, client }) {
    const choices = await autocompleteSearch(
      client.music,
      interaction.user.id,
      interaction.options.getFocused(),
    );
    await respondAutocomplete(interaction, choices);
  },
};
