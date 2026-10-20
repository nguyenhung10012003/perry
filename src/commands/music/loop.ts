import type { RepeatMode } from "lavalink-client";
import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

const MODES = ["off", "track", "queue"] as const satisfies readonly RepeatMode[];

export const loop: Command = {
  data: createCommand("loop", t.commands.loop.description).addStringOption(
    (option) =>
      option
        .setName("mode")
        .setDescription(t.commands.loop.mode)
        .setRequired(true)
        .addChoices(
          ...MODES.map((mode) => ({
            name: t.music.loopModes[mode],
            value: mode,
          })),
        ),
  ),
  category: "music",
  cooldownSeconds: 1,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const mode = interaction.options.getString("mode", true) as (typeof MODES)[number];
    const result = await controls.setLoop(client.music, player, mode);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(interaction, t.music.loopSet(t.music.loopModes[result.mode]));
  },
};
