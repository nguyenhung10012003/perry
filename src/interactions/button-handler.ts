import { DiscordAPIError, MessageFlags } from 'discord.js';
import type { ButtonInteraction } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import { getMessages } from '../i18n/index.js';
import type { Messages } from '../i18n/index.js';
import * as controls from '../music/controls.js';
import { runGuards } from '../music/guards.js';
import { NP_PREFIX } from '../music/now-playing.js';
import type { NpAction } from '../music/now-playing.js';
import { buildQueuePage } from '../music/queue-view.js';
import { REQ } from '../music/requirements.js';
import type { Requirements } from '../types/command.js';
import { safeError, UserError } from '../utils/errors.js';
import { errorEmbed } from '../utils/embeds.js';
import { paginate } from '../utils/pagination.js';
import { replyError } from '../utils/respond.js';

const BUTTON_COOLDOWN_SECONDS = 1;
const IGNORED_DISCORD_CODES = new Set<number>([10062, 40060]);

/** The same presets as the equivalent slash commands (pause/skip/stop/loop/shuffle/queue). */
const ACTION_REQUIREMENTS: Record<NpAction, Requirements> = {
  pause: REQ.control,
  skip: REQ.trackControl,
  stop: REQ.control,
  loop: REQ.control,
  shuffle: REQ.control,
  queue: REQ.view,
};

function isAction(value: string): value is NpAction {
  return Object.hasOwn(ACTION_REQUIREMENTS, value);
}

/** Ephemeral follow-up after the button was acknowledged with deferUpdate (never touches the NP message). */
async function followUpError(interaction: ButtonInteraction<'cached'>, message: string): Promise<void> {
  await interaction.followUp({
    embeds: [errorEmbed(message)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/**
 * Handles `np:*` buttons of the Now-Playing message. `pg:*` (pagination) is owned by the paginator's collector
 * and every other customId is ignored. Buttons run the same guards and controls as the slash commands.
 */
export async function handleButton(client: BotClient, interaction: ButtonInteraction<'cached'>): Promise<void> {
  if (!interaction.customId.startsWith(NP_PREFIX)) return;
  const action = interaction.customId.slice(NP_PREFIX.length);
  let t: Messages | undefined;
  try {
    if (!isAction(action)) return;
    t = await client.messagesFor(interaction.guildId);
    if (client.shuttingDown) {
      await replyError(interaction, t.errors.shuttingDown);
      return;
    }

    const service = client.music;
    const state = service.getState(interaction.guildId);
    const player = service.getPlayer(interaction.guildId);
    const ref = state?.npMessage;
    if (!player || !ref || ref.ended || ref.messageId !== interaction.message.id) {
      await replyError(interaction, t.errors.buttonExpired);
      return;
    }

    const remaining = await client.storage.cooldowns.check(
      `${NP_PREFIX}${action}`,
      interaction.user.id,
      BUTTON_COOLDOWN_SECONDS,
    );
    if (remaining > 0) {
      await replyError(interaction, t.errors.onCooldown(remaining));
      return;
    }

    const guard = await runGuards({ interaction, client, requirements: ACTION_REQUIREMENTS[action], t });
    if (!guard.ok) {
      await replyError(interaction, guard.message);
      return;
    }

    if (action === 'queue') {
      const messages = t;
      await paginate(interaction, (page) => buildQueuePage(player, page, messages), messages, { ephemeral: true });
      return;
    }

    // Acknowledge silently; the Now-Playing message is updated by the control (refreshNowPlaying).
    await interaction.deferUpdate();
    let result: controls.ControlFailure | { ok: true };
    switch (action) {
      case 'pause':
        result = await controls.togglePause(service, player);
        break;
      case 'skip':
        result = await controls.skip(service, player);
        break;
      case 'stop':
        result = await controls.stop(service, player);
        break;
      case 'loop':
        result = await controls.cycleLoop(service, player);
        break;
      case 'shuffle':
        result = await controls.shuffle(service, player);
        break;
    }
    if (!result.ok) await followUpError(interaction, controls.controlError(result, t));
  } catch (err) {
    if (err instanceof DiscordAPIError && typeof err.code === 'number' && IGNORED_DISCORD_CODES.has(err.code)) return;
    const messages = t ?? getMessages(client.config.defaultLocale);
    const message = err instanceof UserError ? err.localized(messages) : messages.errors.generic;
    if (!(err instanceof UserError)) {
      client.logger.error({ err: safeError(err), action }, 'Button handler failed');
    }
    const send = interaction.deferred || interaction.replied ? followUpError(interaction, message) : replyError(interaction, message);
    await send.catch(() => undefined);
  }
}
