'use client';

import { useT } from '@/components/providers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GuildMeta, ModerationSettings } from '@/shared/api';
import { POSTABLE_CHANNEL_TYPES } from '@/shared/discord';
import { ErrorBanner } from './ErrorBanner';
import { Field, SwitchField } from './form-parts';
import { IdPicker, useChannelOptions } from './pickers';
import { SaveBar } from './SaveBar';
import { changedFields, useSectionForm } from './use-section-form';

const POSTABLE = { types: POSTABLE_CHANNEL_TYPES, requirePost: true };

/** Moderation page (W4): mod-log channel and the DM toggle. AutoMod has its own page. */
export function ModerationForm({ guildId, initial, meta }: { guildId: string; initial: ModerationSettings; meta: GuildMeta }) {
  const { t } = useT();
  const m = t.dashboard.moderation;
  const form = useSectionForm({
    initial,
    guildId,
    path: `/api/guilds/${guildId}/moderation`,
    method: 'PATCH',
    body: changedFields,
  });
  const channels = useChannelOptions(meta, POSTABLE);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {form.error !== null ? <ErrorBanner error={form.error} labels={{ modLogChannelId: m.modLog }} /> : null}
        <Field id="modLogChannelId" label={m.modLog} help={m.modLogHelp}>
          <IdPicker
            id="modLogChannelId"
            value={form.draft.modLogChannelId}
            onChange={(value) => form.set('modLogChannelId', value)}
            options={channels}
            noneLabel={m.modLogNone}
          />
        </Field>
        <SwitchField
          id="modDmTarget"
          label={m.modDm}
          help={m.modDmHelp}
          checked={form.draft.modDmTarget}
          onChange={(value) => form.set('modDmTarget', value)}
        />
        <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
      </CardContent>
    </Card>
  );
}
