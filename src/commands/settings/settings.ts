import { ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { MAX_VOLUME } from "../../config/constants.js";
import { getMessages, isLocale, LOCALE_NAMES, resolveLocale } from "../../i18n/index.js";
import { refreshNowPlaying } from "../../music/now-playing.js";
import type { Command } from "../../types/command.js";
import { postableTextChannel } from "../../utils/channels.js";
import { baseEmbed } from "../../utils/embeds.js";
import { replyError, replyInfo } from "../../utils/respond.js";
import { choice, createCommand, describe } from "../builder.js";

export const settings: Command = {
  data: createCommand("settings", (m) => m.commands.settings.description)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      describe(sub.setName("view"), (m) => m.commands.settings.view.description),
    )
    .addSubcommand((sub) =>
      describe(sub.setName("dj-role"), (m) => m.commands.settings.djRole.description)
        .addRoleOption((option) =>
          describe(option.setName("role"), (m) => m.commands.settings.djRole.role),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName("default-volume"), (m) => m.commands.settings.defaultVolume.description)
        .addIntegerOption((option) =>
          describe(option.setName("level"), (m) => m.commands.settings.defaultVolume.level)
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(MAX_VOLUME),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName("language"), (m) => m.commands.settings.language.description)
        .addStringOption((option) =>
          describe(option.setName("locale"), (m) => m.commands.settings.language.locale)
            .setRequired(true)
            .addChoices(
              // Language names are autonyms, identical in every locale.
              { name: LOCALE_NAMES.en, value: "en" },
              { name: LOCALE_NAMES.vi, value: "vi" },
              choice("default", (m) => m.commands.settings.language.default),
            ),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName("mod-log"), (m) => m.commands.settings.modLog.description)
        .addChannelOption((option) =>
          describe(option.setName("channel"), (m) => m.commands.settings.modLog.channel)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      describe(sub.setName("mod-dm"), (m) => m.commands.settings.modDm.description)
        .addBooleanOption((option) =>
          describe(option.setName("enabled"), (m) => m.commands.settings.modDm.enabled)
            .setRequired(true),
        ),
    ),
  category: "settings",
  cooldownSeconds: 3,
  async execute({ interaction, client, t }) {
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
            {
              name: t.settings.language,
              value: current.language
                ? LOCALE_NAMES[current.language]
                : t.settings.languageDefault(LOCALE_NAMES[client.config.defaultLocale]),
              inline: true,
            },
            {
              name: t.settings.modLog,
              value: current.modLogChannelId
                ? `<#${current.modLogChannelId}>`
                : t.settings.notSet,
              inline: true,
            },
            {
              name: t.settings.modDm,
              value: current.modDmTarget ? t.settings.on : t.settings.off,
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
      case "language": {
        const value = interaction.options.getString("locale", true);
        // "default" clears the guild setting, so DEFAULT_LOCALE applies again.
        const language = value === "default" ? null : isLocale(value) ? value : undefined;
        if (language === undefined) {
          await replyError(interaction, t.errors.unknownCommand);
          return;
        }
        await client.settings.update(guildId, { language });
        const defaultLocale = client.config.defaultLocale;
        // Confirm in the new effective language.
        const next = getMessages(resolveLocale(language, defaultLocale));
        await replyInfo(
          interaction,
          language
            ? next.settings.languageSet(LOCALE_NAMES[language])
            : next.settings.languageReset(LOCALE_NAMES[defaultLocale]),
        );
        // An active Now-Playing message re-renders in the new language.
        refreshNowPlaying(client.music, guildId);
        return;
      }
      case "mod-log": {
        const channel = interaction.options.getChannel("channel");
        if (!channel) {
          await client.settings.update(guildId, { modLogChannelId: null });
          await replyInfo(interaction, t.settings.modLogCleared);
          return;
        }
        // The bot must be able to post embeds there, else every case would silently miss the log.
        if (!postableTextChannel(client, channel.id)) {
          await replyError(interaction, t.settings.modLogNoAccess);
          return;
        }
        await client.settings.update(guildId, { modLogChannelId: channel.id });
        await replyInfo(interaction, t.settings.modLogSet(channel.id));
        return;
      }
      case "mod-dm": {
        const enabled = interaction.options.getBoolean("enabled", true);
        await client.settings.update(guildId, { modDmTarget: enabled });
        await replyInfo(interaction, t.settings.modDmSet(enabled));
        return;
      }
      default:
        await replyError(interaction, t.errors.unknownCommand);
    }
  },
};
