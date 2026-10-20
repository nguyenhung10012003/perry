import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer, titleOf } from "./shared.js";

export const previous: Command = {
  data: createCommand("previous", (m) => m.commands.previous.description),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.trackControl,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.previous(client.music, player);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    await announce(interaction, t.music.previous(titleOf(result.track)));
  },
};
