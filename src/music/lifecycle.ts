import type { Guild, VoiceState } from 'discord.js';
import type { BotClient } from '../client/bot-client.js';
import { ALONE_TIMEOUT_MS, IDLE_TIMEOUT_MS } from '../config/constants.js';
import { safeError } from '../utils/errors.js';
import type { MusicService } from './music-service.js';

/**
 * Counts humans in a voice channel using the voice-state cache (no GuildMembers intent, plan D21).
 * Members that are not cached count as human so the bot errs on staying, never on leaving a live listener.
 */
export function countHumans(guild: Guild, channelId: string, botId: string): number {
  let humans = 0;
  for (const voiceState of guild.voiceStates.cache.values()) {
    if (voiceState.channelId !== channelId || voiceState.id === botId) continue;
    if (voiceState.member?.user.bot === true) continue;
    humans++;
  }
  return humans;
}

/** Starts or cancels the 60 s "alone in channel" timer based on the current listeners. */
export function evaluateAlone(service: MusicService, guildId: string, channelIdOverride?: string): void {
  const player = service.getPlayer(guildId);
  const state = service.getState(guildId);
  const guild = service.client.guilds.cache.get(guildId);
  const botId = service.client.user?.id;
  const channelId = channelIdOverride ?? player?.voiceChannelId;
  if (!player || !state || state.disposed || !guild || !botId || !channelId) return;

  if (countHumans(guild, channelId, botId) > 0) {
    state.clearAlone();
    return;
  }
  if (state.aloneTimer) return;
  service.fireAndForget(
    (async (): Promise<void> => {
      const settings = await service.client.settings.get(guildId);
      // 24/7 keeps the bot in the channel regardless of listeners.
      if (settings.twentyFourSeven || state.disposed || state.aloneTimer) return;
      // Someone may have joined while the settings were loading.
      if (countHumans(guild, channelId, botId) > 0) return;
      state.aloneTimer = setTimeout(() => {
        state.aloneTimer = undefined;
        service.fireAndForget(onAloneTimeout(service, guildId), 'aloneTimeout');
      }, ALONE_TIMEOUT_MS);
      state.aloneTimer.unref();
    })(),
    'evaluateAlone',
  );
}

async function onAloneTimeout(service: MusicService, guildId: string): Promise<void> {
  const player = service.getPlayer(guildId);
  const guild = service.client.guilds.cache.get(guildId);
  const botId = service.client.user?.id;
  if (!player || !guild || !botId || !player.voiceChannelId) return;
  // Re-check: someone may have joined while the timer was pending.
  if (countHumans(guild, player.voiceChannelId, botId) > 0) return;
  const settings = await service.client.settings.get(guildId);
  if (settings.twentyFourSeven) return;
  await service.destroyPlayer(guildId, 'AloneTimeout');
}

/** Starts the 3 minute idle timer unless 24/7 is enabled. Replaces a running idle timer. */
export async function startIdleTimer(service: MusicService, guildId: string): Promise<void> {
  const state = service.getState(guildId);
  if (!state || state.disposed) return;
  state.clearIdle();
  const settings = await service.client.settings.get(guildId);
  if (settings.twentyFourSeven || state.disposed) return;
  state.clearIdle();
  state.idleTimer = setTimeout(() => {
    state.idleTimer = undefined;
    service.fireAndForget(onIdleTimeout(service, guildId), 'idleTimeout');
  }, IDLE_TIMEOUT_MS);
  state.idleTimer.unref();
}

export function cancelIdleTimer(service: MusicService, guildId: string): void {
  service.getState(guildId)?.clearIdle();
}

async function onIdleTimeout(service: MusicService, guildId: string): Promise<void> {
  const player = service.getPlayer(guildId);
  if (!player) return;
  // Something was queued or started in the meantime.
  if (player.playing || player.queue.current || player.queue.tracks.length > 0) return;
  const settings = await service.client.settings.get(guildId);
  if (settings.twentyFourSeven) return;
  await service.destroyPlayer(guildId, 'IdleTimeout');
}

/**
 * Reacts to voice state changes: re-evaluates the alone timer when someone joins/leaves the bot's channel
 * and when the bot itself is moved. A kick/disconnect of the bot is handled by lavalink-client
 * (onDisconnect.destroyPlayer -> playerDestroy), this only removes leftover state.
 */
export function handleVoiceStateUpdate(client: BotClient, oldState: VoiceState, newState: VoiceState): void {
  try {
    const service = client.music;
    const guildId = newState.guild.id;
    const botId = client.user?.id;
    if (!botId) return;

    if (newState.id === botId) {
      if (!newState.channelId) {
        // Bot is no longer in a channel: make sure nothing is left behind.
        if (!service.getPlayer(guildId)) service.disposeState(guildId);
        return;
      }
      if (oldState.channelId !== newState.channelId) evaluateAlone(service, guildId, newState.channelId);
      return;
    }

    const player = service.getPlayer(guildId);
    const botChannelId = player?.voiceChannelId;
    if (!botChannelId) return;
    if (oldState.channelId !== botChannelId && newState.channelId !== botChannelId) return;
    evaluateAlone(service, guildId);
  } catch (err) {
    client.logger.warn({ err: safeError(err) }, 'Voice state handler failed');
  }
}
