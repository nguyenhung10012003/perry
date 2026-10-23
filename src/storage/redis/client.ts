import { Redis } from 'ioredis';
import {
  REDIS_COMMAND_TIMEOUT_MS,
  STORAGE_BACKOFF_MS,
  STORAGE_CONNECT_TIMEOUT_MS,
} from '../../config/constants.js';
import type { Logger } from '../../utils/logger.js';
import { BackendHealth } from '../health.js';

export interface RedisConnection {
  readonly client: Redis;
  readonly health: BackendHealth;
  /** Resolves true once the connection is ready, false after timeoutMs. Never rejects. */
  waitReady(timeoutMs: number): Promise<boolean>;
  /** QUIT with a short cap, then forces the socket closed. Never rejects. */
  close(capMs: number): Promise<void>;
}

/**
 * Creates the ioredis client. It reconnects forever with STORAGE_BACKOFF_MS, fails commands fast while
 * disconnected (no offline queue) and feeds ready/close/error events into BackendHealth.
 * connectionName shows up in `CLIENT LIST` (the web passes perry-web).
 */
export function createRedis(url: string, logger: Logger, connectionName = 'perry-bot'): RedisConnection {
  const client = new Redis(url, {
    connectionName,
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: STORAGE_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    retryStrategy: (times) => STORAGE_BACKOFF_MS[Math.min(times - 1, STORAGE_BACKOFF_MS.length - 1)] ?? 1000,
  });
  const health = new BackendHealth({
    name: 'Redis',
    logger,
    probe: async () => {
      await client.ping();
    },
  });
  // Mandatory: without an 'error' listener ioredis would print every reconnect error to stderr.
  // BackendHealth de-duplicates (one error line per outage, the rest at debug level).
  client.on('error', (err: Error) => health.reportFailure(err));
  client.on('close', () => {
    if (health.isUp) health.markDown(new Error('Connection closed'));
  });
  client.on('ready', () => health.markUp());
  return {
    client,
    health,
    waitReady(timeoutMs) {
      if (client.status === 'ready') return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const done = (value: boolean): void => {
          clearTimeout(timer);
          client.off('ready', onReady);
          resolve(value);
        };
        const onReady = (): void => done(true);
        const timer = setTimeout(() => done(false), timeoutMs);
        client.once('ready', onReady);
      });
    },
    async close(capMs) {
      health.stop();
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          client.quit(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, capMs);
          }),
        ]);
      } catch {
        // QUIT fails when the connection is already gone; disconnect() below handles it.
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        client.disconnect();
      }
    },
  };
}
