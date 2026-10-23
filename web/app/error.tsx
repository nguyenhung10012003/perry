'use client';

import { useT } from '@/components/providers';
import { Button } from '@/components/ui/button';

/** Localized error boundary of every page (shown for bugs; expected outages render the Unavailable notice). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-24">
      <h1 className="text-3xl font-bold tracking-tight">{t.error.title}</h1>
      <p className="text-muted-foreground">{t.error.body}</p>
      <Button variant="outline" onClick={reset}>
        {t.error.retry}
      </Button>
    </main>
  );
}
