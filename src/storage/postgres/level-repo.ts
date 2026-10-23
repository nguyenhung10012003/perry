import { and, asc, count, eq, gt, gte, lt, or, sql } from 'drizzle-orm';
import { REWARDS_LOCK_NAMESPACE, XP_TOTAL_MAX } from '../../config/constants.js';
import { levelForXp, totalXpForLevel } from '../../leveling/xp.js';
import type { BackendHealth } from '../health.js';
import type {
  GrantInput,
  LevelChange,
  LevelReward,
  LevelStore,
  MemberLevel,
  Result,
  XpAdjustment,
} from '../types.js';
import type { Database } from './client.js';
import { pgErrorCode } from './client.js';
import { levelRoleRewards, memberLevels } from './schema.js';

/*
 * Repo input rule (design 4.6.2). BackendHealth.attempt marks Postgres down for ANY error thrown by the operation,
 * data errors included, so a data error must never be thrown through it:
 * - Callers pass only range-checked values: grant amounts come from rollXp (1..125), /xp amounts are re-checked by
 *   the handler (1..1,000,000 for add/remove, 0..2,000,000,000 for set), page offsets are clamped with clampPage,
 *   and levels come from levelForXp of a stored XP (at most 1058).
 * - Statements that two processes can run at once for the same key cannot raise SQLSTATE 23505: grantXp is an
 *   upsert, and adjustXp creates a missing row with `insert ... on conflict (guild_id, user_id) do nothing` before
 *   its `select ... for update`, so it cannot collide with a concurrent grant upsert.
 * - XP stays within 0..XP_TOTAL_MAX in the same statement that writes it (least() in the upsert, clamping in
 *   adjustXp), and the stored level never exceeds the level its XP supports (guarded update in grantXp, XP and level
 *   written together under a row lock in adjustXp).
 * - replaceRewards (the web's reward save) takes a per-guild advisory lock first, so two saves of one guild never run
 *   their delete-and-insert at the same time; a 23505 there is caught inside the callback and returned as
 *   { conflict: true } (a defensive path only). Its rewards are validated by the web first (levels 1..1000, at most
 *   LEVEL_REWARDS_MAX rows, unique levels and roles).
 * Any other SQLSTATE is rethrown, so attempt() reports it as an outage, as for every other repo.
 */

/** SQLSTATE unique_violation. */
const PG_UNIQUE_VIOLATION = '23505';

type Row = typeof memberLevels.$inferSelect;

function toMemberLevel(row: Row): MemberLevel {
  return {
    guildId: row.guildId,
    userId: row.userId,
    xp: row.xp,
    level: row.level,
    username: row.username,
    avatar: row.avatar,
    updatedAt: row.updatedAt,
  };
}

const byMember = (guildId: string, userId: string) =>
  and(eq(memberLevels.guildId, guildId), eq(memberLevels.userId, userId));

/**
 * Adds XP with one upsert, then raises the level with a guarded update when the new XP supports a higher level.
 * The guard is evaluated on the current row, so a racing admin change cannot be overwritten, and only the statement
 * that actually raised the level reports it (previousLevel < level), so concurrent grants never report a level twice.
 */
