import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer, titleOf } from "./shared.js";

export const remove: Command = {
  data: createCommand("remove", t.commands.remove.description).addIntegerOption(
    (option) =>
      option
        .setName("position")
        .setDescription(t.commands.remove.position)
        .setRequired(true)
        .setMinValue(1),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.trackControl,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const position = interaction.options.getInteger("position", true);
    const result = await controls.removeAt(client.music, player, position);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.removed(titleOf(result.removed)));
  },
};
