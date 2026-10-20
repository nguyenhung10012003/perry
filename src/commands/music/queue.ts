import { t } from "../../i18n/index.js";
import { buildQueuePage } from "../../music/queue-view.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { paginate } from "../../utils/pagination.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { requirePlayer } from "./shared.js";

export const queue: Command = {
  data: createCommand("queue", t.commands.queue.description).addIntegerOption(
    (option) =>
      option
        .setName("page")
        .setDescription(t.commands.queue.page)
        .setMinValue(1),
  ),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.view,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    if (!player.queue.current && player.queue.tracks.length === 0) {
      await replyError(interaction, t.errors.nothingPlaying);
      return;
    }
    const startPage = interaction.options.getInteger("page") ?? 1;
    await paginate(interaction, (page) => buildQueuePage(player, page), {
      startPage,
      ephemeral: false,
    });
  },
};
