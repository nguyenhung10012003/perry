import { events } from '../events/index.js';
import { registerRawForwarding } from '../events/raw.js';
import { safeError } from '../utils/errors.js';
import type { BotClient } from './bot-client.js';

/** Binds every event module to the client; handler errors are logged, never thrown. */
export function registerEvents(client: BotClient): void {
  registerRawForwarding(client);
  for (const event of events) {
    const listener = (...args: unknown[]): void => {
      const run = async (): Promise<void> => {
        await (event.execute as (c: BotClient, ...a: unknown[]) => Promise<void> | void)(client, ...args);
      };
      run().catch((err: unknown) => {
        client.logger.error({ err: safeError(err), event: event.name }, 'Event handler failed');
      });
    };
    if (event.once) client.once(event.name, listener);
    else client.on(event.name, listener);
  }
}
