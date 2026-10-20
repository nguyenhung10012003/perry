import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand, describe } from "../builder.js";
import { announce, failControl, requirePlayer, titleOf } from "./shared.js";

export const move: Command = {
  data: createCommand("move", (m) => m.commands.move.description)
    .addIntegerOption((option) =>
      describe(option.setName("from"), (m) => m.commands.move.from)
        .setRequired(true)
        .setMinValue(1),
    )
    .addIntegerOption((option) =>
      describe(option.setName("to"), (m) => m.commands.move.to)
        .setRequired(true)
        .setMinValue(1),
    ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const from = interaction.options.getInteger("from", true);
    const to = interaction.options.getInteger("to", true);
    const result = await controls.move(client.music, player, from, to);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    await announce(interaction, t.music.moved(titleOf(result.track), result.to));
  },
};
