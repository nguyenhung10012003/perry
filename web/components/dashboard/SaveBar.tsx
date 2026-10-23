'use client';

import { SaveIcon } from 'lucide-react';
import { useT } from '@/components/providers';
import { Button } from '@/components/ui/button';

/** Save and discard buttons of a form; the hint is shown while there are unsaved changes. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  label,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  label?: string;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
      {dirty ? <span className="mr-auto text-sm text-muted-foreground">{t.dashboard.unsaved}</span> : null}
      <Button type="button" variant="ghost" disabled={!dirty || saving} onClick={onDiscard}>
        {t.dashboard.discard}
      </Button>
      <Button type="button" disabled={!dirty || saving} onClick={onSave}>
        <SaveIcon data-icon="inline-start" />
        {saving ? t.dashboard.saving : (label ?? t.dashboard.save)}
      </Button>
    </div>
  );
}
