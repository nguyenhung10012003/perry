import type { Track } from 'lavalink-client';
import type { FilterName } from './filters.js';

/** Reference to the Now-Playing message of a guild. */
export interface NowPlayingRef {
  messageId: string;
  channelId: string;
  /** True once the buttons were removed (queue ended or player destroyed). */
  ended: boolean;
}

/**
 * Per-guild bot-side music state (timers, Now-Playing message, error batching).
 * Queue/player state itself lives in lavalink-client's Player.
 */
export class GuildMusicState {
  aloneTimer: NodeJS.Timeout | undefined;
  idleTimer: NodeJS.Timeout | undefined;
  npMessage: NowPlayingRef | null = null;
  /** Serialises every send/edit/delete of the Now-Playing message. */
  npQueue: Promise<void> = Promise.resolve();
  lastNpEdit = 0;
  /** A refresh task is already queued (coalesces rapid refresh requests). */
  npRefreshQueued = false;
  /** The missing-permission warning for the text channel was already logged. */
  npPermissionWarned = false;
  errorBatch: string[] = [];
  errorTimer: NodeJS.Timeout | undefined;
  activeFilter: FilterName | null = null;
  /** Active /radio session: refills from this seed whenever the queue ends. In-memory only. */
  radio: { seedKey: string; seedTitle: string; seed: Track } | null = null;
  /** Autoplay found nothing and stays quiet until /play, /radio or /autoplay on re-arms it. */
  autoplayPaused = false;
  /** The "no related tracks" notice was already sent since the last successful refill or re-arm. */
  discoveryNoticeSent = false;
  /** Most recent track a person queued (seed for autoplay mode "seed"). */
  humanSeed: Track | null = null;
  disposed = false;

  constructor(readonly guildId: string) {}

  clearAlone(): void {
    if (this.aloneTimer) clearTimeout(this.aloneTimer);
    this.aloneTimer = undefined;
  }

  clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }

  clearErrorBatch(): void {
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.errorTimer = undefined;
    this.errorBatch = [];
  }

  /** Clears every timer. The Now-Playing reference is kept so a queued cleanup can still edit the message. */
  dispose(): void {
    this.disposed = true;
    this.clearAlone();
    this.clearIdle();
    this.clearErrorBatch();
    this.radio = null;
    this.autoplayPaused = false;
    this.discoveryNoticeSent = false;
    this.humanSeed = null;
  }
}
