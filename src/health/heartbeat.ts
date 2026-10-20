import { rmSync, writeFileSync, renameSync } from 'node:fs';
import { HEARTBEAT_INTERVAL_MS } from '../config/constants.js';
import { safeError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

/**
 * Container healthcheck source: writes the current timestamp to `path` every `intervalMs` while the gateway
 * client is ready (write-temp-then-rename, so the reader never sees a partial file). No port is opened.
 * Returns a function that stops the timer and removes the file.
 */
export function startHeartbeat(
  client: { isReady(): boolean },
  path: string | undefined,
  logger: Logger,
  intervalMs: number = HEARTBEAT_INTERVAL_MS,
): () => void {
  if (path === undefined) return () => undefined;
  const tempPath = `${path}.tmp`;
  let warned = false;

  const beat = (): void => {
    if (!client.isReady()) return;
    try {
      writeFileSync(tempPath, String(Date.now()));
      renameSync(tempPath, path);
    } catch (err) {
      if (!warned) {
        warned = true;
        logger.warn({ err: safeError(err) }, 'Heartbeat file could not be written');
      }
    }
  };

  const timer = setInterval(beat, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
    rmSync(path, { force: true });
    rmSync(tempPath, { force: true });
  };
}
