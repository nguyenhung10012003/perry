import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuildIcon } from '@/components/dashboard/GuildIcon';
import { LeaderboardTable } from '@/components/dashboard/LeaderboardTable';
import { Footer } from '@/components/landing/Footer';
import { SiteHeader } from '@/components/site-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadLocale, loadPublicLeaderboard } from '@/server/pages';
import { publicLeaderboardQuerySchema } from '@/shared/api';
import { getWebMessages } from '@/shared/i18n';

interface Props {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = getWebMessages(await loadLocale());
  return { title: t.publicLeaderboard.description, robots: { index: false } };
}

/** Route 6 (DP-5 (b)): the opt-in public leaderboard, server-rendered HTML that works without JavaScript. */
export default async function PublicLeaderboardPage({ params, searchParams }: Props) {
  const locale = await loadLocale();
  const t = getWebMessages(locale);
  const { guildId } = await params;
  const query = publicLeaderboardQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const result = await loadPublicLeaderboard(guildId, query.data.page);
  if ('kind' in result && result.kind === 'not_found') notFound();
  return (
    <>
      <SiteHeader t={t} />
      <main className="mx-auto max-w-4xl px-4 py-10">
        {'ok' in result ? (
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <GuildIcon name={result.board.guild.name} iconUrl={result.board.guild.iconUrl} size={48} />
              <div>
                <CardTitle className="text-xl">{t.publicLeaderboard.title(result.board.guild.name)}</CardTitle>
                <CardDescription>{t.publicLeaderboard.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <LeaderboardTable
                board={result.board}
                t={t}
                locale={locale}
                pageHref={(page) => `/leaderboard/${guildId}?page=${page}`}
                emptyText={t.publicLeaderboard.empty}
              />
            </CardContent>
          </Card>
        ) : (
          <Alert className="mx-auto max-w-xl" data-testid="public-notice">
            <AlertTitle>{result.kind === 'rate_limited' ? t.publicLeaderboard.tooManyTitle : t.unavailable.title}</AlertTitle>
            <AlertDescription>
              {result.kind === 'rate_limited' ? t.publicLeaderboard.tooManyBody : t.publicLeaderboard.unavailableBody}
            </AlertDescription>
          </Alert>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">{t.publicLeaderboard.poweredBy}</p>
      </main>
      <Footer t={t} />
    </>
  );
}
