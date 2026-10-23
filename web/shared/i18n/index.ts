import { FALLBACK_LOCALE, isLocale, LOCALE_NAMES, LOCALES } from '../../../src/i18n/locales.js';
import type { Locale } from '../../../src/i18n/locales.js';
import { en } from './en.js';
import type { WebMessages } from './en.js';
import { vi } from './vi.js';

export { en, vi, FALLBACK_LOCALE, isLocale, LOCALE_NAMES, LOCALES };
export type { Locale, WebMessages };

/** Name of the language cookie (not HttpOnly: the language switch only links to ?lang=). */
export const LANG_COOKIE = 'perry_lang';

const CATALOG: Record<Locale, WebMessages> = { en, vi };

export function getWebMessages(locale: Locale): WebMessages {
  return CATALOG[locale];
}

/** The supported locale of an Accept-Language header with the highest weight, or undefined. */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(',')
    .slice(0, 20)
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { primary: tag.trim().toLowerCase().split('-')[0] ?? '', q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((entry) => entry.primary).find(isLocale);
}

export interface LocaleInputs {
  query?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
  defaultLocale?: string | null;
}

/** W1: ?lang, then the perry_lang cookie, then Accept-Language, then DEFAULT_LOCALE, then English. */
export function negotiateLocale(inputs: LocaleInputs): Locale {
  if (isLocale(inputs.query)) return inputs.query;
  if (isLocale(inputs.cookie)) return inputs.cookie;
  const accepted = localeFromAcceptLanguage(inputs.acceptLanguage);
  if (accepted !== undefined) return accepted;
  if (isLocale(inputs.defaultLocale)) return inputs.defaultLocale;
  return FALLBACK_LOCALE;
}
