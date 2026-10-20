import { t } from "../../i18n/index.js";
import * as controls from "../../music/controls.js";
import { FILTER_NAMES, isFilterName } from "../../music/filters.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { UserError } from "../../utils/errors.js";
import { createCommand } from "../builder.js";
import { announce, failControl, requirePlayer } from "./shared.js";

export const filter: Command = {
  data: createCommand("filter", t.commands.filter.description).addStringOption(
    (option) =>
      option
        .setName("name")
        .setDescription(t.commands.filter.name)
        .setRequired(true)
        .addChoices(
          ...FILTER_NAMES.map((name) => ({
            name: t.filters.names[name],
            value: name,
          })),
        ),
  ),
  category: "music",
  cooldownSeconds: 3,
  requirements: REQ.control,
  async execute({ interaction, client }) {
    const player = requirePlayer(client, interaction.guildId);
    const name = interaction.options.getString("name", true);
    if (!isFilterName(name)) throw new UserError(t.errors.generic);
    const result = await controls.applyFilter(client.music, player, name);
    if (!result.ok) {
      await failControl(interaction, result);
      return;
    }
    await announce(
      interaction,
      result.filter
        ? t.music.filterSet(t.filters.names[result.filter])
        : t.music.filterOff,
    );
  },
};
