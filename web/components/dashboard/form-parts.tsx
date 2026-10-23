'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** A labelled form row with an optional help text. */
export function Field({ id, label, help, children }: { id: string; label: string; help?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {help !== undefined ? <p className="text-sm text-muted-foreground">{help}</p> : null}
    </div>
  );
}

/** A switch with its label and help text on one row. */
export function SwitchField({
  id,
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="grid gap-1">
        <Label htmlFor={id}>{label}</Label>
        {help !== undefined ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
