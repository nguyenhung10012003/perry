'use client';

import { RefreshCwIcon, ServerCrashIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/providers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export type UnavailableKind = 'storage' | 'schema' | 'bot' | 'discord';

/** The localized "temporarily unavailable" notice of a dashboard page, with a retry button. */
export function Unavailable({ reason }: { reason: UnavailableKind }) {
  const { t } = useT();
  const router = useRouter();
  return (
    <Alert className="mx-auto max-w-xl" data-testid="unavailable">
      <ServerCrashIcon />
      <AlertTitle>{t.unavailable.title}</AlertTitle>
      <AlertDescription>
        <p>{t.unavailable[reason]}</p>
        {reason === 'bot' ? <p>{t.errors.botUnavailableHint}</p> : null}
        <Button className="mt-3" variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCwIcon data-icon="inline-start" />
          {t.unavailable.retry}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
