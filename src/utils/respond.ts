import { MessageFlags } from 'discord.js';
import type { RepliableInteraction } from 'discord.js';
import { errorEmbed, infoEmbed } from './embeds.js';

const NO_MENTIONS = { parse: [] as never[] };

/**
 * Sends an ephemeral error. If the interaction was deferred publicly and nothing was sent yet,
 * the deferred reply cannot become ephemeral, so it is deleted and a ephemeral follow-up is sent (plan D20).
 */
export async function replyError(interaction: RepliableInteraction, message: string): Promise<void> {
  const embeds = [errorEmbed(message)];
  if (interaction.replied) {
    await interaction.followUp({ embeds, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS });
    return;
  }
  if (interaction.deferred) {
    if (!interaction.ephemeral) {
      await interaction.deleteReply().catch(() => undefined);
      await interaction.followUp({ embeds, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS });
    } else {
      await interaction.editReply({ embeds, allowedMentions: NO_MENTIONS });
    }
    return;
  }
  await interaction.reply({ embeds, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS });
}

/** Sends an informational message; ephemeral by default. */
export async function replyInfo(
  interaction: RepliableInteraction,
  message: string,
  options: { ephemeral?: boolean } = {},
): Promise<void> {
  const ephemeral = options.ephemeral ?? true;
  const embeds = [infoEmbed(message)];
  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply({ embeds, allowedMentions: NO_MENTIONS });
    return;
  }
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({
      embeds,
      ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
      allowedMentions: NO_MENTIONS,
    });
    return;
  }
  await interaction.reply({
    embeds,
    ...(ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
    allowedMentions: NO_MENTIONS,
  });
}
