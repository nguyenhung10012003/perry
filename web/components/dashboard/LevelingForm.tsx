'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { useT } from '@/components/providers';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XP_IGNORED_MAX, XP_MULTIPLIER_MAX_PERCENT, XP_MULTIPLIER_MIN_PERCENT } from '@/shared/api';
import type { GuildMeta, LevelingSettings } from '@/shared/api';
import { CHANNEL_TYPES, POSTABLE_CHANNEL_TYPES } from '@/shared/discord';
import { ErrorBanner } from './ErrorBanner';
import { Field, SwitchField } from './form-parts';
import { IdPicker, MultiPicker, useChannelOptions, useRoleOptions } from './pickers';
import { SaveBar } from './SaveBar';
import { changedFields, useSectionForm } from './use-section-form';

const POSTABLE = { types: POSTABLE_CHANNEL_TYPES, requirePost: true };
const IGNORABLE = { types: Object.values(CHANNEL_TYPES) };
const LEVEL_UP_MODES = ['off', 'current', 'channel', 'dm'] as const;
const REWARD_MODES = ['stack', 'highest'] as const;

/** Leveling settings (W4, G7); the role rewards are saved separately by RewardTable. */
export function LevelingForm({
  guildId,
  initial,
  meta,
  publicUrl,
}: {
  guildId: string;
  initial: LevelingSettings;
  meta: GuildMeta;
  publicUrl: string;
}) {
  const { t } = useT();
  const l = t.dashboard.leveling;
  const form = useSectionForm({
    initial,
    guildId,
    path: `/api/guilds/${guildId}/leveling`,
    method: 'PATCH',
    body: changedFields,
  });
  const postable = useChannelOptions(meta, POSTABLE);
  const ignorable = useChannelOptions(meta, IGNORABLE);
  const roles = useRoleOptions(meta, guildId, { excludeEveryone: true });
  const { draft, set } = form;
  const multiplierValid =
    Number.isInteger(draft.xpMultiplierPercent) &&
    draft.xpMultiplierPercent >= XP_MULTIPLIER_MIN_PERCENT &&
    draft.xpMultiplierPercent <= XP_MULTIPLIER_MAX_PERCENT;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{l.title}</CardTitle>
        <CardDescription>{l.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {form.error !== null ? (
          <ErrorBanner
            error={form.error}
            labels={{
              xpMultiplierPercent: l.multiplier,
              levelUpChannelId: l.levelUpChannel,
              xpIgnoredChannelIds: l.ignoredChannels,
              xpIgnoredRoleIds: l.ignoredRoles,
            }}
          />
        ) : null}
        <SwitchField
          id="levelingEnabled"
          label={l.enabled}
          help={l.enabledHelp}
          checked={draft.levelingEnabled}
          onChange={(value) => set('levelingEnabled', value)}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Field id="xpMultiplierPercent" label={l.multiplier} help={l.multiplierHelp(XP_MULTIPLIER_MIN_PERCENT, XP_MULTIPLIER_MAX_PERCENT)}>
            <Input
              id="xpMultiplierPercent"
              type="number"
              inputMode="numeric"
              min={XP_MULTIPLIER_MIN_PERCENT}
              max={XP_MULTIPLIER_MAX_PERCENT}
              step={10}
              value={Number.isFinite(draft.xpMultiplierPercent) ? draft.xpMultiplierPercent : ''}
              aria-invalid={!multiplierValid}
              onChange={(event) =>
                set('xpMultiplierPercent', event.target.value === '' ? Number.NaN : Number(event.target.value))
              }
            />
          </Field>
          <Field id="levelRewardMode" label={l.rewardMode}>
            <Select value={draft.levelRewardMode} onValueChange={(value) => set('levelRewardMode', value as LevelingSettings['levelRewardMode'])}>
              <SelectTrigger id="levelRewardMode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REWARD_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {l.rewardModes[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="levelUpMode" label={l.levelUpMode}>
            <Select value={draft.levelUpMode} onValueChange={(value) => set('levelUpMode', value as LevelingSettings['levelUpMode'])}>
              <SelectTrigger id="levelUpMode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_UP_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {l.levelUpModes[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="levelUpChannelId" label={l.levelUpChannel} help={l.levelUpChannelHelp}>
            <IdPicker
              id="levelUpChannelId"
              value={draft.levelUpChannelId}
              onChange={(value) => set('levelUpChannelId', value)}
              options={postable}
              noneLabel={l.levelUpChannelNone}
            />
          </Field>
          <Field id="xpIgnoredChannelIds" label={l.ignoredChannels} help={l.ignoredChannelsHelp(XP_IGNORED_MAX)}>
            <MultiPicker
              id="xpIgnoredChannelIds"
              values={draft.xpIgnoredChannelIds}
              onChange={(values) => set('xpIgnoredChannelIds', values)}
              options={ignorable}
              max={XP_IGNORED_MAX}
            />
          </Field>
          <Field id="xpIgnoredRoleIds" label={l.ignoredRoles} help={l.ignoredRolesHelp(XP_IGNORED_MAX)}>
            <MultiPicker
              id="xpIgnoredRoleIds"
              values={draft.xpIgnoredRoleIds}
              onChange={(values) => set('xpIgnoredRoleIds', values)}
              options={roles}
              max={XP_IGNORED_MAX}
            />
          </Field>
        </div>
        <SwitchField
          id="leaderboardPublic"
          label={l.leaderboardPublic}
          help={l.leaderboardPublicHelp}
          checked={draft.leaderboardPublic}
          onChange={(value) => set('leaderboardPublic', value)}
        />
        {initial.leaderboardPublic ? (
          <a
            href={`${publicUrl}/leaderboard/${guildId}`}
            className="flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            {l.publicLink}
            <ExternalLinkIcon aria-hidden className="size-3.5" />
          </a>
        ) : null}
        <SaveBar dirty={form.dirty && multiplierValid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
      </CardContent>
    </Card>
  );
}
