import { readFileSync } from 'node:fs';
import { HEARTBEAT_MAX_AGE_MS } from './config/constants.js';

/** Docker HEALTHCHECK: exit 0 when the heartbeat file is fresh, otherwise exit 1 with one line on stderr. */
function check(): string | undefined {
  const path = process.env.HEARTBEAT_FILE;
  if (path === undefined || path.trim() === '') return 'HEARTBEAT_FILE is not set';
  let raw: string;
  try {
    raw = readFileSync(path.trim(), 'utf8');
  } catch {
    return 'heartbeat file is missing or unreadable';
  }
  const timestamp = Number(raw.trim());
  if (raw.trim() === '' || !Number.isFinite(timestamp)) return 'heartbeat file has invalid content';
  const age = Date.now() - timestamp;
  if (age > HEARTBEAT_MAX_AGE_MS) return `heartbeat is stale (${Math.round(age / 1000)}s old)`;
  return undefined;
}

const problem = check();
if (problem !== undefined) {
  process.stderr.write(`unhealthy: ${problem}\n`);
  process.exit(1);
}
process.exit(0);
