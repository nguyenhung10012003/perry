import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commands } from '../src/commands/index.js';
import type { Command } from '../src/types/command.js';

const EXPECTED = [
  'play', 'pause', 'resume', 'skip', 'previous', 'stop', 'leave', 'join',
  'queue', 'nowplaying', 'volume', 'seek', 'forward', 'rewind', 'loop', 'shuffle',
  'remove', 'clear', 'move', 'filter', 'lyrics', 'ping', 'help', 'settings',
  'autoplay', 'radio', 'similar',
  'ban', 'unban', 'kick', 'timeout', 'warn', 'warnings', 'case', 'purge',
  'rank', 'leaderboard', 'xp',
] as const;

const partial = process.argv.includes('--partial');
const NAME_RE = /^[\p{Ll}\p{N}_-]{1,32}$/u;

interface Row {
  name: string;
  category: string;
  options: number;
  cooldown: string;
  flags: string;
  description: string;
  problems: string[];
}

const failures: string[] = [];
const warnings: string[] = [];
const rows: Row[] = [];
const seen = new Set<string>();

type JsonLocalizations = Partial<Record<string, string | null>> | null;

interface JsonOption {
  name?: string;
  description?: string;
  description_localizations?: JsonLocalizations;
  options?: JsonOption[];
  choices?: { name?: string; name_localizations?: JsonLocalizations; value?: unknown }[];
}

/** English is the default description; every command, subcommand and option also needs a Vietnamese one. */
function checkLocalizations(
  item: { description_localizations?: JsonLocalizations },
  path: string,
  problems: string[],
): void {
  const vi = item.description_localizations?.vi;
  if (typeof vi !== 'string' || vi.length === 0) problems.push(`${path}: missing vi description localization`);
  else if (vi.length > 100) problems.push(`${path}: vi description > 100`);
}

function checkOption(option: JsonOption, path: string, problems: string[]): void {
  if ((option.name?.length ?? 0) > 32) problems.push(`${path}: name > 32`);
  if ((option.description?.length ?? 0) > 100) problems.push(`${path}: description > 100`);
  checkLocalizations(option, path, problems);
  const choices = option.choices ?? [];
  if (choices.length > 25) problems.push(`${path}: more than 25 choices`);
  for (const choice of choices) {
    if ((choice.name?.length ?? 0) > 100) problems.push(`${path}: choice name > 100`);
    if (typeof choice.value === 'string' && choice.value.length > 100) problems.push(`${path}: choice value > 100`);
    for (const [locale, localized] of Object.entries(choice.name_localizations ?? {})) {
      if (typeof localized === 'string' && localized.length > 100) {
        problems.push(`${path}: choice ${String(choice.value)} ${locale} name > 100`);
      }
    }
  }
  const children = option.options ?? [];
  if (children.length > 25) problems.push(`${path}: more than 25 options`);
  for (const child of children) checkOption(child, `${path}.${child.name ?? '?'}`, problems);
}

for (const command of commands) {
  const problems: string[] = [];
  let name = command.data.name;
  let description = '';
  let optionCount = 0;
  try {
    const json = command.data.toJSON();
    name = json.name;
    description = json.description;
    optionCount = json.options?.length ?? 0;
    if (!NAME_RE.test(name)) problems.push('invalid name');
    if (description.length === 0 || description.length > 100) problems.push('description must be 1-100 chars');
    checkLocalizations(json, 'command', problems);
    if (optionCount > 25) problems.push('more than 25 options');
    for (const option of (json.options ?? []) as JsonOption[]) checkOption(option, option.name ?? '?', problems);
    if (JSON.stringify(json).length > 8000) problems.push('command JSON > 8000 chars');
  } catch (err) {
    problems.push(`toJSON threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (seen.has(name)) problems.push('duplicate name');
  seen.add(name);
  const flags = Object.entries(command.requirements ?? {})
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(',');
  rows.push({
    name,
    category: command.category,
    options: optionCount,
    cooldown: command.cooldownSeconds === undefined ? '-' : `${command.cooldownSeconds}s`,
    flags: flags || '-',
    description,
    problems,
  });
  for (const problem of problems) failures.push(`${name}: ${problem}`);
}

// Catch commands that exist on disk but were forgotten in the registry.
function isCommand(value: unknown): value is Command {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.execute === 'function' && typeof v.category === 'string' && typeof v.data === 'object';
}

const commandsDir = fileURLToPath(new URL('../src/commands/', import.meta.url));
for (const category of ['general', 'music', 'moderation', 'leveling', 'settings']) {
  const dir = join(commandsDir, category);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (isCommand(exported) && !commands.includes(exported)) {
        failures.push(`${category}/${file}: exports a command that is not in the registry`);
      }
    }
  }
}

for (const expected of EXPECTED) {
  if (!seen.has(expected)) (partial ? warnings : failures).push(`missing expected command: ${expected}`);
}

const header = ['name', 'category', 'options', 'cooldown', 'flags', 'description'] as const;
const table = rows.map((r) => ({
  name: r.name,
  category: r.category,
  options: String(r.options),
  cooldown: r.cooldown,
  flags: r.flags,
  description: r.description,
}));
const widths = header.map((h) => Math.max(h.length, ...table.map((r) => r[h].length)));
const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join(' | ');
console.log(line([...header]));
console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
for (const row of table) console.log(line(header.map((h) => row[h])));
console.log('');
for (const row of rows) console.log(`${row.problems.length === 0 ? 'OK  ' : 'FAIL'} ${row.name}`);
for (const w of warnings) console.warn(`WARN ${w}`);
if (failures.length > 0) {
  for (const f of failures) console.error(`ERROR ${f}`);
  process.exit(1);
}
console.log(`\n${rows.length} command(s) valid.`);
