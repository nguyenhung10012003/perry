import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { LanguageSwitch } from '@/components/dashboard/LanguageSwitch';
import type { WebMessages } from '@/shared/i18n';

/** Top bar of every page: the Perry mark, an optional dashboard link, the language switch and page-specific actions. */
export function SiteHeader({ t, dashboardLink = true, children }: { t: WebMessages; dashboardLink?: boolean; children?: ReactNode }) {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image src="/favicon.svg" alt="" width={28} height={28} className="rounded-md" />
          <span>{t.meta.siteName}</span>
        </Link>
        {dashboardLink ? (
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            {t.nav.dashboard}
          </Link>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <Suspense fallback={null}>
            <LanguageSwitch />
          </Suspense>
          {children}
        </div>
      </div>
    </header>
  );
}
