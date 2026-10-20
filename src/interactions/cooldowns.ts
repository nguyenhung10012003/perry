const CLEANUP_INTERVAL_MS = 60_000;

/** Per command and user cooldowns. Entries are removed lazily and by an unref'd sweep. */
export class Cooldowns {
  private readonly expiresAt = new Map<string, number>();

  constructor() {
    const timer = setInterval(() => this.sweep(), CLEANUP_INTERVAL_MS);
    timer.unref();
  }

  /** Returns remaining whole seconds if on cooldown, otherwise starts the cooldown and returns 0. */
  check(commandName: string, userId: string, seconds: number): number {
    if (seconds <= 0) return 0;
    const key = `${commandName}:${userId}`;
    const now = Date.now();
    const until = this.expiresAt.get(key);
    if (until !== undefined && until > now) return Math.ceil((until - now) / 1000);
    this.expiresAt.set(key, now + seconds * 1000);
    return 0;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, until] of this.expiresAt) {
      if (until <= now) this.expiresAt.delete(key);
    }
  }
}
