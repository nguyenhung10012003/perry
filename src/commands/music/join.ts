import { escapeMarkdown } from "discord.js";
import { t } from "../../i18n/index.js";
import { REQ } from "../../music/requirements.js";
import type { Command } from "../../types/command.js";
import { UserError } from "../../utils/errors.js";
import { createCommand } from "../builder.js";
import { announce } from "./shared.js";

export const join: Command = {
  data: createCommand("join", t.commands.join.description),
  category: "music",
  cooldownSeconds: 3,
  requirements: REQ.join,
  async execute({ interaction, client }) {
    // Connecting can take a moment.
    await interaction.deferReply();
    const channel = interaction.member.voice.channel;
    if (!channel) throw new UserError(t.errors.notInVoice);
    await client.music.getOrCreatePlayer({
      guild: interaction.guild,
      voiceChannelId: channel.id,
      textChannelId: interaction.channelId,
    });
    await announce(interaction, t.music.joined(escapeMarkdown(channel.name)));
  },
};
