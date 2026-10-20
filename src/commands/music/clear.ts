import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const clear: Command = {
  data: createCommand("clear", (m) => m.commands.clear.description),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.control,
  async execute({ interaction, client, t }) {
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.clear(client.music, player);
    if (!result.ok) {
      await failControl(interaction, result, t);
      return;
    }
    await announce(interaction, t.music.cleared(result.count));
  },
};
