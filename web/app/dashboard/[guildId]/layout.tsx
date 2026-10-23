import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { GuildIcon } from '@/components/dashboard/GuildIcon';
import { GuildNav } from '@/components/dashboard/GuildNav';
import { RefreshButton } from '@/components/dashboard/RefreshButton';
import { loadGuildPage, loadLocale } from '@/server/pages';
import { guildIconUrl } from '@/shared/discord';
import { getWebMessages } from '@/shared/i18n';

/** Guild header and tab navigation. Every page below runs the guild check itself (loadGuildPage is cached). */
export default async function GuildLayout({ children, params }: { children: ReactNode; params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const t = getWebMessages(await loadLocale());
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return children;
  const { guild } = page.access;
  return (
    <div className="grid gap-6">
      <Link href="/dashboard" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t.nav.servers}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <GuildIcon name={guild.name} iconUrl={guildIconUrl(guild.id, guild.icon)} size={48} />
        <h1 className="mr-auto text-2xl font-semibold tracking-tight">{guild.name}</h1>
        <RefreshButton guildId={guildId} />
      </div>
      <GuildNav guildId={guildId} />
      {children}
    </div>
  );
}
