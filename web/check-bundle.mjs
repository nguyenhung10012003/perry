// `npm run web:check`: enforces the web bundle boundary on the build output and the sources (design 4.10,
// acceptance 20). Plain Node (no shell grep), so it behaves the same on macOS, Linux and in CI. Exits 1 on a violation.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = dirname(fileURLToPath(import.meta.url));
const nextDir = join(webDir, '.next');
const self = fileURLToPath(import.meta.url);
const violations = [];

// Built from parts so this file does not match its own source checks.
const USE_SERVER = ['use', 'server'].join(' ');
const BOT_TOKEN_NAME = ['DISCORD', 'TOKEN'].join('_');
const UNSAFE_HTML = ['dangerously', 'Set', 'Inner', 'HTML'].join('');
const BOT_PACKAGES = ['discord.js', '@discordjs', 'lavalink-client'];
const CLIENT_FORBIDDEN = ['ioredis', 'drizzle-orm', 'pg-protocol', 'SESSION_SECRET', 'DISCORD_CLIENT_SECRET'];

function files(dir, skip = () => false) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (skip(path, name)) continue;
    const stat = statSync(path, { throwIfNoEntry: false });
    if (stat === undefined) continue;
    if (stat.isDirectory()) out.push(...files(path, skip));
    else out.push(path);
  }
  return out;
}

const rel = (path) => relative(webDir, path);

function scan(paths, needles, reason) {
  for (const path of paths) {
    const text = readFileSync(path, 'latin1');
    for (const needle of needles) {
      if (text.includes(needle)) violations.push(`${rel(path)}: contains "${needle}" (${reason})`);
    }
  }
}

if (!existsSync(join(nextDir, 'standalone'))) {
  violations.push('.next/standalone is missing: run npm run web:build first');
} else {
  // 1. No bot package in the traced node_modules.
  const traced = files(join(nextDir, 'standalone', 'node_modules'));
  for (const path of traced) {
    const parts = relative(join(nextDir, 'standalone', 'node_modules'), path).split(/[\\/]/);
    for (const name of BOT_PACKAGES) {
      if (parts.includes(name)) {
        violations.push(`standalone/node_modules/${parts.slice(0, parts.indexOf(name) + 1).join('/')}: bot package traced`);
        break;
      }
    }
  }
}
// 2. No bot package in the server or client output.
scan([...files(join(nextDir, 'server')), ...files(join(nextDir, 'static'))], BOT_PACKAGES, 'bot package in the web build');
// 3. No server module or secret name in the client output.
scan(files(join(nextDir, 'static')), CLIENT_FORBIDDEN, 'server-only code in the client bundle');

// 4. Source checks: no Server Actions, no bot token, no raw HTML injection.
const sources = files(webDir, (path, name) => name === '.next' || name === 'node_modules' || path === self).filter((path) =>
  /\.(ts|tsx|js|mjs|cjs)$/.test(path),
);
for (const path of sources) {
  const text = readFileSync(path, 'utf8');
  if (text.includes(`'${USE_SERVER}'`) || text.includes(`"${USE_SERVER}"`)) {
    violations.push(`${rel(path)}: Server Actions are not used (every mutation is a Route Handler with a CSRF check)`);
  }
  if (text.includes(BOT_TOKEN_NAME)) violations.push(`${rel(path)}: the web never reads the bot token`);
  if (text.includes(UNSAFE_HTML)) violations.push(`${rel(path)}: raw HTML injection is not allowed`);
}

// 5. Every non-test module under web/server/ starts with the server-only import.
for (const path of files(join(webDir, 'server')).filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))) {
  if (!readFileSync(path, 'utf8').startsWith("import 'server-only';")) {
    violations.push(`${rel(path)}: must start with import 'server-only';`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`web:check found ${violations.length} violation(s):\n${violations.map((v) => `  - ${v}`).join('\n')}\n`);
  process.exit(1);
}
console.log(`web:check passed (${sources.length} source files checked)`);
