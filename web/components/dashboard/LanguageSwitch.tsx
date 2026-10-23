'use client';

import { LanguagesIcon } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useT } from '@/components/providers';
import { LOCALE_NAMES, LOCALES } from '@/shared/i18n';

/**
 * Links to the current page with ?lang=: the proxy sets the perry_lang cookie and the page renders again on the
 * server in that language. Plain links, so it also works without JavaScript.
 */
export function LanguageSwitch() {
  const { locale, t } = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = (lang: string): string => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('login');
    params.set('lang', lang);
    return `${pathname}?${params.toString()}`;
  };
  return (
    <nav aria-label={t.nav.language} className="flex items-center gap-1 text-sm">
      <LanguagesIcon aria-hidden className="size-4 text-muted-foreground" />
      {LOCALES.map((lang) => (
        <a
          key={lang}
          href={href(lang)}
          lang={lang}
          hrefLang={lang}
          aria-current={lang === locale ? 'true' : undefined}
          className={
            lang === locale
              ? 'rounded-md px-2 py-1 font-semibold text-foreground'
              : 'rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground'
          }
        >
          {LOCALE_NAMES[lang]}
        </a>
      ))}
    </nav>
  );
}
