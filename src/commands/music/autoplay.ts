import { REQ } from "../../music/requirements.js";
import { AUTOPLAY_MODES } from "../../settings/guild-settings.js";
import type { AutoplayMode } from "../../settings/guild-settings.js";
import type { Command } from "../../types/command.js";
import { choice, createCommand, describe } from "../builder.js";
import { announce } from "./shared.js";

function isAutoplayMode(value: string | null): value is AutoplayMode {
  return value !== null && (AUTOPLAY_MODES as readonly string[]).includes(value);
}

export const autoplay: Command = {
  data: createCommand("autoplay", (m) => m.commands.autoplay.description)
    .addStringOption((option) =>
      describe(option.setName("state"), (m) => m.commands.autoplay.state)
        .setRequired(true)
        .addChoices(
          choice("on", (m) => m.commands.autoplay.states.on),
          choice("off", (m) => m.commands.autoplay.states.off),
        ),
    )
    .addStringOption((option) =>
      describe(option.setName("mode"), (m) => m.commands.autoplay.mode)
        .addChoices(
          ...AUTOPLAY_MODES.map((mode) =>
            choice(mode, (m) => m.commands.autoplay.modes[mode]),
          ),
        ),
    ),
  category: "music",
  cooldownSeconds: 3,
  requirements: REQ.autoplay,
  async execute({ interaction, client, t }) {
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
