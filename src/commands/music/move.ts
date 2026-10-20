import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer, titleOf } from "./shared.js";

export const move: Command = {
  data: createCommand("move", t.commands.move.description)
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription(t.commands.move.from)
        .setRequired(true)
        .setMinValue(1),
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription(t.commands.move.to)
        .setRequired(true)
        .setMinValue(1),
    ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);
    const result = await controls.move(client.music, player, from, to);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.moved(titleOf(result.track), result.to));
  },
};
