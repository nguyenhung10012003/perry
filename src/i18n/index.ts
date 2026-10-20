import { Locale as DiscordLocale } from 'discord.js';
import type { LocaleString, LocalizationMap } from 'discord.js';
import { en } from './en.js';
import type { Messages } from './en.js';
import type { Locale } from './locales.js';
import { vi } from './vi.js';

export { FALLBACK_LOCALE, LOCALE_NAMES, LOCALES, isLocale } from './locales.js';
export type { Locale } from './locales.js';
export type { Messages } from './en.js';
export { en, vi };

const CATALOG: Record<Locale, Messages> = { en, vi };

/** Discord locale used for each non-English catalog in command metadata localizations. */
const DISCORD_LOCALES: Record<Exclude<Locale, 'en'>, LocaleString> = {
  vi: DiscordLocale.Vietnamese,
};

/** Returns the catalog for a locale; null or an unknown value falls back to English. */
export function getMessages(locale: Locale | null | undefined): Messages {
  if (typeof locale === 'string' && Object.hasOwn(CATALOG, locale)) return CATALOG[locale];
  return en;
}

/** Effective locale of a guild: its own setting, otherwise the configured DEFAULT_LOCALE. */
export function resolveLocale(guildLanguage: Locale | null | undefined, defaultLocale: Locale): Locale {
  return guildLanguage ?? defaultLocale;
}

/** Builds a Discord localization map with the selected text of every non-English catalog. */
export function localizations(select: (m: Messages) => string): LocalizationMap {
  const map: LocalizationMap = {};
  for (const [locale, discordLocale] of Object.entries(DISCORD_LOCALES) as [Exclude<Locale, 'en'>, LocaleString][]) {
    map[discordLocale] = select(CATALOG[locale]);
  }
  return map;
}

/** Description of a serialized command in the given locale (falls back to the English default). */
export function commandDescription(
  json: { description: string; description_localizations?: LocalizationMap | null },
  locale: Locale,
): string {
  if (locale === 'en') return json.description;
  return json.description_localizations?.[DISCORD_LOCALES[locale]] ?? json.description;
}
