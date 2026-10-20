import { MessageFlags } from 'discord.js';
import { t } from '../../i18n/index.js';
import type { Category, Command } from '../../types/command.js';
import { baseEmbed } from '../../utils/embeds.js';
import { createCommand } from '../builder.js';

const CATEGORY_ORDER: Category[] = ['music', 'general', 'settings'];

export const help: Command = {
  data: createCommand('help', t.commands.help.description),
  category: 'general',
  cooldownSeconds: 3,
  async execute({ interaction, client }) {
    // Reads the registry at execute time (never import it here, that would create an import cycle).
    const embed = baseEmbed().setTitle(t.help.title).setFooter({ text: t.help.footer });
    let any = false;
    for (const category of CATEGORY_ORDER) {
      const lines = client.commands
        .filter((command) => command.category === category)
        .map((command) => {
          const json = command.data.toJSON();
          return `/${json.name} - ${json.description}`;
        });
      if (lines.length === 0) continue;
      any = true;
      embed.addFields({ name: t.categories[category], value: lines.join('\n') });
    }
    if (!any) embed.setDescription(t.help.empty);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
