'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';

/** Drops the cached channels and roles (GET .../discord?refresh=1) and renders the page again. */
export function RefreshButton({ guildId }: { guildId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const refresh = async (): Promise<void> => {
    setBusy(true);
    const result = await apiRequest(`/api/guilds/${guildId}/discord?refresh=1`);
    setBusy(false);
    if (!result.ok) toast.error(result.error === null ? t.errors.network : t.errors.codes[result.error.error]);
    router.refresh();
  };
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
      <RefreshCwIcon data-icon="inline-start" />
      {t.dashboard.refresh}
    </Button>
  );
}
