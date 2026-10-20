import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const pause: Command = {
  data: createCommand("pause", t.commands.pause.description),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.setPaused(client.music, player, true);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    if (!result.changed) {
      await replyError(interaction, t.music.alreadyPaused);
      return;
    }
    await announce(interaction, t.music.paused);
  },
};
