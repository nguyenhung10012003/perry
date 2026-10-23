import type { WebMessages } from '@/shared/i18n';

export function Footer({ t }: { t: WebMessages }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground">
        <span>© Perry</span>
        <span>{t.landing.footer}</span>
      </div>
    </footer>
  );
}
