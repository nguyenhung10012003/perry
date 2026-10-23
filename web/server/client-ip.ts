import 'server-only';
import type { BlockList } from 'node:net';
import { isIP } from 'node:net';

/** `::ffff:127.0.0.1` (IPv4-mapped IPv6, as Node reports IPv4 sockets on dual-stack listeners) -> `127.0.0.1`. */
function normalize(address: string): string {
  const trimmed = address.trim().replace(/^\[(.*)\]$/, '$1');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
  return mapped?.[1] ?? trimmed;
}

/**
 * The client address for rate limits. Next.js fills X-Forwarded-For with the socket address only when the request
 * has none, so the header is walked from the right: entries of trusted proxies (WEB_TRUST_PROXY) are skipped and the
 * first untrusted entry is the client; when every entry is trusted the left-most one is used. An entry that is not an
 * IP address ends the walk and the request is counted under `unknown`.
 */
export function clientIp(headers: { get(name: string): string | null }, trusted: BlockList): string {
  const header = headers.get('x-forwarded-for');
  if (header === null || header.trim() === '') return 'unknown';
  const entries = header.split(',').map(normalize);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index] ?? '';
    const family = isIP(entry);
    if (family === 0) return 'unknown';
    if (!trusted.check(entry, family === 4 ? 'ipv4' : 'ipv6')) return entry;
    if (index === 0) return entry;
  }
  return 'unknown';
}
