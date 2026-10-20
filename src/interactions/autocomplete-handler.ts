import type { AutocompleteInteraction } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import { safeError } from '../utils/errors.js';

export async function handleAutocomplete(
  client: BotClient,
  interaction: AutocompleteInteraction<'cached'>,
): Promise<void> {
  const command = client.commands.get(interaction.commandName);
  if (!command?.autocomplete) return;
  try {
    await command.autocomplete({ interaction, client });
  } catch (err) {
    client.logger.warn({ err: safeError(err), command: interaction.commandName }, 'Autocomplete failed');
    if (!interaction.responded) await interaction.respond([]).catch(() => undefined);
  }
}