export async function grantXp(db: Database, input: GrantInput): Promise<LevelChange> {
  const rows = await db
    .insert(memberLevels)
    .values({
      guildId: input.guildId,
      userId: input.userId,
      xp: Math.min(input.amount, XP_TOTAL_MAX),
      level: 0,
      username: input.username,
      avatar: input.avatar,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: [memberLevels.guildId, memberLevels.userId],
      set: {
        xp: sql`least(${memberLevels.xp} + excluded.xp, ${XP_TOTAL_MAX})`,
        username: sql`excluded.username`,
        avatar: sql`excluded.avatar`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ xp: memberLevels.xp, level: memberLevels.level });
  const row = rows[0];
  if (!row) throw new Error('XP upsert returned no row');
  const target = levelForXp(row.xp);
  if (target > row.level) {
    const raised = await db
      .update(memberLevels)
      .set({ level: target, updatedAt: sql`now()` })
      .where(
        and(
          byMember(input.guildId, input.userId),
          lt(memberLevels.level, target),
          // The CURRENT row must still support the new level (an admin change may have lowered the XP meanwhile).
          gte(memberLevels.xp, totalXpForLevel(target)),
        ),
      )
      .returning({ level: memberLevels.level });
    if (raised.length > 0) return { xp: row.xp, level: target, previousLevel: row.level };
  }
  return { xp: row.xp, level: row.level, previousLevel: row.level };
}

export async function getMemberLevel(db: Database, guildId: string, userId: string): Promise<MemberLevel | null> {
  const rows = await db.select().from(memberLevels).where(byMember(guildId, userId)).limit(1);
  const row = rows[0];
  return row ? toMemberLevel(row) : null;
}

export async function countMembers(db: Database, guildId: string): Promise<number> {
  const rows = await db.select({ total: count() }).from(memberLevels).where(eq(memberLevels.guildId, guildId));
  return rows[0]?.total ?? 0;
}

/** Positional rank with the page order (xp desc, then user id), so it equals the member's leaderboard position. */
export async function rankOf(db: Database, guildId: string, xp: number, userId: string): Promise<number> {
  const rows = await db
    .select({ rank: sql<number>`count(*)::int + 1` })
    .from(memberLevels)
    .where(
      and(
        eq(memberLevels.guildId, guildId),
        or(gt(memberLevels.xp, xp), and(eq(memberLevels.xp, xp), lt(memberLevels.userId, userId))),
      ),
    );
  return rows[0]?.rank ?? 1;
}

/** One leaderboard page. The order matches member_levels_guild_xp_idx, so Postgres reads the index without a sort. */
export async function leaderboardPage(
  db: Database,
  guildId: string,
  offset: number,
  limit: number,
): Promise<MemberLevel[]> {
  const rows = await db
    .select()
    .from(memberLevels)
    .where(eq(memberLevels.guildId, guildId))
    .orderBy(sql`${memberLevels.xp} desc nulls last`, asc(memberLevels.userId))
    .limit(limit)
    .offset(offset);
  return rows.map(toMemberLevel);
}

function adjustedXp(xp: number, op: XpAdjustment): number {
  if (op.kind === 'add') return Math.min(xp + op.amount, XP_TOTAL_MAX);
  if (op.kind === 'remove') return Math.max(xp - op.amount, 0);
  return Math.min(Math.max(op.amount, 0), XP_TOTAL_MAX);
}

/**
 * Admin change (`/xp add|remove|set`) in one transaction: makes sure the row exists without a unique violation,
 * locks it, then writes XP and level together. Concurrent grants wait for the lock and add their XP on top.
 */
export async function adjustXp(
  db: Database,
  guildId: string,
  userId: string,
  op: XpAdjustment,
): Promise<LevelChange> {
  return db.transaction(async (tx) => {
    let current: { xp: number; level: number } | undefined;
    // A concurrent /xp reset can delete the row between the two statements; the second round creates it again.
    for (let round = 0; round < 2 && current === undefined; round += 1) {
      await tx
        .insert(memberLevels)
        .values({ guildId, userId, xp: 0, level: 0 })
        .onConflictDoNothing({ target: [memberLevels.guildId, memberLevels.userId] });
      const rows = await tx
        .select({ xp: memberLevels.xp, level: memberLevels.level })
        .from(memberLevels)
        .where(byMember(guildId, userId))
        .for('update');
      current = rows[0];
    }
    if (current === undefined) throw new Error('Member level row could not be locked');
    const xp = adjustedXp(current.xp, op);
    const level = levelForXp(xp);
    await tx.update(memberLevels).set({ xp, level, updatedAt: sql`now()` }).where(byMember(guildId, userId));
    return { xp, level, previousLevel: current.level };
  });
}

/** Deletes the member's row; true when it existed. */
export async function resetMember(db: Database, guildId: string, userId: string): Promise<boolean> {
  const rows = await db.delete(memberLevels).where(byMember(guildId, userId)).returning({ userId: memberLevels.userId });
  return rows.length > 0;
}

export async function listRewards(db: Database, guildId: string): Promise<LevelReward[]> {
  return db
    .select({ level: levelRoleRewards.level, roleId: levelRoleRewards.roleId })
    .from(levelRoleRewards)
    .where(eq(levelRoleRewards.guildId, guildId))
    .orderBy(asc(levelRoleRewards.level));
}

export async function deleteRewardsForRole(db: Database, guildId: string, roleId: string): Promise<void> {
  await db
    .delete(levelRoleRewards)
    .where(and(eq(levelRoleRewards.guildId, guildId), eq(levelRoleRewards.roleId, roleId)));
}

export async function deleteRewards(db: Database, guildId: string): Promise<void> {
  await db.delete(levelRoleRewards).where(eq(levelRoleRewards.guildId, guildId));
}

export type ReplaceRewardsResult = { conflict: false; rewards: LevelReward[] } | { conflict: true };

/**
 * Replaces the guild's reward set in one transaction (last writer wins). Under READ COMMITTED two unserialized
 * delete-and-insert transactions with disjoint sets would both commit and leave their union, so the transaction
 * first takes pg_advisory_xact_lock(REWARDS_LOCK_NAMESPACE, hashtext(guildId)); it is released at commit or rollback.
 */
export async function replaceRewards(
  db: Database,
  guildId: string,
  rewards: readonly LevelReward[],
): Promise<ReplaceRewardsResult> {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${REWARDS_LOCK_NAMESPACE}, hashtext(${guildId}))`);
      await tx.delete(levelRoleRewards).where(eq(levelRoleRewards.guildId, guildId));
      if (rewards.length > 0) {
        await tx
          .insert(levelRoleRewards)
          .values(rewards.map((reward) => ({ guildId, level: reward.level, roleId: reward.roleId })));
      }
    });
  } catch (err) {
    if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) return { conflict: true };
    throw err;
  }
  return {
    conflict: false,
    rewards: [...rewards].sort((a, b) => a.level - b.level).map((reward) => ({ ...reward })),
  };
}

/** LevelStore on Postgres. Every call goes through BackendHealth.attempt, so none of them rejects. */
export class PostgresLevelStore implements LevelStore {
  constructor(
    private readonly db: Database,
    private readonly health: BackendHealth,
  ) {}

  grant(input: GrantInput): Promise<Result<LevelChange>> {
    return this.health.attempt(() => grantXp(this.db, input));
  }

  get(guildId: string, userId: string): Promise<Result<MemberLevel | null>> {
    return this.health.attempt(() => getMemberLevel(this.db, guildId, userId));
  }

  rank(guildId: string, xp: number, userId: string): Promise<Result<number>> {
    return this.health.attempt(() => rankOf(this.db, guildId, xp, userId));
  }

  count(guildId: string): Promise<Result<number>> {
    return this.health.attempt(() => countMembers(this.db, guildId));
  }

  page(guildId: string, offset: number, limit: number): Promise<Result<MemberLevel[]>> {
    return this.health.attempt(() => leaderboardPage(this.db, guildId, offset, limit));
  }

  adjust(guildId: string, userId: string, op: XpAdjustment): Promise<Result<LevelChange>> {
    return this.health.attempt(() => adjustXp(this.db, guildId, userId, op));
  }

  reset(guildId: string, userId: string): Promise<Result<boolean>> {
    return this.health.attempt(() => resetMember(this.db, guildId, userId));
  }

  rewards(guildId: string): Promise<Result<LevelReward[]>> {
    return this.health.attempt(() => listRewards(this.db, guildId));
  }

  async deleteRewardsForRole(guildId: string, roleId: string): Promise<void> {
    await this.health.attempt(() => deleteRewardsForRole(this.db, guildId, roleId));
  }

  async deleteRewards(guildId: string): Promise<void> {
    await this.health.attempt(() => deleteRewards(this.db, guildId));
  }
}
