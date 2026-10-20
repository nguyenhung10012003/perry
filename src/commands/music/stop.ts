import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const stop: Command = {
  data: createCommand("stop", t.commands.stop.description),
  category: "music",
  cooldownSeconds: 2,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.stop(client.music, player);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, result.left ? t.music.stoppedLeft : t.music.stopped);
  },
};
