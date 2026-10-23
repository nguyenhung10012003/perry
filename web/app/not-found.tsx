import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { loadLocale } from '@/server/pages';
import { getWebMessages } from '@/shared/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getWebMessages(await loadLocale()).meta.notFoundTitle, robots: { index: false } };
}

/** Localized 404 (Next's default page uses inline styles and a <style> element). */
export default async function NotFound() {
  const t = getWebMessages(await loadLocale());
  return (
    <>
      <SiteHeader t={t} />
      <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-24">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="text-3xl font-bold tracking-tight">{t.notFound.title}</h1>
        <p className="text-muted-foreground">{t.notFound.body}</p>
        <Button asChild variant="outline">
          <Link href="/">{t.notFound.home}</Link>
        </Button>
      </main>
    </>
  );
}
