import type { ModAction } from '../../moderation/target-check.js';
import type { CaseStore, ModCase, NewCase, Result } from '../types.js';

interface GuildCases {
  /** Last number handed out; never decreases, so deleted numbers are not reused. */
  last: number;
  cases: ModCase[];
}

const ok = <T>(value: T): Promise<Result<T>> => Promise.resolve({ ok: true, value });

/** Moderation cases kept in memory (memory storage driver); they are lost when the process restarts. */
export class MemoryCaseStore implements CaseStore {
  private readonly guilds = new Map<string, GuildCases>();

  private guild(guildId: string): GuildCases {
    let entry = this.guilds.get(guildId);
    if (entry === undefined) {
      entry = { last: 0, cases: [] };
      this.guilds.set(guildId, entry);
    }
    return entry;
  }

  create(input: NewCase): Promise<Result<ModCase>> {
    const entry = this.guild(input.guildId);
    entry.last += 1;
    const now = new Date();
    const created: ModCase = {
      ...input,
      caseNumber: entry.last,
      logChannelId: null,
      logMessageId: null,
      createdAt: now,
      updatedAt: now,
    };
    entry.cases.push(created);
    return ok({ ...created });
  }

  get(guildId: string, caseNumber: number): Promise<Result<ModCase | null>> {
    const found = this.guilds.get(guildId)?.cases.find((c) => c.caseNumber === caseNumber);
    return ok(found ? { ...found } : null);
  }

  listForUser(
    guildId: string,
    userId: string,
    opts: { action?: ModAction; offset: number; limit: number },
  ): Promise<Result<{ cases: ModCase[]; total: number }>> {
    const matching = (this.guilds.get(guildId)?.cases ?? [])
      .filter((c) => c.targetId === userId && (opts.action === undefined || c.action === opts.action))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.caseNumber - a.caseNumber);
    return ok({
      cases: matching.slice(opts.offset, opts.offset + opts.limit).map((c) => ({ ...c })),
      total: matching.length,
    });
  }

  updateReason(guildId: string, caseNumber: number, reason: string | null): Promise<Result<ModCase | null>> {
    const found = this.guilds.get(guildId)?.cases.find((c) => c.caseNumber === caseNumber);
    if (!found) return ok(null);
    found.reason = reason;
    found.updatedAt = new Date();
    return ok({ ...found });
  }

  setLogMessage(guildId: string, caseNumber: number, channelId: string, messageId: string): Promise<void> {
    const found = this.guilds.get(guildId)?.cases.find((c) => c.caseNumber === caseNumber);
    if (found) {
      found.logChannelId = channelId;
      found.logMessageId = messageId;
    }
    return Promise.resolve();
  }

  setDmSent(guildId: string, caseNumber: number, dmSent: boolean): Promise<void> {
    const found = this.guilds.get(guildId)?.cases.find((c) => c.caseNumber === caseNumber);
    if (found) found.dmSent = dmSent;
    return Promise.resolve();
  }

  delete(guildId: string, caseNumber: number): Promise<Result<boolean>> {
    const entry = this.guilds.get(guildId);
    const index = entry?.cases.findIndex((c) => c.caseNumber === caseNumber) ?? -1;
    if (entry === undefined || index < 0) return ok(false);
    entry.cases.splice(index, 1);
    return ok(true);
  }

  clearWarnings(guildId: string, userId: string): Promise<Result<number>> {
    const entry = this.guilds.get(guildId);
    if (entry === undefined) return ok(0);
    const before = entry.cases.length;
    entry.cases = entry.cases.filter((c) => !(c.targetId === userId && c.action === 'warn'));
    return ok(before - entry.cases.length);
  }
}
