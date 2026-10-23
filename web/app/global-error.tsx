'use client';

import { en, vi } from '@/shared/i18n';
import './globals.css';

/**
 * Last-resort error page that replaces the root layout (so no locale is known here): it shows both languages.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-24">
          <h1 className="text-3xl font-bold tracking-tight">{en.error.title}</h1>
          <p className="text-muted-foreground">{en.error.body}</p>
          <p lang="vi" className="text-muted-foreground">
            {vi.error.title}. {vi.error.body}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {en.error.retry} / {vi.error.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
