import type { Track, UnresolvedTrack } from 'lavalink-client';
import {
  DISCOVERY_MAX_SAME_ARTIST_RUN,
  DISCOVERY_MIN_RESULTS,
  DISCOVERY_PROVIDER_TIMEOUT_MS,
  DISCOVERY_TIMEOUT_MS,
  MAX_PLAYLIST_TRACKS,
  PREVIOUS_DEDUPE_WINDOW,
} from '../../config/constants.js';
import type { Config } from '../../config/env.js';
import type { RecentlyPlayedStore } from '../../storage/types.js';
import { safeError } from '../../utils/errors.js';
import { capTracks, diversify, filterCandidates, normArtist, normTitle, recentKeys } from './filters.js';
import { queueEntryKey, remainingQueueCapacity } from './queue-add.js';
import type {
  DiscoverOptions,
  DiscoveryAttempt,
  DiscoveryContext,
  DiscoveryResult,
  RecommendationProvider,
} from './types.js';

export interface DiscoveryEngineOptions {
  /** Enabled providers in the order they are tried. */
  providers: readonly RecommendationProvider[];
  config: Config['discovery'];
  recent: RecentlyPlayedStore;
}

/** Keys (track id + title identity) of a queue entry, which may be unresolved. */
function entryKeys(entry: Track | UnresolvedTrack): string[] {
  const keys: string[] = [];
  const idKey = queueEntryKey(entry);
  if (idKey) keys.push(idKey);
  const { author, title } = entry.info;
  if (author && title) keys.push(`${normArtist(author)}|${normTitle(title, author)}`);
  return keys;
}

/** Rejects with `reason` as soon as `signal` aborts; the listener is always removed. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new Error(signal.reason instanceof Error ? signal.reason.message : 'aborted'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Finds tracks related to a seed. Providers run one after another inside an overall time budget; the first one
 * that yields enough clean tracks wins and ALL of its tracks are returned (the caller adds them in one go).
 * Never throws.
 */
export class DiscoveryEngine {
  readonly recent: RecentlyPlayedStore;
  private readonly providers: readonly RecommendationProvider[];
  private readonly config: Config['discovery'];

  constructor(options: DiscoveryEngineOptions) {
    this.providers = options.providers;
    this.config = options.config;
    this.recent = options.recent;
  }

  async discover(ctx: DiscoveryContext, seed: Track, options: DiscoverOptions = {}): Promise<DiscoveryResult> {
    const attempts: DiscoveryAttempt[] = [];
    const empty: DiscoveryResult = { provider: null, tracks: [], attempts };
    try {
      const player = ctx.service.getPlayer(ctx.guildId);
      const limit = options.limit ?? Math.min(MAX_PLAYLIST_TRACKS, remainingQueueCapacity(player));
      if (limit <= 0) return empty;
      const minResults = Math.min(options.minResults ?? DISCOVERY_MIN_RESULTS, limit);

      const blocked = new Set<string>(options.exclude ?? []);
      for (const key of recentKeys(seed)) blocked.add(key);
      const sequence: (Track | UnresolvedTrack)[] = [];
      if (player) {
        if (player.queue.current) sequence.push(player.queue.current);
        sequence.push(...player.queue.tracks);
        const previous = options.ignoreHistory ? [] : player.queue.previous.slice(0, PREVIOUS_DEDUPE_WINDOW);
        for (const entry of [player.queue.current, ...player.queue.tracks, ...previous]) {
          if (entry) for (const key of entryKeys(entry)) blocked.add(key);
        }
      }
      if (!options.ignoreHistory) for (const key of await this.recent.keys(ctx.guildId)) blocked.add(key);
      const tailArtists = (sequence.length > 0 ? sequence.slice(-DISCOVERY_MAX_SAME_ARTIST_RUN) : [seed]).map((entry) =>
        normArtist(entry.info.author ?? ''),
      );

      // One overall budget for the whole chain, also ending when the caller aborts.
      const overall = AbortSignal.any([ctx.signal, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)]);
      let best: { id: DiscoveryAttempt['id']; tracks: Track[] } | null = null;

      for (const provider of this.providers) {
        if (options.providers && !options.providers.includes(provider.id)) continue;
        if (overall.aborted) break;
        const attempt: DiscoveryAttempt = { id: provider.id, outcome: 'unavailable', raw: 0, kept: 0 };
        attempts.push(attempt);

        const providerSignal = AbortSignal.any([overall, AbortSignal.timeout(DISCOVERY_PROVIDER_TIMEOUT_MS)]);
        const providerCtx: DiscoveryContext = { ...ctx, signal: providerSignal };
        let candidates: Track[];
        try {
          if (!provider.isAvailable(providerCtx, seed)) continue;
          candidates = await raceAbort(provider.recommend(providerCtx, seed), providerSignal);
        } catch (err) {
          attempt.outcome = 'error';
          ctx.logger.warn({ err: safeError(err), provider: provider.id }, 'Discovery provider failed');
          continue;
        }

        attempt.raw = candidates.length;
        let kept = filterCandidates(candidates, {
          minDurationMs: this.config.minDurationMs,
          maxDurationMs: this.config.maxDurationMs,
          blocked,
        });
        if (!provider.diversityExempt) kept = diversify(kept, tailArtists, DISCOVERY_MAX_SAME_ARTIST_RUN);
        attempt.kept = kept.length;
        if (kept.length === 0) {
          attempt.outcome = 'empty';
          continue;
        }
        if (kept.length < minResults) {
          attempt.outcome = 'insufficient';
          if (!best || kept.length > best.tracks.length) best = { id: provider.id, tracks: kept };
          continue;
        }
        attempt.outcome = 'ok';
        return { provider: provider.id, tracks: capTracks(kept, limit), attempts };
      }

      if (best) return { provider: best.id, tracks: capTracks(best.tracks, limit), attempts };
      return empty;
    } catch (err) {
      // Defensive: discovery must never take a player down.
      ctx.logger.warn({ err: safeError(err) }, 'Discovery failed');
      return { provider: null, tracks: [], attempts };
    }
  }
}
