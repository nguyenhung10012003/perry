'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSession, useT } from '@/components/providers';
import { apiRequest, loginHref } from '@/lib/api-client';
import type { SaveError } from './ErrorBanner';

/** The keys whose values differ (JSON comparison), for PATCH bodies that only carry changed fields. */
export function changedFields<T extends object>(draft: T, initial: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(initial[key])) out[key] = draft[key];
  }
  return out;
}

export interface SectionFormOptions<T> {
  initial: T;
  guildId: string;
  path: string;
  method: 'PATCH' | 'PUT';
  body: (draft: T, initial: T) => unknown;
}

/**
 * Local draft of a dashboard form. Saving sends the body through the API with the CSRF token, shows the sonner toast
 * and refreshes the server-rendered page (the page remounts the form with the stored values). A deleted channel or
 * role in the request refreshes the cached guild data first, so the pickers drop it.
 */
export function useSectionForm<T extends object>(options: SectionFormOptions<T>) {
  const { t } = useT();
  const { csrfToken } = useSession();
  const router = useRouter();
  const [draft, setDraft] = useState<T>(options.initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(options.initial);

  const set = <K extends keyof T>(key: K, value: T[K]): void => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    const result = await apiRequest(options.path, {
      method: options.method,
      body: options.body(draft, options.initial),
      csrfToken,
    });
    setSaving(false);
    if (result.ok) {
      toast.success(t.dashboard.saved);
      router.refresh();
      return;
    }
    if (result.status === 401) {
      window.location.href = loginHref();
      return;
    }
    const stale =
      result.error?.issues?.some((issue) => issue.code === 'unknown_channel' || issue.code === 'unknown_role') ?? false;
    if (stale) {
      await apiRequest(`/api/guilds/${options.guildId}/discord?refresh=1`);
      router.refresh();
    }
    setError({ body: result.error, stale });
  };

  const discard = (): void => {
    setDraft(options.initial);
    setError(null);
  };

  return { draft, setDraft, set, dirty, saving, error, save: () => void save(), discard };
}
