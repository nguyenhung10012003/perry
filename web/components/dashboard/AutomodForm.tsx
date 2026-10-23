'use client';

import { InfoIcon, ShieldAlertIcon } from 'lucide-react';
import { useT } from '@/components/providers';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AUTOMOD_EXEMPT_CHANNELS_MAX,
  AUTOMOD_EXEMPT_ROLES_MAX,
  AUTOMOD_KEYWORD_ALLOW_MAX,
  AUTOMOD_KEYWORDS_MAX,
  AUTOMOD_KINDS,
  AUTOMOD_MENTION_LIMIT_MAX,
  AUTOMOD_PRESET_ALLOW_MAX,
  AUTOMOD_TIMEOUT_MAX_SECONDS,
  automodBodySchemas,
} from '@/shared/api';
import type { AutomodKind, AutomodList, GuildMeta } from '@/shared/api';
import { CHANNEL_TYPES, POSTABLE_CHANNEL_TYPES } from '@/shared/discord';
import { ErrorBanner } from './ErrorBanner';
import { Field, SwitchField } from './form-parts';
import { IdPicker, MultiPicker, useChannelOptions, useRoleOptions } from './pickers';
import { SaveBar } from './SaveBar';
import { useSectionForm } from './use-section-form';

/** One draft shape for every rule kind; toBody keeps the fields of the kind. Word lists are edited one per line. */
interface AutomodDraft {
  enabled: boolean;
  keywords: string;
  allowList: string;
  alertChannelId: string | null;
  timeoutSeconds: number;
  exemptRoleIds: string[];
  exemptChannelIds: string[];
  limit: number;
  raidProtection: boolean;
  profanity: boolean;
  sexualContent: boolean;
  slurs: boolean;
}

const lines = (text: string): string[] => [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => line !== ''))];

function toDraft(kind: AutomodKind, list: AutomodList): AutomodDraft {
  const draft: AutomodDraft = {
    enabled: false,
    keywords: '',
    allowList: '',
    alertChannelId: null,
    timeoutSeconds: 0,
    exemptRoleIds: [],
    exemptChannelIds: [],
    limit: 10,
    raidProtection: true,
    profanity: true,
    sexualContent: false,
    slurs: true,
  };
  const rule = list.rules[kind];
  if (rule === null) return draft;
  Object.assign(draft, {
    enabled: rule.enabled,
    alertChannelId: rule.alertChannelId,
    exemptRoleIds: [...rule.exemptRoleIds],
    exemptChannelIds: [...rule.exemptChannelIds],
  });
  if ('timeoutSeconds' in rule) draft.timeoutSeconds = rule.timeoutSeconds;
  if ('keywords' in rule) draft.keywords = rule.keywords.join('\n');
  if ('allowList' in rule) draft.allowList = rule.allowList.join('\n');
  if ('limit' in rule) Object.assign(draft, { limit: rule.limit, raidProtection: rule.raidProtection });
  if ('profanity' in rule) Object.assign(draft, { profanity: rule.profanity, sexualContent: rule.sexualContent, slurs: rule.slurs });
  return draft;
}

function toBody(kind: AutomodKind, d: AutomodDraft): unknown {
  const common = {
    enabled: d.enabled,
    alertChannelId: d.alertChannelId,
    exemptRoleIds: d.exemptRoleIds,
    exemptChannelIds: d.exemptChannelIds,
  };
  switch (kind) {
    case 'keywords':
      return { ...common, keywords: lines(d.keywords), allowList: lines(d.allowList), timeoutSeconds: d.timeoutSeconds };
    case 'invites':
      return { ...common, timeoutSeconds: d.timeoutSeconds };
    case 'mentions':
      return { ...common, limit: d.limit, raidProtection: d.raidProtection, timeoutSeconds: d.timeoutSeconds };
    case 'presets':
      return { ...common, profanity: d.profanity, sexualContent: d.sexualContent, slurs: d.slurs, allowList: lines(d.allowList) };
  }
}

const ALERT = { types: POSTABLE_CHANNEL_TYPES };
const ANY_CHANNEL = { types: Object.values(CHANNEL_TYPES) };

