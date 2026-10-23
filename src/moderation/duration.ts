import { MOD_TIMEOUT_MAX_MS } from '../config/constants.js';

const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
} as const;

type Unit = keyof typeof UNIT_MS;

/** One or more `<number><unit>` parts (`1h30m`, `1h 30m`), units s, m, h, d, w (A6). */
const DURATION_RE = /^(?:\d+\s*[smhdw]\s*)+$/;
const PART_RE = /(\d+)\s*([smhdw])/g;

export type DurationResult = { ok: true; ms: number } | { ok: false; reason: 'invalidDuration' | 'durationTooLong' };

/** Parses a timeout duration from 1 s to 28 days. The units are the same in every language. */
export function parseDuration(text: string): DurationResult {
  const input = text.trim().toLowerCase();
  if (!DURATION_RE.test(input)) return { ok: false, reason: 'invalidDuration' };
  let ms = 0;
  for (const [, amount, unit] of input.matchAll(PART_RE)) {
    ms += Number(amount) * UNIT_MS[unit as Unit];
  }
  if (!Number.isFinite(ms) || ms > MOD_TIMEOUT_MAX_MS) return { ok: false, reason: 'durationTooLong' };
  if (ms < UNIT_MS.s) return { ok: false, reason: 'invalidDuration' };
  return { ok: true, ms };
}

/** Compact duration such as `1d 2h 30m` (days are the largest unit; zero parts are left out). */
export function formatDuration(ms: number): string {
  let rest = Math.max(0, Math.floor(ms / 1000));
  const parts: string[] = [];
  for (const [unit, size] of [
    ['d', 86_400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const amount = Math.floor(rest / size);
    rest -= amount * size;
    if (amount > 0) parts.push(`${amount}${unit}`);
  }
  return parts.length > 0 ? parts.join(' ') : '0s';
}
