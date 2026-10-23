import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { ModAction } from '../../moderation/target-check.js';
import type { BackendHealth } from '../health.js';
import type { CaseStore, ModCase, NewCase, Result } from '../types.js';
import type { Database } from './client.js';
import { modCaseCounters, modCases } from './schema.js';

/*
 * Repo input rule (design 4.6.2). BackendHealth.attempt marks Postgres down for ANY error thrown by the operation,
 * data errors included, so a data error must never be thrown through it:
 * - Callers pass only range-checked values: case numbers through parseCaseNumber (1..2,147,483,647), reasons
 *   truncated to MOD_REASON_MAX_LENGTH, durationSeconds from parseDuration (at most 28 days), page offsets clamped.
 * - Statements that two processes can run at once for the same key cannot raise SQLSTATE 23505: createCase takes
 *   the next number with an upsert of the counter row (its row lock serializes concurrent moderators of a guild).
 * Any other SQLSTATE is rethrown, so attempt() reports it as an outage, as for every other repo.
 */

type Row = typeof modCases.$inferSelect;

function toCase(row: Row): ModCase {
  return {
    guildId: row.guildId,
    caseNumber: row.caseNumber,
    // mod_cases_action_check only admits MOD_ACTIONS.
    action: row.action as ModAction,
    targetId: row.targetId,
    targetTag: row.targetTag,
    moderatorId: row.moderatorId,
    moderatorTag: row.moderatorTag,
    reason: row.reason,
    durationSeconds: row.durationSeconds,
    dmSent: row.dmSent,
    logChannelId: row.logChannelId,
    logMessageId: row.logMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const byCase = (guildId: string, caseNumber: number) =>
  and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber));

/** Takes the guild's next case number and inserts the case, in one transaction. Numbers are never reused. */
export async function createCase(db: Database, input: NewCase): Promise<ModCase> {
  return db.transaction(async (tx) => {
    const counters = await tx
      .insert(modCaseCounters)
      .values({ guildId: input.guildId, lastCaseNumber: 1 })
      .onConflictDoUpdate({
        target: modCaseCounters.guildId,
        set: { lastCaseNumber: sql`${modCaseCounters.lastCaseNumber} + 1` },
      })
      .returning({ lastCaseNumber: modCaseCounters.lastCaseNumber });
    const caseNumber = counters[0]?.lastCaseNumber;
    if (caseNumber === undefined) throw new Error('Case counter upsert returned no row');
    const rows = await tx
      .insert(modCases)
      .values({
        guildId: input.guildId,
        caseNumber,
        action: input.action,
        targetId: input.targetId,
        targetTag: input.targetTag,
        moderatorId: input.moderatorId,
        moderatorTag: input.moderatorTag,
        reason: input.reason,
        durationSeconds: input.durationSeconds,
        dmSent: input.dmSent,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Case insert returned no row');
    return toCase(row);
  });
}

export async function getCase(db: Database, guildId: string, caseNumber: number): Promise<ModCase | null> {
  const rows = await db.select().from(modCases).where(byCase(guildId, caseNumber)).limit(1);
  const row = rows[0];
  return row ? toCase(row) : null;
}

/** Newest first; total counts every matching case. Served by mod_cases_guild_target_created_idx. */
export async function listCasesForUser(
  db: Database,
  guildId: string,
  userId: string,
  opts: { action?: ModAction; offset: number; limit: number },
): Promise<{ cases: ModCase[]; total: number }> {
  const where = and(
    eq(modCases.guildId, guildId),
    eq(modCases.targetId, userId),
    opts.action === undefined ? undefined : eq(modCases.action, opts.action),
  );
  const totals = await db.select({ total: count() }).from(modCases).where(where);
  const rows = await db
    .select()
    .from(modCases)
    .where(where)
    .orderBy(desc(modCases.createdAt), desc(modCases.caseNumber))
    .offset(opts.offset)
    .limit(opts.limit);
  return { cases: rows.map(toCase), total: totals[0]?.total ?? 0 };
}

/** Returns the updated case, or null when it does not exist. */
export async function updateCaseReason(
  db: Database,
  guildId: string,
  caseNumber: number,
  reason: string | null,
): Promise<ModCase | null> {
  const rows = await db
    .update(modCases)
    .set({ reason, updatedAt: sql`now()` })
    .where(byCase(guildId, caseNumber))
    .returning();
  const row = rows[0];
  return row ? toCase(row) : null;
}

export async function setCaseLogMessage(
  db: Database,
  guildId: string,
  caseNumber: number,
  channelId: string,
  messageId: string,
): Promise<void> {
  await db
    .update(modCases)
    .set({ logChannelId: channelId, logMessageId: messageId })
    .where(byCase(guildId, caseNumber));
}

export async function setCaseDmSent(db: Database, guildId: string, caseNumber: number, dmSent: boolean): Promise<void> {
  await db.update(modCases).set({ dmSent }).where(byCase(guildId, caseNumber));
}

/** True when the case existed. */
export async function deleteCase(db: Database, guildId: string, caseNumber: number): Promise<boolean> {
  const rows = await db.delete(modCases).where(byCase(guildId, caseNumber)).returning({ id: modCases.id });
  return rows.length > 0;
}

/** Deletes the user's warnings and returns how many there were. */
export async function clearWarnings(db: Database, guildId: string, userId: string): Promise<number> {
  const rows = await db
    .delete(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, userId), eq(modCases.action, 'warn')))
    .returning({ id: modCases.id });
  return rows.length;
}

/** CaseStore on Postgres. Every call goes through BackendHealth.attempt, so none of them rejects. */
export class PostgresCaseStore implements CaseStore {
  constructor(
    private readonly db: Database,
    private readonly health: BackendHealth,
  ) {}

  create(input: NewCase): Promise<Result<ModCase>> {
    return this.health.attempt(() => createCase(this.db, input));
  }

  get(guildId: string, caseNumber: number): Promise<Result<ModCase | null>> {
    return this.health.attempt(() => getCase(this.db, guildId, caseNumber));
  }

  listForUser(
    guildId: string,
    userId: string,
    opts: { action?: ModAction; offset: number; limit: number },
  ): Promise<Result<{ cases: ModCase[]; total: number }>> {
    return this.health.attempt(() => listCasesForUser(this.db, guildId, userId, opts));
  }

  updateReason(guildId: string, caseNumber: number, reason: string | null): Promise<Result<ModCase | null>> {
    return this.health.attempt(() => updateCaseReason(this.db, guildId, caseNumber, reason));
  }

  async setLogMessage(guildId: string, caseNumber: number, channelId: string, messageId: string): Promise<void> {
    // Best effort: the case exists without the reference, /case reason then cannot edit the logged embed.
    await this.health.attempt(() => setCaseLogMessage(this.db, guildId, caseNumber, channelId, messageId));
  }

  async setDmSent(guildId: string, caseNumber: number, dmSent: boolean): Promise<void> {
    await this.health.attempt(() => setCaseDmSent(this.db, guildId, caseNumber, dmSent));
  }

  delete(guildId: string, caseNumber: number): Promise<Result<boolean>> {
    return this.health.attempt(() => deleteCase(this.db, guildId, caseNumber));
  }

  clearWarnings(guildId: string, userId: string): Promise<Result<number>> {
    return this.health.attempt(() => clearWarnings(this.db, guildId, userId));
  }
}
