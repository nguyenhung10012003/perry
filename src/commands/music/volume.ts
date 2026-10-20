import { MAX_VOLUME } from "../../config/constants.js";
import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const volume: Command = {
  data: createCommand("volume", t.commands.volume.description).addIntegerOption(
    (option) =>
      option
        .setName("level")
        .setDescription(t.commands.volume.level)
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(MAX_VOLUME),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const level = interaction.options.getInteger("level", true);
    const result = await controls.setVolume(client.music, player, level);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.volumeSet(result.level));
  },
};
