import { t } from "../../i18n/index.js";
import { REQ } from "../../music/requirements.js";
import { AUTOPLAY_MODES } from "../../settings/guild-settings.js";
import type { AutoplayMode } from "../../settings/guild-settings.js";
import type { Command } from "../../types/command.js";
import { createCommand } from "../builder.js";
import { announce } from "./shared.js";

function isAutoplayMode(value: string | null): value is AutoplayMode {
  return value !== null && (AUTOPLAY_MODES as readonly string[]).includes(value);
}

export const autoplay: Command = {
  data: createCommand("autoplay", t.commands.autoplay.description)
    .addStringOption((option) =>
      option
        .setName("state")
        .setDescription(t.commands.autoplay.state)
        .setRequired(true)
        .addChoices(
          { name: t.commands.autoplay.states.on, value: "on" },
          { name: t.commands.autoplay.states.off, value: "off" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription(t.commands.autoplay.mode)
        .addChoices(
          ...AUTOPLAY_MODES.map((mode) => ({
            name: t.commands.autoplay.modes[mode],
            value: mode,
          })),
        ),
    ),
  category: "music",
  cooldownSeconds: 3,
  requirements: REQ.autoplay,
  async execute({ interaction, client }) {
    const enabled = interaction.options.getString("state", true) === "on";
    const modeOption = interaction.options.getString("mode");
    const mode = isAutoplayMode(modeOption) ? modeOption : undefined;

    const updated = await client.settings.update(interaction.guildId, {
      autoplayEnabled: enabled,
      ...(mode ? { autoplayMode: mode } : {}),
    });

    if (enabled) {
      // Turning it on re-arms a pause caused by an earlier empty discovery.
      const state = client.music.getState(interaction.guildId);
      if (state) {
        state.autoplayPaused = false;
        state.discoveryNoticeSent = false;
      }
    }
    await announce(
      interaction,
      t.autoplay.state(
        updated.autoplayEnabled,
        t.commands.autoplay.modes[updated.autoplayMode],
      ),
    );
  },
};
