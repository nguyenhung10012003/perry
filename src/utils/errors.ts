import { en } from '../i18n/index.js';
import type { Messages } from '../i18n/index.js';

// The log helpers live in safe-error.ts (no discord.js import, shared with the web); re-exported for the bot.
export { redact, registerSecrets, safeError, setIncludeStacks } from './safe-error.js';
export type { SafeError } from './safe-error.js';

/**
 * An error meant to be shown to the user. It stores a catalog selector so every catch site renders it in the
 * guild's language with localized(t); `message` is the English text (used in logs).
 */
export class UserError extends Error {
  constructor(private readonly select: (t: Messages) => string) {
    super(select(en));
    this.name = 'UserError';
  }

  /** The user-facing text from the given catalog. */
  localized(t: Messages): string {
    return this.select(t);
  }
}
