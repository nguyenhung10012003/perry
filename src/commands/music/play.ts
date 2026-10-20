import { MAX_QUEUE_SIZE } from "../../config/constants.js";
import { t } from "../../i18n/index.js";
import { planAdditions } from "../../music/discovery/queue-add.js";
import { trackLink } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import { autocompleteSearch, loadTracks } from "../../music/search.js";
import type { SearchSource } from "../../music/search.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { announce, loadErrorMessage, respondAutocomplete } from "./shared.js";

const SOURCES = ["youtube", "youtubemusic", "soundcloud"] as const;

function isSearchSource(value: string | null): value is SearchSource {
  return value !== null && (SOURCES as readonly string[]).includes(value);
}

export const play: Command = {
  data: createCommand("play", t.commands.play.description)
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription(t.commands.play.query)
        .setRequired(true)
        .setAutocomplete(true)
        .setMaxLength(500),
    )
    .addStringOption((option) =>
      option
        .setName("source")
        .setDescription(t.commands.play.source)
        .addChoices(
          ...SOURCES.map((source) => ({
            name: t.commands.play.sources[source],
            value: source,
          })),
        ),
    )
    .addBooleanOption((option) =>
      option.setName("next").setDescription(t.commands.play.next),
    ),
  category: "music",
  cooldownSeconds: 3,
  requirements: REQ.play,
  async execute({ interaction, client }) {
    await interaction.deferReply();
    const music = client.music;
    music.ensureReady();

    const query = interaction.options.getString("query", true);
    const sourceOption = interaction.options.getString("source");
    const source = isSearchSource(sourceOption) ? sourceOption : undefined;
    const playNext = interaction.options.getBoolean("next") ?? false;

    const outcome = await loadTracks(music, query, source, {
      id: interaction.user.id,
      username: interaction.user.username,
    });
    if (outcome.kind !== "ok") {
      await replyError(interaction, loadErrorMessage(outcome));
      return;
    }

    // A search result list only queues its best match; tracks and playlists queue everything.
    const loaded =
      outcome.loadType === "search"
        ? outcome.tracks.slice(0, 1)
        : outcome.tracks;

    // Single tracks and the best search hit are never de-duplicated (the user asked for that song);
    // playlists and Mixes skip tracks already queued and repeats inside the list.
    const existing = music.getPlayer(interaction.guildId);
    const plan = planAdditions(existing, loaded, {
      dedupe: outcome.loadType === "playlist",
    });
    const tracks = plan.toAdd;
    const trimmed = plan.trimmedByQueueCap;
    if (tracks.length === 0) {
      await replyError(
        interaction,
        trimmed === 0 && plan.duplicates > 0
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

    // A new request re-arms autoplay after it paused itself for lack of suggestions.
    const state = music.getState(interaction.guildId);
    if (state) {
      state.autoplayPaused = false;
      state.discoveryNoticeSent = false;
    }

    const startsNow =
      !player.queue.current && !player.playing && !player.paused;
    const position = player.queue.tracks.length + 1;
    await player.queue.add(tracks, playNext ? 0 : undefined);
    music.cancelIdleTimer(interaction.guildId);
    if (startsNow) await player.play();

    const lines: string[] = [];
    const first = tracks[0];
    if (outcome.playlist) {
      const name = outcome.playlist.name;
      lines.push(
        t.music.playlistAdded(
          trackLink(name, outcome.playlist.uri, 80),
          tracks.length,
          outcome.droppedCount,
          plan.duplicates,
        ),
      );
      // Only claim "starts from the selected video" when that video was really queued first.
      if (
        outcome.rotated &&
        first &&
        first.encoded === outcome.tracks[0]?.encoded
      ) {
        lines.push(
          t.music.playlistStartsFrom(trackLink(first.info.title, first.info.uri, 80)),
        );
      }
    } else if (first) {
      const title = trackLink(first.info.title, first.info.uri, 80);
      if (startsNow) lines.push(t.music.playingNow(title));
      else if (playNext) lines.push(t.music.addedNext(title));
      else lines.push(t.music.added(title, position));
    }
    if (trimmed > 0) lines.push(t.music.queueTrimmed(tracks.length, trimmed));
    await announce(interaction, lines.join("\n"));
  },
  async autocomplete({ interaction, client }) {
    const sourceOption = interaction.options.getString("source");
    const choices = await autocompleteSearch(
      client.music,
      interaction.user.id,
      interaction.options.getFocused(),
      isSearchSource(sourceOption) ? sourceOption : undefined,
    );
    await respondAutocomplete(interaction, choices);
  },
};
