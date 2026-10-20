import { pino } from 'pino';
import type { Logger } from 'pino';
import type { Config } from '../config/env.js';
import { setIncludeStacks } from './errors.js';

export type { Logger };

export function createLogger(config: Pick<Config, 'logLevel' | 'logPretty'>): Logger {
  setIncludeStacks(config.logLevel === 'debug' || config.logLevel === 'trace');
  return pino({
    level: config.logLevel,
    redact: {
      paths: [
        'token',
        'authorization',
        'password',
        'databaseUrl',
        'redisUrl',
        'apiKey',
        '*.token',
        '*.password',
        '*.authorization',
        '*.databaseUrl',
        '*.redisUrl',
        '*.apiKey',
      ],
      censor: '[REDACTED]',
    },
    ...(config.logPretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
      : {}),
  });
}

/** Creates a child logger tagged with a module name. */
export function childLogger(logger: Logger, module: string): Logger {
  return logger.child({ module });
}
