import { escapeMarkdown } from "discord.js";

/** Formats milliseconds as m:ss or h:mm:ss. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Text progress bar, e.g. `▬▬▬🔘▬▬▬▬▬▬`. */
export function progressBar(
  position: number,
  duration: number,
  size = 14,
): string {
  if (!Number.isFinite(duration) || duration <= 0) return "▬".repeat(size);
  const ratio = Math.min(1, Math.max(0, position / duration));
  const marker = Math.min(size - 1, Math.floor(ratio * size));
  let bar = "";
  for (let i = 0; i < size; i++) bar += i === marker ? "🔘" : "▬";
  return bar;
}

const MAX_TIME_DIGITS = 6;

/**
 * Parses `mm:ss`, `h:mm:ss` or plain seconds into milliseconds. Returns null when invalid.
 */
export function parseTimeInput(input: string): number | null {
  const text = input.trim();
  if (text.length === 0) return null;
  const parts = text.split(":");
  if (parts.length > 3) return null;
  const numbers: number[] = [];
  for (const [index, part] of parts.entries()) {
    // Minutes/seconds after the first segment are 0-59; the first segment is unbounded (but short).
    const maxDigits = index === 0 ? MAX_TIME_DIGITS : 2;
    if (!/^\d+$/.test(part) || part.length > maxDigits) return null;
    numbers.push(Number(part));
  }
  if (numbers.slice(1).some((n) => n > 59)) return null;
  let seconds = 0;
  for (const n of numbers) seconds = seconds * 60 + n;
  return seconds * 1000;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Title that is safe to embed in markdown (escaped and shortened). */
export function safeTitle(title: string, max = 60): string {
  // Brackets would break out of a masked link label, so they are escaped explicitly.
  return escapeMarkdown(truncate(title, max)).replace(
    /[[\]]/g,
    (bracket) => `\\${bracket}`,
  );
}

/** Masked link for http(s) URIs only; otherwise just the safe title. */
export function trackLink(
  title: string,
  uri: string | null | undefined,
  max = 60,
): string {
  const label = safeTitle(title, max);
  if (!uri) return label;
  try {
    const url = new URL(uri);
    if (url.protocol !== "http:" && url.protocol !== "https:") return label;
    return `[${label}](${url.href.replaceAll(")", "%29").replaceAll("(", "%28")})`;
  } catch {
    return label;
  }
}
