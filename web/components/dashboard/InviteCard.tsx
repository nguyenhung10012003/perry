import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { WebMessages } from '@/shared/i18n';

/** Shown on a guild page when Perry is not in that guild. */
export function InviteCard({ t, guildName, inviteUrl }: { t: WebMessages; guildName: string; inviteUrl: string }) {
  return (
    <Card className="mx-auto max-w-lg" data-testid="invite-card">
      <CardHeader>
        <CardTitle>{t.dashboard.inviteTitle}</CardTitle>
        <CardDescription>{t.dashboard.inviteBody(guildName)}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <a href={inviteUrl} rel="noopener noreferrer">
            <PlusIcon data-icon="inline-start" />
            {t.dashboard.inviteButton}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
