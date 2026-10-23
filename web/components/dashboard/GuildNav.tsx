'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/components/providers';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SECTIONS = ['general', 'moderation', 'leveling', 'automod', 'leaderboard'] as const;

/** The guild pages as tabs styled as navigation links. */
export function GuildNav({ guildId }: { guildId: string }) {
  const { t } = useT();
  const pathname = usePathname();
  const base = `/dashboard/${guildId}`;
  const href = (section: (typeof SECTIONS)[number]) => (section === 'general' ? base : `${base}/${section}`);
  const active = SECTIONS.find((section) => section !== 'general' && pathname.startsWith(`${base}/${section}`)) ?? 'general';
  return (
    <Tabs value={active}>
      <TabsList className="h-auto flex-wrap">
        {SECTIONS.map((section) => (
          <TabsTrigger key={section} value={section} asChild>
            <Link href={href(section)} aria-current={section === active ? 'page' : undefined}>
              {t.dashboard.tabs[section]}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
