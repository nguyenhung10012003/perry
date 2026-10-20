import { DiscordAPIError } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import { getMessages } from '../i18n/index.js';
import type { Messages } from '../i18n/index.js';
import { hasRequirements, runGuards } from '../music/guards.js';
import { safeError, UserError } from '../utils/errors.js';
import { replyError } from '../utils/respond.js';

const DEFAULT_COOLDOWN_SECONDS = 1;
/** Unknown interaction / interaction already acknowledged. */
const IGNORED_DISCORD_CODES = new Set<number>([10062, 40060]);

function isIgnorable(err: unknown): boolean {
  return err instanceof DiscordAPIError && typeof err.code === 'number' && IGNORED_DISCORD_CODES.has(err.code);
}

export async function handleCommand(
  client: BotClient,
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<void> {
  const command = client.commands.get(interaction.commandName);
  let t: Messages | undefined;
  try {
    const locale = await client.localeFor(interaction.guildId);
    t = getMessages(locale);
    if (!command) {
      await replyError(interaction, t.errors.unknownCommand);
      return;
    }
    if (client.shuttingDown) {
      await replyError(interaction, t.errors.shuttingDown);
      return;
    }

    const remaining = await client.storage.cooldowns.check(
      command.data.name,
      interaction.user.id,
      command.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS,
    );
    if (remaining > 0) {
      await replyError(interaction, t.errors.onCooldown(remaining));
      return;
    }

    if (hasRequirements(command.requirements)) {
      const result = await runGuards({ interaction, client, requirements: command.requirements, t });
      if (!result.ok) {
        await replyError(interaction, result.message);
        return;
      }
    }

    await command.execute({ interaction, client, t, locale });
  } catch (err) {
    if (isIgnorable(err)) return;
    const messages = t ?? getMessages(client.config.defaultLocale);
    if (err instanceof UserError) {
      await replyError(interaction, err.localized(messages)).catch(() => undefined);
      return;
    }
    client.logger.error({ err: safeError(err), command: interaction.commandName }, 'Command failed');
    await replyError(interaction, messages.errors.generic).catch((replyErr: unknown) => {
      if (!isIgnorable(replyErr)) {
        client.logger.warn({ err: safeError(replyErr) }, 'Could not send error reply');
      }
    });
  }
}
