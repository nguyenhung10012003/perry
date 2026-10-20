import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import type { Messages } from '../i18n/index.js';

export const PAGINATION_PREFIX = 'pg:';
const IDLE_MS = 120_000;
/** Interaction tokens stay valid for 15 minutes; stop a little earlier so the final edit still works. */
const MAX_MS = 14 * 60_000;
const NO_MENTIONS = { parse: [] as never[] };

export interface PageContent {
  embed: EmbedBuilder;
  /** The page actually rendered (the renderer clamps the request). */
  page: number;
  totalPages: number;
}

export interface PaginateOptions {
  startPage?: number;
  /** Ephemeral reply (used when the interaction is a button and nothing was sent yet). */
  ephemeral?: boolean;
}

function buildRow(page: number, totalPages: number, disabled: boolean, t: Messages): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PAGINATION_PREFIX}prev`)
      .setLabel(t.buttons.prev)
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 1),
    new ButtonBuilder()
      .setCustomId(`${PAGINATION_PREFIX}page`)
      .setLabel(`${page}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${PAGINATION_PREFIX}next`)
      .setLabel(t.buttons.next)
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages),
  );
}

/**
 * Sends a paged embed. `render(page)` is called again on every click, so content is always live.
 * Only the user who ran the command can flip pages (120 s idle timeout, then the buttons are disabled).
 * Works for a fresh reply, a deferred reply (editReply) and button interactions. `t` (the guild's catalog)
 * labels the buttons and the owner-only notice.
 */
export async function paginate(
  interaction: ChatInputCommandInteraction<'cached'> | ButtonInteraction<'cached'>,
  render: (page: number) => PageContent,
  t: Messages,
  options: PaginateOptions = {},
): Promise<void> {
  const first = render(options.startPage ?? 1);
  const paged = first.totalPages > 1;
  const payload = {
    embeds: [first.embed],
    components: paged ? [buildRow(first.page, first.totalPages, false, t)] : [],
    allowedMentions: NO_MENTIONS,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply({
      ...payload,
      ...(options.ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
    });
  }
  if (!paged) return;

  const message = await interaction.fetchReply();
  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    idle: IDLE_MS,
    time: MAX_MS,
    filter: (component) => component.customId.startsWith(PAGINATION_PREFIX),
  });
  let currentPage = first.page;

  collector.on('collect', (component) => {
    void (async (): Promise<void> => {
      try {
        if (component.user.id !== interaction.user.id) {
          await component.reply({ content: t.errors.ownerOnly, flags: MessageFlags.Ephemeral });
          return;
        }
        const delta = component.customId === `${PAGINATION_PREFIX}next` ? 1 : -1;
        const next = render(currentPage + delta);
        currentPage = next.page;
        await component.update({
          embeds: [next.embed],
          components: [buildRow(next.page, next.totalPages, false, t)],
          allowedMentions: NO_MENTIONS,
        });
      } catch {
        // Interaction expired or message deleted: nothing useful left to do.
      }
    })();
  });

  collector.on('end', () => {
    try {
      const latest = render(currentPage);
      interaction
        .editReply({ components: [buildRow(latest.page, latest.totalPages, true, t)] })
        .catch(() => undefined);
    } catch {
      // The renderer failed (e.g. player gone): leave the message as is.
    }
  });
}
