/**
 * Secret registry and log-safe error conversion. Free of discord.js and the message catalogs, so the web process
 * (web/) shares it with the bot; src/utils/errors.ts re-exports everything for the bot's imports.
 */

const secrets = new Set<string>();
let includeStacks = false;

/** Registers values (token, passwords) that must never appear in logs or messages. */
export function registerSecrets(...values: (string | undefined)[]): void {
  for (const value of values) {
    if (value !== undefined && value.length >= 4) secrets.add(value);
  }
}

/** Enables stack traces in safeError() output (only for debug/trace log levels). */
export function setIncludeStacks(enabled: boolean): void {
  includeStacks = enabled;
}

// Discord bot tokens look like <base64 id>.<timestamp>.<hmac>
const TOKEN_SHAPE = /[A-Za-z0-9_-]{23,30}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}/g;

/** Masks registered secrets and Discord-token-shaped strings. */
export function redact(text: string): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
  return result.replace(TOKEN_SHAPE, '[REDACTED]');
}

export interface SafeError {
  name: string;
  message: string;
  code?: string | number;
  /** One level of `error.cause` (e.g. the driver error wrapped by Drizzle), redacted. */
  cause?: { name: string; message: string; code?: string | number };
  stack?: string;
}

/** Converts anything thrown into a loggable object without secrets. */
export function safeError(err: unknown): SafeError {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    const result: SafeError = { name: err.name, message: redact(err.message) };
    if (typeof code === 'string' || typeof code === 'number') result.code = code;
    const cause: unknown = err.cause;
    if (cause instanceof Error) {
      const causeCode = (cause as { code?: unknown }).code;
      result.cause = { name: cause.name, message: redact(cause.message) };
      if (typeof causeCode === 'string' || typeof causeCode === 'number') result.cause.code = causeCode;
    }
    if (includeStacks && err.stack) result.stack = redact(err.stack);
    return result;
  }
  return { name: 'NonError', message: redact(String(err)) };
}
