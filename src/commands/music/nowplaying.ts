import { buildNowPlaying } from "../../music/now-playing.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { requirePlayer } from "./shared.js";

export const nowplaying: Command = {
  data: createCommand("nowplaying", (m) => m.commands.nowplaying.description),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.nowPlaying,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const payload = buildNowPlaying(player, t, client.music.getState(interaction.guildId));
    if (!payload) {
      await replyError(interaction, t.errors.nothingPlaying);
      return;
    }
    // A fresh snapshot with a live progress bar; the control buttons stay on the Now-Playing message.
    await interaction.reply({
      embeds: payload.embeds,
      allowedMentions: payload.allowedMentions,
    });
  },
};
