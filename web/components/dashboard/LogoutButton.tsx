'use client';

import { LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession, useT } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/api-client';

/** POST /auth/logout with the CSRF token, then back to the landing page. */
export function LogoutButton() {
  const { t } = useT();
  const { csrfToken } = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const logout = async (): Promise<void> => {
    setBusy(true);
    const result = await apiRequest('/auth/logout', { method: 'POST', csrfToken });
    if (result.ok || result.status === 401) {
      router.replace('/');
      router.refresh();
      return;
    }
    setBusy(false);
    toast.error(result.error === null ? t.errors.network : t.errors.codes[result.error.error]);
  };
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void logout()}>
      <LogOutIcon data-icon="inline-start" />
      {t.nav.logout}
    </Button>
  );
}
