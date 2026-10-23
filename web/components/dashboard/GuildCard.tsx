import { PlusIcon, SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { GuildListItem } from '@/shared/api';
import type { WebMessages } from '@/shared/i18n';
import { GuildIcon } from './GuildIcon';

/** One server of the server list (W3): configure it when the bot is there, otherwise invite the bot to it. */
export function GuildCard({ guild, t }: { guild: GuildListItem; t: WebMessages }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <GuildIcon name={guild.name} iconUrl={guild.iconUrl} />
        <div className="min-w-0">
          <CardTitle className="truncate">{guild.name}</CardTitle>
          {guild.botPresent ? (
            <Badge variant="secondary" className="mt-1">
              {t.dashboard.botAdded}
            </Badge>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{t.dashboard.notAdded}</p>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {guild.botPresent ? (
          <Button asChild className="w-full">
            <Link href={`/dashboard/${guild.id}`}>
              <SettingsIcon data-icon="inline-start" />
              {t.dashboard.configure}
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <a href={guild.inviteUrl ?? '#'} rel="noopener noreferrer">
              <PlusIcon data-icon="inline-start" />
              {t.dashboard.invite}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
