'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo } from 'react';
import { useT } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LEVEL_REWARD_MAX_LEVEL, LEVEL_REWARDS_MAX, rewardsPutSchema } from '@/shared/api';
import type { GuildMeta, Reward } from '@/shared/api';
import { ErrorBanner } from './ErrorBanner';
import { IdPicker, useRoleOptions } from './pickers';
import { SaveBar } from './SaveBar';
import { useSectionForm } from './use-section-form';

interface Row {
  key: number;
  level: number;
  roleId: string | null;
}

const strip = (rows: Row[]) => rows.map(({ level, roleId }) => ({ level, roleId }));

/** Role rewards (G7): one role per level, at most 25, saved as a whole set (PUT .../leveling/rewards). */
export function RewardTable({ guildId, initial, meta }: { guildId: string; initial: Reward[]; meta: GuildMeta }) {
  const { t } = useT();
  const l = t.dashboard.leveling;
  const initialRows = useMemo(() => initial.map((reward, index) => ({ key: index, ...reward })), [initial]);
  const form = useSectionForm<{ rows: Row[] }>({
    initial: { rows: initialRows },
    guildId,
    path: `/api/guilds/${guildId}/leveling/rewards`,
    method: 'PUT',
    body: (draft) => ({ rewards: strip(draft.rows) }),
  });
  const roles = useRoleOptions(meta, guildId, { excludeEveryone: true, disableManaged: true, requireAssignable: true });
  const rows = form.draft.rows;
  const dirty = JSON.stringify(strip(rows)) !== JSON.stringify(strip(initialRows));
  const valid = rewardsPutSchema.safeParse({ rewards: strip(rows) }).success;
  const update = (key: number, patch: Partial<Row>) =>
    form.setDraft({ rows: rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) });
  const add = () => {
    const highest = rows.reduce((max, row) => Math.max(max, Number.isFinite(row.level) ? row.level : 0), 0);
    const key = rows.reduce((max, row) => Math.max(max, row.key), -1) + 1;
    form.setDraft({ rows: [...rows, { key, level: Math.min(highest + 5, LEVEL_REWARD_MAX_LEVEL), roleId: null }] });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{l.rewardsTitle}</CardTitle>
        <CardDescription>{l.rewardsHelp(LEVEL_REWARDS_MAX)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {form.error !== null ? <ErrorBanner error={form.error} labels={{ rewards: l.rewardsTitle }} /> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{l.rewardsEmpty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">{l.rewardLevel}</TableHead>
                <TableHead>{l.rewardRole}</TableHead>
                <TableHead className="w-24 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <Input
                      aria-label={`${l.rewardLevel} ${index + 1}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={LEVEL_REWARD_MAX_LEVEL}
                      value={Number.isFinite(row.level) ? row.level : ''}
                      onChange={(event) =>
                        update(row.key, { level: event.target.value === '' ? Number.NaN : Number(event.target.value) })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <IdPicker
                      id={`reward-role-${row.key}`}
                      value={row.roleId}
                      onChange={(roleId) => update(row.key, { roleId })}
                      options={roles}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => form.setDraft({ rows: rows.filter((other) => other.key !== row.key) })}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      {l.removeReward}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">{l.rewardsCount(rows.length, LEVEL_REWARDS_MAX)}</span>
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= LEVEL_REWARDS_MAX} onClick={add}>
            <PlusIcon data-icon="inline-start" />
            {l.addReward}
          </Button>
        </div>
        <SaveBar dirty={dirty && valid} saving={form.saving} onSave={form.save} onDiscard={form.discard} label={l.saveRewards} />
      </CardContent>
    </Card>
  );
}
