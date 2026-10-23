import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { safeError } from '../../utils/safe-error.js';
import type { Logger } from '../../utils/logger.js';
import type { BackendHealth } from '../health.js';

export interface SettingsPublisher {
  /** Tells bot processes to drop their local copy of a guild's settings. Fire and forget. */
  publish(guildId: string): void;
}

/**
 * Publish-only side of the settings invalidation channel, for processes that never subscribe (the web). Uses the
 * same `<instanceId>:<guildId>` format, so subscribed bots drop their L1 entry at once (PUBSUB_INVALIDATION=true).
 */
export function createSettingsPublisher(client: Redis, health: BackendHealth, channel: string): SettingsPublisher {
  const instanceId = randomUUID();
  return {
    publish(guildId) {
      void health.attempt(() => client.publish(channel, `${instanceId}:${guildId}`));
    },
  };
}

export interface ChannelSubscription {
  close(): void;
}

/**
 * Subscribes to one pub/sub channel on a duplicated connection (a subscribed connection cannot run other
 * commands). The duplicate queues its SUBSCRIBE until it is connected and re-subscribes after reconnects.
 */
export function createChannelSubscriber(
  client: Redis,
  channel: string,
  logger: Logger,
  onMessage: (payload: string) => void,
): ChannelSubscription {
  const subscriber = client.duplicate({ enableOfflineQueue: true });
  subscriber.on('error', (err: Error) => logger.debug({ err: safeError(err), channel }, 'Subscriber error'));
  subscriber.on('message', (received: string, payload: string) => {
    if (received === channel) onMessage(payload);
  });
  subscriber.subscribe(channel).catch((err: unknown) => {
    logger.warn({ err: safeError(err), channel }, 'Could not subscribe to a Redis channel');
  });
  return {
    close() {
      subscriber.disconnect();
    },
  };
}

export interface SettingsInvalidation {
  /** Tells other bot processes to drop their local copy of a guild's settings. Fire and forget. */
  publish(guildId: string): void;
  close(): void;
}

/**
 * Optional (PUBSUB_INVALIDATION=true): cross-process L1 invalidation on a duplicated connection.
 * Messages look like `<instanceId>:<guildId>`; a process ignores its own.
 */
export function createSettingsInvalidation(
  client: Redis,
  health: BackendHealth,
  channel: string,
  logger: Logger,
  onRemoteInvalidate: (guildId: string) => void,
): SettingsInvalidation {
  const instanceId = randomUUID();
  // The main client has no offline queue; the subscriber must queue its SUBSCRIBE until it is connected.
  const subscriber = client.duplicate({ enableOfflineQueue: true });
  subscriber.on('error', (err: Error) => logger.debug({ err: safeError(err) }, 'Settings invalidation subscriber error'));
  subscriber.on('message', (received: string, payload: string) => {
    if (received !== channel) return;
    const separator = payload.indexOf(':');
    if (separator === -1 || payload.slice(0, separator) === instanceId) return;
    onRemoteInvalidate(payload.slice(separator + 1));
  });
  subscriber.subscribe(channel).catch((err: unknown) => {
    logger.warn({ err: safeError(err) }, 'Could not subscribe to settings invalidation events');
  });
  return {
    publish(guildId) {
      void health.attempt(() => client.publish(channel, `${instanceId}:${guildId}`));
    },
    close() {
      subscriber.disconnect();
    },
  };
}
