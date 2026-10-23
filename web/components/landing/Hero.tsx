import { LayoutDashboardIcon, PlusIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WebMessages } from '@/shared/i18n';

export function Hero({ t, inviteUrl, cancelled }: { t: WebMessages; inviteUrl: string; cancelled: boolean }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
      <div className="flex flex-col gap-6">
        {cancelled ? (
          <Alert>
            <AlertDescription>{t.landing.loginCancelled}</AlertDescription>
          </Alert>
        ) : null}
        <Badge variant="secondary" className="w-fit">
          {t.landing.eyebrow}
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">{t.landing.heroTitle}</h1>
        <p className="max-w-xl text-lg text-pretty text-muted-foreground">{t.landing.heroTagline}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href={inviteUrl} rel="noopener noreferrer">
              <PlusIcon data-icon="inline-start" />
              {t.landing.addToDiscord}
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">
              <LayoutDashboardIcon data-icon="inline-start" />
              {t.landing.openDashboard}
            </Link>
          </Button>
        </div>
      </div>
      <Image src="/landing/hero.svg" alt="" width={520} height={400} priority className="mx-auto w-full max-w-md" />
    </section>
  );
}
