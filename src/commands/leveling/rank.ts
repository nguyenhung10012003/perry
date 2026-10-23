import { xpForNext, xpIntoLevel } from '../../leveling/xp.js';
import { progressBar } from '../../music/format.js';
import type { Command } from '../../types/command.js';
import { baseEmbed } from '../../utils/embeds.js';
import { replyError } from '../../utils/respond.js';
import { createCommand, describe } from '../builder.js';

const NO_MENTIONS = { parse: [] as never[] };

export const rank: Command = {
  data: createCommand('rank', (m) => m.commands.rank.description).addUserOption((option) =>
    describe(option.setName('user'), (m) => m.commands.rank.user),
  ),
  category: 'leveling',
  cooldownSeconds: 5,
  async execute({ interaction, client, t, locale }) {
    const { guildId } = interaction;
    const user = interaction.options.getUser('user') ?? interaction.user;
    // Bots earn no XP (A11, A26).
    if (user.bot) {
      await replyError(interaction, t.leveling.botsNoXp);
      return;
    }
    const settings = await client.settings.get(guildId);
    if (!settings.levelingEnabled) {
      await replyError(interaction, t.leveling.disabled);
      return;
    }
    await interaction.deferReply();

    const { levels } = client.storage;
    const self = user.id === interaction.user.id;
    const member = interaction.options.getMember('user') ?? (self ? interaction.member : null);
    const embed = baseEmbed()
      .setTitle(t.leveling.rank.title)
      .setAuthor({ name: member?.displayName ?? user.displayName, iconURL: (member ?? user).displayAvatarURL() });
    const stored = await levels.get(guildId, user.id);
    if (!stored.ok) {
      await replyError(interaction, t.leveling.storageUnavailable);
      return;
    }
    if (stored.value === null) {
      embed.setDescription(t.leveling.rank.unranked);
      await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
      return;
    }
    const { xp, level } = stored.value;
    const [position, total] = await Promise.all([levels.rank(guildId, xp, user.id), levels.count(guildId)]);
    if (!position.ok || !total.ok) {
      await replyError(interaction, t.leveling.storageUnavailable);
      return;
    }
    const format = new Intl.NumberFormat(locale);
    const into = xpIntoLevel(xp, level);
    const next = xpForNext(level);
    embed.setDescription(progressBar(into, next)).addFields(
      { name: t.leveling.rank.level, value: format.format(level), inline: true },
      { name: t.leveling.rank.xp, value: `${format.format(into)} / ${format.format(next)}`, inline: true },
      { name: t.leveling.rank.totalXp, value: format.format(xp), inline: true },
      {
        name: t.leveling.rank.rank,
        value: t.leveling.rank.rankOf(format.format(position.value), format.format(total.value)),
        inline: true,
      },
    );
    await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
  },
};
