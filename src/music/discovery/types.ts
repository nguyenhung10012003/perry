import type { Track } from 'lavalink-client';
import type { DiscoveryProviderId } from '../../config/env.js';
import type { Logger } from '../../utils/logger.js';
import type { MusicService } from '../music-service.js';
import type { Requester } from '../requester.js';

export type ProviderId = DiscoveryProviderId;

export interface DiscoveryContext {
  service: MusicService;
  guildId: string;
  /** Requester stamped on the tracks the providers load (callers re-tag discovered tracks later). */
  requester: Requester;
  /** Aborted when the overall budget is spent or the caller gives up; providers must stop work on it. */
  signal: AbortSignal;
  logger: Logger;
}

export interface RecommendationProvider {
  readonly id: ProviderId;
  /** True when every result is the same artist by construction, so the artist-run diversity rule is skipped. */
  readonly diversityExempt?: boolean;
  /** Cheap, no I/O. False = skipped without a log. */
  isAvailable(ctx: DiscoveryContext, seed: Track): boolean;
  /** Raw candidates (unfiltered). May throw: the engine catches and logs it. */
  recommend(ctx: DiscoveryContext, seed: Track): Promise<Track[]>;
}

export type AttemptOutcome = 'unavailable' | 'error' | 'empty' | 'insufficient' | 'ok';

export interface DiscoveryAttempt {
  id: ProviderId;
  outcome: AttemptOutcome;
  /** Candidates returned by the provider. */
  raw: number;
  /** Candidates left after the filters. */
  kept: number;
}

export interface DiscoveryResult {
  /** Provider the tracks came from; null when nothing usable was found. */
  provider: ProviderId | null;
  /** Clean, filtered, diversified, capped tracks (all of them, not one at a time). */
  tracks: Track[];
  attempts: DiscoveryAttempt[];
}

export interface DiscoverOptions {
  /** Maximum tracks to return. Default: MAX_PLAYLIST_TRACKS and the free queue capacity, whichever is smaller. */
  limit?: number;
  /** Fewer usable tracks than this make a provider "insufficient". Default: DISCOVERY_MIN_RESULTS. */
  minResults?: number;
  /** Extra track keys / title keys that must not come back. */
  exclude?: Iterable<string>;
  /** Skip the recently-played set and the previous-tracks window (only the queue itself is deduplicated). */
  ignoreHistory?: boolean;
  /** Restrict this call to some of the enabled providers (their configured order is kept). */
  providers?: readonly ProviderId[];
}
