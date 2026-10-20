import { createHash } from 'node:crypto';
import { REST, Routes } from 'discord.js';
import { COMMAND_HASH_TTL_SECONDS } from '../config/constants.js';
import type { Config } from '../config/env.js';
import type { Keys } from '../storage/keys.js';
import type { KeyValueCache } from '../storage/types.js';
import type { Command } from '../types/command.js';
import { safeError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export type CommandBody = ReturnType<Command['data']['toJSON']>;

export interface CommandTarget {
  readonly route: `/${string}`;
  /** `global` or `guild:<id>`; part of the hash and of the Redis key. */
  readonly scope: string;
}

/** Registrar signature (REST PUT of the full command list). Injectable so tests can stub Discord. */
export type PutCommands = (route: `/${string}`, bodies: readonly CommandBody[]) => Promise<unknown>;

export type SyncResult = 'registered' | 'unchanged' | 'failed';

export function serializeCommands(commands: readonly Pick<Command, 'data'>[]): CommandBody[] {
  return commands.map((command) => command.data.toJSON());
}

/** Dev guild unless `forceGlobal` or no dev guild is configured (same rule as `npm run deploy-commands`). */
export function resolveTarget(
  config: Pick<Config, 'clientId' | 'devGuildId'>,
  forceGlobal = false,
): CommandTarget {
  if (config.devGuildId !== undefined && !forceGlobal) {
    return {
      route: Routes.applicationGuildCommands(config.clientId, config.devGuildId),
      scope: `guild:${config.devGuildId}`,
    };
  }
  return { route: Routes.applicationCommands(config.clientId), scope: 'global' };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonical((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

/** sha256 over the scope and the canonical JSON (recursively sorted keys) of the definitions. */
export function hashCommands(scope: string, bodies: readonly CommandBody[]): string {
  return createHash('sha256')
    .update(scope)
    .update('\n')
    .update(JSON.stringify(canonical(bodies)))
    .digest('hex');
}

export function createRestPut(token: string): PutCommands {
  const rest = new REST({ version: '10' }).setToken(token);
  return (route, bodies) => rest.put(route, { body: bodies });
}

export interface SyncDeps {
  config: Pick<Config, 'clientId' | 'devGuildId' | 'startup'>;
  bodies: readonly CommandBody[];
  cache: KeyValueCache;
  keys: Keys;
  logger: Logger;
  put: PutCommands;
}

function storedHash(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const hash = (value as { hash?: unknown }).hash;
  return typeof hash === 'string' ? hash : undefined;
}

/**
 * Registers the slash commands only when their definition hash differs from the one stored in the cache.
 * The hash is stored after a successful PUT only, so a failure is retried on the next start. Never throws.
 */
export async function syncCommandsOnStart(deps: SyncDeps): Promise<SyncResult> {
  const { config, bodies, cache, keys, logger, put } = deps;
  try {
    const { route, scope } = resolveTarget(config);
    const hash = hashCommands(scope, bodies);
    const key = keys.commandsHash(config.clientId, scope);
    if (!config.startup.forceRegisterCommands && storedHash(await cache.getJson(key)) === hash) {
      logger.debug({ scope }, 'Slash commands unchanged, registration skipped');
      return 'unchanged';
    }
    await put(route, bodies);
    await cache.setJson(key, { hash, registeredAt: Date.now() }, COMMAND_HASH_TTL_SECONDS);
    logger.info({ scope, count: bodies.length }, 'Slash commands registered');
    return 'registered';
  } catch (err) {
    logger.warn({ err: safeError(err) }, 'Slash command registration failed, it will be retried on the next start');
    return 'failed';
  }
}
