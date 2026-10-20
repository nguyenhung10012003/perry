import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { formatDuration, parseTimeInput } from "../../music/format.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { replyError } from "../../utils/respond.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const seek: Command = {
  data: createCommand("seek", t.commands.seek.description).addStringOption(
    (option) =>
      option
        .setName("time")
        .setDescription(t.commands.seek.time)
        .setRequired(true)
        .setMaxLength(12),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.seek,
  async execute({ interaction, client }) {
    const positionMs = parseTimeInput(interaction.options.getString("time", true));
    if (positionMs === null) {
      await replyError(interaction, t.errors.invalidTime);
      return;
    }
    const player = requirePlayer(client, interaction.guildId);
    const result = await controls.seekTo(client.music, player, positionMs);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.seeked(formatDuration(result.positionMs)));
  },
};
