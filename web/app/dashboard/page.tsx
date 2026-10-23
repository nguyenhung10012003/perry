import { GuildCard } from '@/components/dashboard/GuildCard';
import { loadLocale, loadServerList } from '@/server/pages';
import { getWebMessages } from '@/shared/i18n';
import { renderFailure } from './failure';

/** Route 5: the server list (W3): the guilds the user can manage, the ones with Perry first. */
export default async function ServersPage() {
  const t = getWebMessages(await loadLocale());
  const list = await loadServerList();
  if (!('ok' in list)) return renderFailure(list);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t.dashboard.serversTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.dashboard.serversDescription}</p>
      </div>
      {list.guilds.length === 0 ? (
        <p className="text-muted-foreground">{t.dashboard.noServers}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="server-list">
          {list.guilds.map((guild) => (
            <GuildCard key={guild.id} guild={guild} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
