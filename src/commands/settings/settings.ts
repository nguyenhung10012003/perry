import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { MAX_VOLUME } from "../../config/constants.js";
import { t } from "../../i18n/index.js";
import type { Command } from "../../types/command.js";
import { baseEmbed } from "../../utils/embeds.js";
import { replyError, replyInfo } from "../../utils/respond.js";
import { createCommand } from "../builder.js";

export const settings: Command = {
  data: createCommand("settings", t.commands.settings.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("view").setDescription(t.commands.settings.view.description),
    )
    .addSubcommand((sub) =>
      sub
        .setName("dj-role")
        .setDescription(t.commands.settings.djRole.description)
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription(t.commands.settings.djRole.role),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("default-volume")
        .setDescription(t.commands.settings.defaultVolume.description)
        .addIntegerOption((option) =>
          option
            .setName("level")
            .setDescription(t.commands.settings.defaultVolume.level)
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(MAX_VOLUME),
        ),
    ),
  category: "settings",
  cooldownSeconds: 3,
  async execute({ interaction, client }) {
    // Guild admins can override command permissions in Integrations, so re-check here (Administrator implies it).
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, t.settings.noPermission);
      return;
    }
    const guildId = interaction.guildId;

    switch (interaction.options.getSubcommand()) {
      case "view": {
        const current = await client.settings.get(guildId);
        const embed = baseEmbed()
          .setTitle(t.settings.title)
          .addFields(
            {
              name: t.settings.djRole,
              value: current.djRoleId
                ? `<@&${current.djRoleId}>`
                : t.settings.notSet,
              inline: true,
            },
            {
              name: t.settings.defaultVolume,
              value: `${current.defaultVolume}%`,
              inline: true,
            },
            {
              name: t.settings.twentyFourSeven,
              value: current.twentyFourSeven ? t.settings.on : t.settings.off,
              inline: true,
            },
            {
              name: t.settings.autoplay,
              value: current.autoplayEnabled ? t.settings.on : t.settings.off,
              inline: true,
            },
            {
              name: t.settings.autoplayMode,
              value: t.commands.autoplay.modes[current.autoplayMode],
              inline: true,
            },
          );
        await interaction.reply({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      case "dj-role": {
        const role = interaction.options.getRole("role");
        if (!role) {
          await client.settings.update(guildId, { djRoleId: null });
          await replyInfo(interaction, t.settings.djRoleCleared);
          return;
        }
        if (role.id === guildId || role.managed) {
          await replyError(interaction, t.settings.djRoleInvalid);
          return;
        }
        await client.settings.update(guildId, { djRoleId: role.id });
        await replyInfo(interaction, t.settings.djRoleSet(role.id));
        return;
      }
      case "default-volume": {
        const level = interaction.options.getInteger("level", true);
        if (level < 0 || level > MAX_VOLUME) {
          await replyError(interaction, t.errors.volumeOutOfRange(MAX_VOLUME));
          return;
        }
        // Only affects players created later; an existing player keeps its current volume.
        await client.settings.update(guildId, { defaultVolume: level });
        await replyInfo(interaction, t.settings.defaultVolumeSet(level));
        return;
      }
      default:
        await replyError(interaction, t.errors.unknownCommand);
    }
  },
};
