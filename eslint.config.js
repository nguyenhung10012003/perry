import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

/** Modules that pull in discord.js or the bot's env schema; the web must never bundle them (design 4.10). */
const BOT_ONLY_PATHS = [
  { name: 'discord.js', message: 'The web holds no bot token and never loads discord.js (DP-10 (b)).' },
  { name: 'lavalink-client', message: 'The web never loads lavalink-client.' },
];
const BOT_ONLY_PATTERNS = [
  { group: ['@discordjs/*'], message: 'The web never loads discord.js.' },
  { group: ['**/src/utils/errors.js'], message: 'Imports discord.js through i18n; use src/utils/safe-error.js.' },
  { group: ['**/src/i18n/index.js'], message: 'Imports discord.js; use src/i18n/locales.js.' },
  { group: ['**/src/config/env.js'], message: "The bot's env schema; use src/config/env-helpers.js." },
];
/** Client-reachable code (shared, components, lib) must not import server modules. */
const SERVER_ONLY_PATTERNS = [
  { group: ['server-only', 'node:*', 'pg', 'ioredis', 'drizzle-orm', 'drizzle-orm/*'], message: 'Server-only module.' },
  { group: ['**/server/*', '**/server/**', '@/server/*', '@/server/**', '**/src/storage/**'], message: 'Server-only module.' },
];

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'lavalink/**', '.agents/**', 'drizzle/**', 'web/.next/**', 'web/next-env.d.ts'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        // node:test schedules describe/it itself; their returned promises need no handling.
        { allowForKnownSafeCalls: [{ from: 'package', name: ['describe', 'it', 'test', 'suite'], package: 'node:test' }] },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    settings: { next: { rootDir: 'web/' } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      'no-restricted-imports': ['error', { paths: BOT_ONLY_PATHS, patterns: BOT_ONLY_PATTERNS }],
    },
  },
  {
    // Server and shared code use relative imports with .js specifiers only (tsc, webpack and the test runner agree).
    files: ['web/server/**/*.ts', 'web/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: BOT_ONLY_PATHS,
          patterns: [...BOT_ONLY_PATTERNS, { group: ['@/*'], message: 'Use a relative import with a .js specifier.' }],
        },
      ],
    },
  },
  {
    files: ['web/shared/**/*.ts', 'web/components/**/*.{ts,tsx}', 'web/lib/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: BOT_ONLY_PATHS,
          patterns: [...BOT_ONLY_PATTERNS, ...SERVER_ONLY_PATTERNS],
        },
      ],
    },
  },
  {
    files: ['web/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: BOT_ONLY_PATHS,
          patterns: [
            ...BOT_ONLY_PATTERNS,
            ...SERVER_ONLY_PATTERNS,
            { group: ['@/*'], message: 'Use a relative import with a .js specifier.' },
          ],
        },
      ],
    },
  },
  {
    files: ['web/app/**/*.tsx', 'web/components/**/*.tsx', 'web/lib/**/*.tsx'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
