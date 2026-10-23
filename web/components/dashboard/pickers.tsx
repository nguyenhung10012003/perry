'use client';

import {
  ChevronsUpDownIcon,
  FolderIcon,
  HashIcon,
  ImageIcon,
  MegaphoneIcon,
  MessagesSquareIcon,
  MicIcon,
  Volume2Icon,
  XIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { GuildMeta } from '@/shared/api';
import { CHANNEL_TYPES } from '@/shared/discord';

/** One choice of a picker. */
export interface PickerOption {
  id: string;
  name: string;
  group: string;
  disabled?: boolean;
  hint?: string;
  icon?: LucideIcon;
  /** Role color (0 = none). */
  color?: number;
}

const CHANNEL_ICONS: Record<number, LucideIcon> = {
  [CHANNEL_TYPES.text]: HashIcon,
  [CHANNEL_TYPES.voice]: Volume2Icon,
  [CHANNEL_TYPES.category]: FolderIcon,
  [CHANNEL_TYPES.announcement]: MegaphoneIcon,
  [CHANNEL_TYPES.stage]: MicIcon,
  [CHANNEL_TYPES.forum]: MessagesSquareIcon,
  [CHANNEL_TYPES.media]: ImageIcon,
};

export interface ChannelFilter {
  types: readonly number[];
  /** Channels where the bot cannot post embeds are shown disabled, with the reason. */
  requirePost?: boolean;
}

/** Channels grouped by category, in Discord's order. */
export function useChannelOptions(meta: GuildMeta, filter: ChannelFilter): PickerOption[] {
  const { t } = useT();
  return useMemo(() => {
    const categories = new Map(meta.channels.filter((c) => c.type === CHANNEL_TYPES.category).map((c) => [c.id, c]));
    const rank = (channel: GuildMeta['channels'][number]): [number, number] => {
      if (channel.type === CHANNEL_TYPES.category) return [channel.position, -1];
      const parent = channel.parentId === null ? undefined : categories.get(channel.parentId);
      return [parent === undefined ? -1 : parent.position, channel.position];
    };
    return meta.channels
      .filter((channel) => filter.types.includes(channel.type))
      .sort((a, b) => {
        const [ga, pa] = rank(a);
        const [gb, pb] = rank(b);
        return ga - gb || pa - pb;
      })
      .map((channel) => {
        const parent = channel.parentId === null ? undefined : categories.get(channel.parentId);
        const disabled = filter.requirePost === true && !channel.botCanPost;
        return {
          id: channel.id,
          name: channel.name,
          group: channel.type === CHANNEL_TYPES.category ? channel.name : (parent?.name ?? t.dashboard.picker.noCategory),
          disabled,
          hint: disabled ? t.dashboard.picker.cannotPost : undefined,
          icon: CHANNEL_ICONS[channel.type],
        };
      });
  }, [meta, filter.types, filter.requirePost, t]);
}

export interface RoleFilter {
  /** Hide @everyone (always for Perry's settings). */
  excludeEveryone?: boolean;
  /** Managed roles are shown disabled. */
  disableManaged?: boolean;
  /** Roles above the bot's highest role are shown disabled. */
  requireAssignable?: boolean;
}

/** Roles from the highest down. */
export function useRoleOptions(meta: GuildMeta, guildId: string, filter: RoleFilter): PickerOption[] {
  const { t } = useT();
  return useMemo(
    () =>
      meta.roles
        .filter((role) => !(filter.excludeEveryone === true && role.id === guildId))
        .sort((a, b) => b.position - a.position)
        .map((role) => {
          const managed = filter.disableManaged === true && role.managed;
          const notAssignable = filter.requireAssignable === true && !role.assignable;
          return {
            id: role.id,
            name: role.name,
            group: '',
            color: role.color,
            disabled: managed || notAssignable,
            hint: managed ? t.dashboard.picker.managed : notAssignable ? t.dashboard.picker.notAssignable : undefined,
          };
        }),
    [meta, guildId, filter.excludeEveryone, filter.disableManaged, filter.requireAssignable, t],
  );
}

function grouped(options: PickerOption[]): [string, PickerOption[]][] {
  const groups = new Map<string, PickerOption[]>();
  for (const option of options) {
    const list = groups.get(option.group);
    if (list === undefined) groups.set(option.group, [option]);
    else list.push(option);
  }
  return [...groups.entries()];
}

function OptionLabel({ option }: { option: PickerOption }) {
  const Icon = option.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {Icon !== undefined ? <Icon aria-hidden className="size-4 text-muted-foreground" /> : null}
      {option.color !== undefined ? (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border"
          style={{ backgroundColor: option.color === 0 ? 'transparent' : `#${option.color.toString(16).padStart(6, '0')}` }}
        />
      ) : null}
      <span className="truncate">{option.name}</span>
    </span>
  );
}

