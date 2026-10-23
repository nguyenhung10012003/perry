import { LeaderboardTable } from '@/components/dashboard/LeaderboardTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { leaderboardPage } from '@/server/leaderboard';
import { loadGuildPage, loadLocale, loadPageData } from '@/server/pages';
import { leaderboardQuerySchema } from '@/shared/api';
import { getWebMessages } from '@/shared/i18n';
import { renderFailure } from '../../failure';

interface Props {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Leaderboard page of the dashboard (managers only; the public page is opt-in). */
export default async function GuildLeaderboardPage({ params, searchParams }: Props) {
  const { guildId } = await params;
  const locale = await loadLocale();
  const t = getWebMessages(locale);
  const query = leaderboardQuerySchema.safeParse(await searchParams);
  const requested = query.success ? query.data.page : 1;
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return renderFailure(page);
  const data = await loadPageData(page, () => leaderboardPage(page.deps, guildId, requested));
  if (!('ok' in data)) return renderFailure(data);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.dashboard.leaderboard.title}</CardTitle>
        <CardDescription>{t.dashboard.leaderboard.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <LeaderboardTable
          board={data.value}
          t={t}
          locale={locale}
          pageHref={(p) => `/dashboard/${guildId}/leaderboard?page=${p}`}
          emptyText={t.dashboard.leaderboard.empty}
        />
      </CardContent>
    </Card>
  );
}
