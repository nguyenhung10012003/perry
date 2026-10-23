import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/components/providers';
import { Toaster } from '@/components/ui/sonner';
import { loadLocale } from '@/server/pages';
import { getWebMessages } from '@/shared/i18n';
import './globals.css';

// Every page depends on the per-request CSP nonce, the locale or the session: nothing is prerendered.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = getWebMessages(await loadLocale());
  return {
    title: t.meta.landingTitle,
    description: t.meta.landingDescription,
    icons: { icon: '/favicon.svg' },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await loadLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <I18nProvider locale={locale}>
          {children}
          <Toaster />
        </I18nProvider>
      </body>
    </html>
  );
}
