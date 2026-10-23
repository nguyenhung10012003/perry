import 'server-only';
import { LANG_COOKIE } from '../shared/i18n/index.js';

export interface CookieNames {
  session: string;
  oauth: string;
  lang: string;
}

/** https PUBLIC_URL: `__Host-` names (Secure, Path=/, no Domain); http://localhost development: plain names. */
export function cookieNames(secure: boolean): CookieNames {
  return secure
    ? { session: '__Host-perry_sid', oauth: '__Host-perry_oauth', lang: LANG_COOKIE }
    : { session: 'perry_sid', oauth: 'perry_oauth', lang: LANG_COOKIE };
}

/** Parses a Cookie header. The first value of a repeated name wins; malformed pairs are skipped. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    if (name === '' || cookies.has(name)) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Not percent-decodable: ignore the cookie.
    }
  }
  return cookies;
}

export interface CookieOptions {
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
}

const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/;
const COOKIE_VALUE_RE = /^[A-Za-z0-9_.-]*$/;

/** One Set-Cookie value with Path=/ and SameSite=Lax (the OAuth callback is a top-level navigation from discord.com). */
export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!COOKIE_NAME_RE.test(name.replace(/^__Host-/, ''))) throw new Error('invalid cookie name');
  if (!COOKIE_VALUE_RE.test(value)) throw new Error('invalid cookie value');
  const parts = [`${name}=${value}`, 'Path=/', `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`, 'SameSite=Lax'];
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

/** Expires a cookie (same name, path and flags). */
export function clearCookie(name: string, options: Omit<CookieOptions, 'maxAge'>): string {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