function OptionList({
  options,
  selected,
  onSelect,
  noneLabel,
}: {
  options: PickerOption[];
  selected: (id: string) => boolean;
  onSelect: (id: string | null) => void;
  noneLabel?: string;
}) {
  const { t } = useT();
  return (
    <Command>
      <CommandInput placeholder={t.dashboard.picker.search} />
      <CommandList>
        <CommandEmpty>{t.dashboard.picker.noResults}</CommandEmpty>
        {noneLabel !== undefined ? (
          <CommandGroup>
            <CommandItem value={`__none ${noneLabel}`} onSelect={() => onSelect(null)}>
              {noneLabel}
            </CommandItem>
          </CommandGroup>
        ) : null}
        {grouped(options).map(([group, items]) => (
          <CommandGroup key={group || 'all'} heading={group || undefined}>
            {items.map((option) => (
              <CommandItem
                key={option.id}
                value={`${option.name} ${option.id}`}
                disabled={option.disabled}
                data-checked={selected(option.id)}
                onSelect={() => onSelect(option.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <OptionLabel option={option} />
                  {option.hint !== undefined ? <span className="text-xs text-muted-foreground">{option.hint}</span> : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

/** Searchable single choice (channel or role) with an optional "none" entry. */
export function IdPicker({
  id,
  value,
  onChange,
  options,
  noneLabel,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: PickerOption[];
  noneLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const current = value === null ? undefined : options.find((option) => option.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {current !== undefined ? (
            <OptionLabel option={current} />
          ) : value !== null ? (
            <span className="text-destructive">{t.dashboard.picker.unknown(value)}</span>
          ) : (
            <span className="text-muted-foreground">{noneLabel ?? t.dashboard.picker.choose}</span>
          )}
          <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <OptionList
          options={options}
          noneLabel={noneLabel}
          selected={(optionId) => optionId === value}
          onSelect={(next) => {
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Searchable multiple choice; selected entries are shown as removable badges. */
export function MultiPicker({
  id,
  values,
  onChange,
  options,
  max,
}: {
  id: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  options: PickerOption[];
  max: number;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const byId = new Map(options.map((option) => [option.id, option]));
  const toggle = (optionId: string | null): void => {
    if (optionId === null) return;
    if (values.includes(optionId)) onChange(values.filter((value) => value !== optionId));
    else if (values.length < max) onChange([...values, optionId]);
  };
  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="text-muted-foreground">
              {values.length === 0 ? t.dashboard.picker.choose : t.dashboard.picker.selected(values.length)}
            </span>
            <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <OptionList options={options} selected={(optionId) => values.includes(optionId)} onSelect={toggle} />
        </PopoverContent>
      </Popover>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => {
            const option = byId.get(value);
            return (
              <Badge key={value} variant={option === undefined ? 'destructive' : 'secondary'} className="gap-1">
                {option === undefined ? t.dashboard.picker.unknown(value) : <OptionLabel option={option} />}
                <button
                  type="button"
                  className="rounded-sm opacity-70 hover:opacity-100"
                  aria-label={`${t.dashboard.picker.clear}: ${option?.name ?? value}`}
                  onClick={() => onChange(values.filter((other) => other !== value))}
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
