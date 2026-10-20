import { SEEK_STEP_DEFAULT } from "../../config/constants.js";
import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { formatDuration } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const forward: Command = {
  data: createCommand("forward", t.commands.forward.description).addIntegerOption(
    (option) =>
      option
        .setName("seconds")
        .setDescription(t.commands.forward.seconds)
        .setMinValue(1)
        .setMaxValue(600),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.seek,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const seconds = interaction.options.getInteger("seconds") ?? SEEK_STEP_DEFAULT;
    const result = await controls.seekBy(client.music, player, seconds * 1000);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.seeked(formatDuration(result.positionMs)));
  },
};
