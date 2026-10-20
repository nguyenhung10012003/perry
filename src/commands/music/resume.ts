import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const resume: Command = {
  data: createCommand("resume", t.commands.resume.description),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.setPaused(client.music, player, false);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    if (!result.changed) {
      await replyError(interaction, t.music.notPaused);
      return;
    }
    await announce(interaction, t.music.resumed);
  },
};
