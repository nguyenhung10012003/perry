import { buildQueuePage } from "../../music/queue-view.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { paginate } from "../../utils/pagination.js";
import { replyError } from "../../utils/respond.js";
import { createCommand, describe } from "../builder.js";
import { requirePlayer } from "./shared.js";

export const queue: Command = {
  data: createCommand("queue", (m) => m.commands.queue.description).addIntegerOption(
    (option) =>
      describe(option.setName("page"), (m) => m.commands.queue.page)
        .setMinValue(1),
  ),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.view,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    if (!player.queue.current && player.queue.tracks.length === 0) {
      await replyError(interaction, t.errors.nothingPlaying);
      return;
    }
    const startPage = interaction.options.getInteger("page") ?? 1;
    await paginate(interaction, (page) => buildQueuePage(player, page, t), t, {
      startPage,
      ephemeral: false,
    });
  },
};
