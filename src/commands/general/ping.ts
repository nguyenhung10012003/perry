import type { BotClient } from '../../client/bot-client.js';
import type { Command } from '../../types/command.js';
import { baseEmbed } from '../../utils/embeds.js';
import { createCommand } from '../builder.js';

const LAVALINK_PING_TIMEOUT_MS = 2000;

/** Round-trip time of a stats request to the Lavalink node, or null when unreachable (max ~2 s). */
async function measureLavalinkLatency(client: BotClient): Promise<number | null> {
  const node = client.music.getSearchNode();
  if (!node) return null;
  const started = performance.now();
  try {
    await Promise.race([
      node.fetchStats(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('timeout'));
        }, LAVALINK_PING_TIMEOUT_MS).unref();
      }),
    ]);
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

export const ping: Command = {
  data: createCommand('ping', (m) => m.commands.ping.description),
  category: 'general',
  cooldownSeconds: 3,
  async execute({ interaction, client, t }) {
    const apiLatency = Math.max(0, Date.now() - interaction.createdTimestamp);
    const wsPing = client.ws.ping;
    const lines = [t.ping.api(apiLatency), wsPing >= 0 ? t.ping.ws(wsPing) : t.ping.wsUnknown];
    const lavalinkLatency = await measureLavalinkLatency(client);
    lines.push(lavalinkLatency === null ? t.ping.lavalinkOffline : t.ping.lavalink(lavalinkLatency));
    await interaction.reply({
      embeds: [baseEmbed().setTitle(t.ping.title).setDescription(lines.join('\n'))],
    });
  },
};
