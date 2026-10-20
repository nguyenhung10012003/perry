import type { Player, Track } from 'lavalink-client';
import {
  AUTOPLAY_MAX_REFILLS_PER_HOUR,
  DISCOVERY_LIMIT_WINDOW_SECONDS,
  DISCOVERY_MAX_CALLS_PER_HOUR,
  DISCOVERY_MIN_RESULTS,
  DISCOVERY_TIMEOUT_MS,
} from '../../config/constants.js';
import { safeError } from '../../utils/errors.js';
import { countHumans } from '../lifecycle.js';
import type { MusicService } from '../music-service.js';
import { sendNotice } from '../now-playing.js';
import { tagAsAutoplay } from '../requester.js';
import type { Requester } from '../requester.js';
import { recentKeys } from './filters.js';
import { planAdditions } from './queue-add.js';
import type { DiscoveryContext } from './types.js';

/** Why a refill runs: the queue ended (autoplay or radio) or /radio fills the queue right after it started. */
export type FillReason = 'autoplay' | 'radio';

export type FillOutcome =
  | { kind: 'added'; count: number; provider: string }
  | { kind: 'empty' }
  | { kind: 'rateLimited' }
  /** The player was stopped, destroyed or restarted by a user while discovery ran: nothing was added. */
  | { kind: 'aborted' };

/**
 * Refills a guild's queue with related tracks. `onQueueEmpty` is registered as lavalink-client's
 * `onEmptyQueue.autoPlayFunction`: when it adds tracks the library plays the next one and no `queueEnd` is emitted,
 * when it adds nothing the normal queue-end flow (idle timer) runs. It never throws and never adds unrelated tracks.
 */
export class AutoplayController {
  constructor(private readonly service: MusicService) {}

  /** Counts one provider-chain call against the guild's hourly budget; false when the budget is spent. */
  allowDiscovery(guildId: string): Promise<boolean> {
    return this.service.client.storage.limiter.hit(
      'discovery',
      guildId,
      DISCOVERY_MAX_CALLS_PER_HOUR,
      DISCOVERY_LIMIT_WINDOW_SECONDS,
    );
  }

  /** The autoPlayFunction. Gates in order: stopping, enabled, listeners, paused, rate limits; then seeds by mode. */
  async onQueueEmpty(player: Player, lastTrack: Track | null | undefined): Promise<void> {
    try {
      const service = this.service;
      if (service.isStopping) return;
      const guildId = player.guildId;
      const state = service.getState(guildId);
      if (!state || state.disposed) return;
      const settings = await service.client.settings.get(guildId);
      if (!settings.autoplayEnabled && !state.radio) return;

      const guild = service.client.guilds.cache.get(guildId);
      const botId = service.client.user?.id;
      if (!guild || !botId || !player.voiceChannelId) return;
      if (countHumans(guild, player.voiceChannelId, botId) === 0) return;
      if (state.autoplayPaused) return;

      const withinRefills = await service.client.storage.limiter.hit(
        'autoplay',
        guildId,
        AUTOPLAY_MAX_REFILLS_PER_HOUR,
        DISCOVERY_LIMIT_WINDOW_SECONDS,
      );
      if (!withinRefills) {
        service.logger.info({ guildId }, 'Autoplay refill limit reached for this hour');
        return;
      }

      const last = lastTrack ?? player.queue.previous[0] ?? null;
      const anchor = state.radio ? state.radio.seed : settings.autoplayMode === 'seed' ? state.humanSeed : null;
      const seeds: Track[] = [];
      for (const seed of [anchor, last]) {
        if (seed && !seeds.some((existing) => existing.encoded === seed.encoded)) seeds.push(seed);
      }
      if (seeds.length === 0) return;

      const outcome = await this.discoverInto(player, seeds, 'autoplay', last ? recentKeys(last) : []);
      if (outcome.kind === 'aborted') return;
      if (outcome.kind === 'added') {
        state.discoveryNoticeSent = false;
        // The library returns early from queueEnd when autoplay adds tracks and so never records the track that just
        // ended; do it here (same rules as lavalink-client) so /previous can still reach it.
        if (lastTrack && !lastTrack.pluginInfo?.clientData?.previousTrack) {
          player.queue.previous.unshift(lastTrack);
          player.queue.previous.splice(player.queue.options.maxPreviousTracks);
          await player.queue.utils.save();
        }
        return;
      }
      if (outcome.kind === 'rateLimited') {
        service.logger.info({ guildId }, 'Discovery call limit reached for this hour');
        return;
      }
      // Nothing usable from any provider: one notice, then stay quiet until /play, /radio or /autoplay on.
      state.autoplayPaused = true;
      if (!state.discoveryNoticeSent) {
        state.discoveryNoticeSent = true;
        service.track(sendNotice(service, player.textChannelId, (t) => t.autoplay.nothingFound));
      }
    } catch (err) {
      this.service.logger.warn({ err: safeError(err), guildId: player.guildId }, 'Autoplay failed');
    }
  }

