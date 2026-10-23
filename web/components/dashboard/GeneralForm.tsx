'use client';

import { useT } from '@/components/providers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MAX_VOLUME } from '@/shared/api';
import type { GeneralSettings, GuildMeta } from '@/shared/api';
import { LOCALE_NAMES, LOCALES } from '@/shared/i18n';
import { ErrorBanner } from './ErrorBanner';
import { Field, SwitchField } from './form-parts';
import { IdPicker, useRoleOptions } from './pickers';
import { SaveBar } from './SaveBar';
import { changedFields, useSectionForm } from './use-section-form';

const DEFAULT_LANGUAGE = 'default';

/** General page (W4): language, DJ role, default volume, autoplay and 24/7. */
export function GeneralForm({ guildId, initial, meta }: { guildId: string; initial: GeneralSettings; meta: GuildMeta }) {
  const { t } = useT();
  const g = t.dashboard.general;
  const form = useSectionForm({
    initial,
    guildId,
    path: `/api/guilds/${guildId}/general`,
    method: 'PATCH',
    body: changedFields,
  });
  const roles = useRoleOptions(meta, guildId, { excludeEveryone: true, disableManaged: true });
  const { draft, set } = form;
  const volumeValid = Number.isInteger(draft.defaultVolume) && draft.defaultVolume >= 0 && draft.defaultVolume <= MAX_VOLUME;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{g.title}</CardTitle>
        <CardDescription>{g.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {form.error !== null ? (
          <ErrorBanner
            error={form.error}
            labels={{ language: g.language, djRoleId: g.djRole, defaultVolume: g.volume, autoplayMode: g.autoplayMode }}
          />
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="language" label={g.language} help={g.languageHelp}>
            <Select
              value={draft.language ?? DEFAULT_LANGUAGE}
              onValueChange={(value) => set('language', value === DEFAULT_LANGUAGE ? null : (value as GeneralSettings['language']))}
            >
              <SelectTrigger id="language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_LANGUAGE}>{g.languageDefault}</SelectItem>
                {LOCALES.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {LOCALE_NAMES[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="djRole" label={g.djRole} help={g.djRoleHelp}>
            <IdPicker id="djRole" value={draft.djRoleId} onChange={(value) => set('djRoleId', value)} options={roles} noneLabel={g.djRoleNone} />
          </Field>
          <Field id="defaultVolume" label={g.volume} help={g.volumeHelp(MAX_VOLUME)}>
            <Input
              id="defaultVolume"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_VOLUME}
              step={1}
              value={Number.isFinite(draft.defaultVolume) ? draft.defaultVolume : ''}
              aria-invalid={!volumeValid}
              onChange={(event) => set('defaultVolume', event.target.value === '' ? Number.NaN : Number(event.target.value))}
            />
          </Field>
          <Field id="autoplayMode" label={g.autoplayMode}>
            <Select value={draft.autoplayMode} onValueChange={(value) => set('autoplayMode', value as GeneralSettings['autoplayMode'])}>
              <SelectTrigger id="autoplayMode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="related">{g.autoplayModes.related}</SelectItem>
                <SelectItem value="seed">{g.autoplayModes.seed}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <SwitchField
          id="autoplayEnabled"
          label={g.autoplay}
          help={g.autoplayHelp}
          checked={draft.autoplayEnabled}
          onChange={(value) => set('autoplayEnabled', value)}
        />
        <SwitchField
          id="twentyFourSeven"
          label={g.twentyFourSeven}
          help={g.twentyFourSevenHelp}
          checked={draft.twentyFourSeven}
          onChange={(value) => set('twentyFourSeven', value)}
        />
        <SaveBar dirty={form.dirty && volumeValid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
      </CardContent>
    </Card>
  );
}
