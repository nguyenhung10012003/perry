import { LayoutDashboardIcon, MusicIcon, ShieldCheckIcon, TrophyIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WebMessages } from '@/shared/i18n';

const ICONS: Record<keyof WebMessages['landing']['features'], LucideIcon> = {
  music: MusicIcon,
  moderation: ShieldCheckIcon,
  leveling: TrophyIcon,
  dashboard: LayoutDashboardIcon,
};

export function Features({ t }: { t: WebMessages }) {
  const keys = Object.keys(ICONS) as (keyof typeof ICONS)[];
  return (
    <section className="border-y bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">{t.landing.featuresTitle}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keys.map((key) => {
            const Icon = ICONS[key];
            const feature = t.landing.features[key];
            return (
              <Card key={key}>
                <CardHeader>
                  <Icon aria-hidden className="mb-2 size-6 text-primary" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.body}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Steps({ t }: { t: WebMessages }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">{t.landing.stepsTitle}</h2>
      <ol className="grid gap-4 md:grid-cols-3">
        {t.landing.steps.map((step, index) => (
          <li key={step} className="flex gap-3 rounded-xl border p-4">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="pt-1 text-sm">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