  /**
   * Finds tracks related to `seedTrack` and queues all of them (deduplicated, within the queue cap). Does not
   * start playback: the caller does (the library does it for autoplay, /radio does it itself). Never throws.
   */
  async fill(player: Player, seedTrack: Track, reason: FillReason): Promise<FillOutcome> {
    try {
      return await this.discoverInto(player, [seedTrack], reason, []);
    } catch (err) {
      this.service.logger.warn({ err: safeError(err), guildId: player.guildId }, 'Discovery fill failed');
      return { kind: 'empty' };
    }
  }

  private async discoverInto(
    player: Player,
    seeds: readonly Track[],
    reason: FillReason,
    exclude: Iterable<string>,
  ): Promise<FillOutcome> {
    const service = this.service;
    const guildId = player.guildId;
    const botId = service.client.user?.id ?? '';
    const requester: Requester = { id: botId, username: 'autoplay' };
    const ctx: DiscoveryContext = {
      service,
      guildId,
      requester,
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS + 2000),
      logger: service.logger,
    };

    // The first seed is the preferred one; a later seed only runs when the earlier ones gave too little.
    let best: { tracks: Track[]; provider: string } | null = null;
    for (const seed of seeds) {
      if (!(await this.allowDiscovery(guildId))) {
        if (!best) return { kind: 'rateLimited' };
        break;
      }
      const result = await service.discovery.discover(ctx, seed, { exclude });
      if (result.provider && result.tracks.length > (best?.tracks.length ?? 0)) {
        best = { tracks: result.tracks, provider: result.provider };
      }
      if ((best?.tracks.length ?? 0) >= DISCOVERY_MIN_RESULTS) break;
    }
    if (!best) return { kind: 'empty' };

    // The player may have been destroyed or the bot stopped while the providers were working.
    const state = service.getState(guildId);
    if (service.isStopping || !state || state.disposed || service.getPlayer(guildId) !== player) {
      return { kind: 'aborted' };
    }
    // Autoplay runs inside queueEnd with no current track: if a user started something meanwhile, appending now
    // would make the library promote an autoplay track over it.
    if (reason === 'autoplay' && (player.queue.current !== null || player.playing)) return { kind: 'aborted' };

    for (const track of best.tracks) tagAsAutoplay(track, requester, best.provider);
    const plan = planAdditions(player, best.tracks, { dedupe: true });
    if (plan.toAdd.length === 0) return { kind: 'empty' };
    await player.queue.add(plan.toAdd);
    service.cancelIdleTimer(guildId);
    service.logger.debug(
      { guildId, reason, provider: best.provider, added: plan.toAdd.length },
      'Discovery tracks queued',
    );
    return { kind: 'added', count: plan.toAdd.length, provider: best.provider };
  }
}
