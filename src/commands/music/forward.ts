import { SEEK_STEP_DEFAULT } from "../../config/constants.js";
import * as controls from "../../music/controls.js";
import { formatDuration } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand, describe } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const forward: Command = {
  data: createCommand("forward", (m) => m.commands.forward.description).addIntegerOption(
    (option) =>
      describe(option.setName("seconds"), (m) => m.commands.forward.seconds)
        .setMinValue(1)
        .setMaxValue(600),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.seek,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const seconds = interaction.options.getInteger("seconds") ?? SEEK_STEP_DEFAULT;
    const result = await controls.seekBy(client.music, player, seconds * 1000);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    await announce(interaction, t.music.seeked(formatDuration(result.positionMs)));
  },
};
