import { PermissionFlagsBits } from 'discord.js';
import type { Client, GuildTextBasedChannel } from 'discord.js';

/**
 * A cached guild text channel (or thread) where the bot can post embeds (View Channel, Send Messages or Send
 * Messages in Threads, Embed Links), else null. Same rule as the music text channel (now-playing.ts).
 */
export function postableTextChannel(client: Client, channelId: string | null | undefined): GuildTextBasedChannel | null {
  if (!channelId) return null;
  const channel = client.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  const me = channel.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  const canSend = channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  return permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks, canSend]) ? channel : null;
}
