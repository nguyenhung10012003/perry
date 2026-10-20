import { MAX_VOLUME } from "../../config/constants.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand, describe } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const volume: Command = {
  data: createCommand("volume", (m) => m.commands.volume.description).addIntegerOption(
    (option) =>
      describe(option.setName("level"), (m) => m.commands.volume.level)
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(MAX_VOLUME),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const level = interaction.options.getInteger("level", true);
    const result = await controls.setVolume(client.music, player, level);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    await announce(interaction, t.music.volumeSet(result.level));
  },
};