function RuleCard({ kind, guildId, list, meta }: { kind: AutomodKind; guildId: string; list: AutomodList; meta: GuildMeta }) {
  const { t } = useT();
  const a = t.dashboard.automod;
  const initial = toDraft(kind, list);
  const form = useSectionForm({
    initial,
    guildId,
    path: `/api/guilds/${guildId}/automod/${kind}`,
    method: 'PUT',
    body: (draft) => toBody(kind, draft),
  });
  const alertChannels = useChannelOptions(meta, ALERT);
  const channels = useChannelOptions(meta, ANY_CHANNEL);
  const roles = useRoleOptions(meta, guildId, { excludeEveryone: true });
  const { draft, set } = form;
  const valid = automodBodySchemas[kind].safeParse(toBody(kind, draft)).success;
  const rule = list.rules[kind];
  const id = (field: string) => `${kind}-${field}`;
  const allowMax = kind === 'presets' ? AUTOMOD_PRESET_ALLOW_MAX : AUTOMOD_KEYWORD_ALLOW_MAX;
  const disabled = !list.available;
  return (
    <Card data-testid={`automod-${kind}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{a.kinds[kind].title}</CardTitle>
          <Badge variant={rule === null ? 'outline' : rule.enabled ? 'default' : 'secondary'}>
            {rule === null ? a.notCreated : rule.enabled ? a.active : a.disabled}
          </Badge>
        </div>
        <CardDescription>{a.kinds[kind].description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {form.error !== null ? (
          <ErrorBanner
            error={form.error}
            labels={{
              keywords: a.keywords,
              allowList: a.allowList,
              alertChannelId: a.alertChannel,
              timeoutSeconds: a.timeout,
              exemptRoleIds: a.exemptRoles,
              exemptChannelIds: a.exemptChannels,
              limit: a.mentionLimit,
            }}
          />
        ) : null}
        <SwitchField id={id('enabled')} label={a.enabled} checked={draft.enabled} onChange={(v) => set('enabled', v)} disabled={disabled} />
        {kind === 'keywords' ? (
          <Field id={id('keywords')} label={a.keywords} help={a.counter(lines(draft.keywords).length, AUTOMOD_KEYWORDS_MAX)}>
            <Textarea id={id('keywords')} rows={5} value={draft.keywords} onChange={(e) => set('keywords', e.target.value)} disabled={disabled} />
          </Field>
        ) : null}
        {kind === 'mentions' ? (
          <div className="grid gap-5 md:grid-cols-2">
            <Field id={id('limit')} label={a.mentionLimit}>
              <Input
                id={id('limit')}
                type="number"
                min={1}
                max={AUTOMOD_MENTION_LIMIT_MAX}
                value={Number.isFinite(draft.limit) ? draft.limit : ''}
                onChange={(e) => set('limit', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                disabled={disabled}
              />
            </Field>
            <SwitchField
              id={id('raidProtection')}
              label={a.raidProtection}
              checked={draft.raidProtection}
              onChange={(v) => set('raidProtection', v)}
              disabled={disabled}
            />
          </div>
        ) : null}
        {kind === 'presets' ? (
          <div className="grid gap-3 md:grid-cols-3">
            <SwitchField id={id('profanity')} label={a.profanity} checked={draft.profanity} onChange={(v) => set('profanity', v)} disabled={disabled} />
            <SwitchField
              id={id('sexualContent')}
              label={a.sexualContent}
              checked={draft.sexualContent}
              onChange={(v) => set('sexualContent', v)}
              disabled={disabled}
            />
            <SwitchField id={id('slurs')} label={a.slurs} checked={draft.slurs} onChange={(v) => set('slurs', v)} disabled={disabled} />
          </div>
        ) : null}
        {kind === 'keywords' || kind === 'presets' ? (
          <Field id={id('allowList')} label={a.allowList} help={a.counter(lines(draft.allowList).length, allowMax)}>
            <Textarea id={id('allowList')} rows={3} value={draft.allowList} onChange={(e) => set('allowList', e.target.value)} disabled={disabled} />
          </Field>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2">
          <Field id={id('alertChannelId')} label={a.alertChannel} help={a.alertChannelHelp}>
            <IdPicker
              id={id('alertChannelId')}
              value={draft.alertChannelId}
              onChange={(v) => set('alertChannelId', v)}
              options={alertChannels}
              noneLabel={a.alertChannelNone}
              disabled={disabled}
            />
          </Field>
          {kind !== 'presets' ? (
            <Field id={id('timeoutSeconds')} label={a.timeout} help={a.timeoutHelp}>
              <Input
                id={id('timeoutSeconds')}
                type="number"
                min={0}
                max={AUTOMOD_TIMEOUT_MAX_SECONDS}
                value={Number.isFinite(draft.timeoutSeconds) ? draft.timeoutSeconds : ''}
                onChange={(e) => set('timeoutSeconds', e.target.value === '' ? Number.NaN : Number(e.target.value))}
                disabled={disabled}
              />
            </Field>
          ) : null}
          <Field id={id('exemptRoleIds')} label={a.exemptRoles}>
            <MultiPicker
              id={id('exemptRoleIds')}
              values={draft.exemptRoleIds}
              onChange={(v) => set('exemptRoleIds', v)}
              options={roles}
              max={AUTOMOD_EXEMPT_ROLES_MAX}
            />
          </Field>
          <Field id={id('exemptChannelIds')} label={a.exemptChannels}>
            <MultiPicker
              id={id('exemptChannelIds')}
              values={draft.exemptChannelIds}
              onChange={(v) => set('exemptChannelIds', v)}
              options={channels}
              max={AUTOMOD_EXEMPT_CHANNELS_MAX}
            />
          </Field>
        </div>
        <SaveBar dirty={form.dirty && valid && !disabled} saving={form.saving} onSave={form.save} onDiscard={form.discard} label={a.save} />
      </CardContent>
    </Card>
  );
}

/** AutoMod page (DP-1 (b)): one card per Perry rule kind. Unavailable while the bot lacks Manage Server. */
export function AutomodForm({ guildId, list, meta }: { guildId: string; list: AutomodList; meta: GuildMeta }) {
  const { t } = useT();
  const a = t.dashboard.automod;
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="text-xl font-semibold">{a.title}</h2>
        <p className="text-sm text-muted-foreground">{a.description}</p>
      </div>
      {!list.available ? (
        <Alert variant="destructive">
          <ShieldAlertIcon />
          <AlertDescription>{a.unavailable}</AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        <InfoIcon />
        <AlertDescription>{a.limitNote}</AlertDescription>
      </Alert>
      {AUTOMOD_KINDS.map((kind) => (
        <RuleCard key={`${kind}:${JSON.stringify(list.rules[kind])}`} kind={kind} guildId={guildId} list={list} meta={meta} />
      ))}
    </div>
  );
}
