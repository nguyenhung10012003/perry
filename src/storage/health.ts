import { STORAGE_BACKOFF_MS } from '../config/constants.js';
import { safeError } from '../utils/safe-error.js';
import type { Logger } from '../utils/logger.js';

export type RecoverHook = () => void | Promise<void>;

export interface BackendHealthOptions {
  /** Human readable backend name used in log lines (e.g. "Postgres"). */
  readonly name: string;
  readonly logger: Logger;
  /** Cheap liveness check; must reject when the backend is unusable. */
  readonly probe: () => Promise<void>;
  readonly backoffMs?: readonly number[];
}

/**
 * Tracks whether a backend (Postgres, Redis) is usable.
 *
 * - While down, guard()/attempt() short-circuit without touching the backend.
 * - The first failure of an outage is logged once at error level; later failures at debug.
 * - A probe retries with backoff (STORAGE_BACKOFF_MS) on unref'd timers; recovery logs once at info and
 *   runs the onRecover hooks.
 * It starts "down" (not yet connected) without logging anything; call markUp() when the first connection works.
 */
export class BackendHealth {
  private up = false;
  private outageLogged = false;
  private attempt_ = 0;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;
  private readonly hooks: RecoverHook[] = [];
  private readonly backoff: readonly number[];

  constructor(private readonly options: BackendHealthOptions) {
    this.backoff = options.backoffMs ?? STORAGE_BACKOFF_MS;
  }

  get isUp(): boolean {
    return this.up;
  }

  /** Registers a hook that runs after every recovery from an outage. */
  onRecover(hook: RecoverHook): void {
    this.hooks.push(hook);
  }

  /** Runs op unless the backend is down. Resolves with ok=false (never rejects) on short-circuit or failure. */
  async attempt<T>(op: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (!this.up) return { ok: false };
    try {
      return { ok: true, value: await op() };
    } catch (err) {
      this.markDown(err);
      return { ok: false };
    }
  }

  /** Like attempt() but resolves with the fallback when the backend is down or op failed. */
  async guard<T>(op: () => Promise<T>, fallback: T): Promise<T> {
    const result = await this.attempt(op);
    return result.ok ? result.value : fallback;
  }

  /** The backend answered. Logs once when this ends an outage (or on the very first connection). */
  markUp(): void {
    if (this.up) return;
    this.up = true;
    this.attempt_ = 0;
    this.clearTimer();
    const recovered = this.outageLogged;
    this.outageLogged = false;
    if (recovered) this.options.logger.info(`${this.options.name} recovered`);
    else this.options.logger.info(`${this.options.name} connected`);
    if (recovered) void this.runHooks();
  }

  /**
   * The backend failed. The first failure of an outage logs one error line; repeats are debug.
   * Starts the backoff probe. Pass quiet=true when the cause was already reported with a better message.
   */
  markDown(err: unknown, quiet = false): void {
    const { name, logger } = this.options;
    if (this.stopped) return;
    if (this.outageLogged) {
      logger.debug({ err: safeError(err) }, `${name} still unavailable`);
    } else {
      this.outageLogged = true;
      if (quiet) logger.debug({ err: safeError(err) }, `${name} unavailable`);
      else logger.error({ err: safeError(err) }, `${name} unavailable, degrading to fallback and retrying in the background`);
    }
    this.up = false;
    this.schedule();
  }

  /** Event-driven failures (e.g. ioredis 'error'); same semantics as markDown. */
  reportFailure(err: unknown): void {
    this.markDown(err);
  }

  /** Stops probing. After stop() the health object only short-circuits. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private schedule(): void {
    if (this.stopped || this.timer !== undefined) return;
    const index = Math.min(this.attempt_, this.backoff.length - 1);
    const delay = this.backoff[index] ?? 1000;
    this.attempt_ += 1;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.runProbe();
    }, delay);
    this.timer.unref();
  }

  private async runProbe(): Promise<void> {
    if (this.stopped || this.up) return;
    try {
      await this.options.probe();
      this.markUp();
    } catch (err) {
      this.options.logger.debug({ err: safeError(err) }, `${this.options.name} probe failed`);
      this.schedule();
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async runHooks(): Promise<void> {
    for (const hook of this.hooks) {
      try {
        await hook();
      } catch (err) {
        this.options.logger.warn({ err: safeError(err) }, `${this.options.name} recovery hook failed`);
      }
    }
  }
}
