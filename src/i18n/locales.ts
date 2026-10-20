/** Supported bot languages. Kept free of message tables so config/settings/storage can import it cheaply. */
export const LOCALES = ['en', 'vi'] as const;

export type Locale = (typeof LOCALES)[number];

/** Used when neither the guild nor DEFAULT_LOCALE selects a language. */
export const FALLBACK_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Autonyms, shown identically in every locale. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
};
