import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand, describe } from "../builder.js";
import { announce, failControl, requirePlayer, titleOf } from "./shared.js";

export const skip: Command = {
  data: createCommand("skip", (m) => m.commands.skip.description).addIntegerOption(
    (option) =>
      describe(option.setName("to"), (m) => m.commands.skip.to)
        .setMinValue(1),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.trackControl,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const to = interaction.options.getInteger("to") ?? undefined;
    const result = await controls.skip(client.music, player, to);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    if (result.to !== null && result.to > 1) {
      await announce(interaction, t.music.skippedTo(result.to, titleOf(result.next)));
      return;
    }
    await announce(interaction, t.music.skipped(titleOf(result.skipped ?? result.next)));
  },
};
