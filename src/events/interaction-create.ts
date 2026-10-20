import { Events } from 'discord.js';
import { handleAutocomplete } from '../interactions/autocomplete-handler.js';
import { handleButton } from '../interactions/button-handler.js';
import { handleCommand } from '../interactions/command-handler.js';
import { t } from '../i18n/index.js';
import { replyError } from '../utils/respond.js';
import { safeError } from '../utils/errors.js';
import type { BotEvent } from './index.js';

export const interactionCreate: BotEvent<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        if (!interaction.inCachedGuild()) {
          await replyError(interaction, t.errors.guildOnly);
          return;
        }
        await handleCommand(client, interaction);
      } else if (interaction.isAutocomplete()) {
        if (!interaction.inCachedGuild()) return;
        await handleAutocomplete(client, interaction);
      } else if (interaction.isButton()) {
        // np:* buttons are handled here; pg:* belongs to the paginator's collector (ignored by handleButton).
        if (!interaction.inCachedGuild()) return;
        await handleButton(client, interaction);
      }
    } catch (err) {
      client.logger.error({ err: safeError(err) }, 'Unhandled interaction error');
    }
  },
};
