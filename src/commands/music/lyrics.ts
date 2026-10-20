import { fetchLyrics } from "../../music/lyrics.js";
import { truncate } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { baseEmbed } from "../../utils/embeds.js";
import { paginate } from "../../utils/pagination.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { requirePlayer } from "./shared.js";

const EMBED_TITLE_MAX = 256;

export const lyrics: Command = {
  data: createCommand("lyrics", (m) => m.commands.lyrics.description),
  category: "music",
  cooldownSeconds: 10,
  requirements: REQ.nowPlaying,
  async execute({ interaction, client, t }) {
    // The lookup goes through Lavalink and external lyrics services, so it can be slow.
    await interaction.deferReply();
    const player = requirePlayer(client, interaction.guildId);
    const track = player.queue.current;
    if (!track) {
      await replyError(interaction, t.errors.nothingPlaying);
      return;
    }
    const outcome = await fetchLyrics(client.music, player);
    switch (outcome.kind) {
      case "unsupported":
        await replyError(interaction, t.lyrics.unsupported);
        return;
      case "notFound":
        await replyError(interaction, t.lyrics.notFound);
        return;
      case "failed":
        await replyError(interaction, t.lyrics.failed);
        return;
      case "ok":
        break;
    }

    const { pages } = outcome;
    const title = truncate(t.lyrics.title(track.info.title), EMBED_TITLE_MAX);
    await paginate(interaction, (requested) => {
      const page = Math.min(Math.max(1, Math.trunc(requested) || 1), pages.length);
      const embed = baseEmbed()
        .setTitle(title)
        .setDescription(pages[page - 1] ?? t.lyrics.notFound)
        .setFooter({ text: t.lyrics.footer(page, pages.length) });
      return { embed, page, totalPages: pages.length };
    }, t);
  },
};
