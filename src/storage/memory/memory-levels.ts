import { XP_TOTAL_MAX } from '../../config/constants.js';
import { levelForXp } from '../../leveling/xp.js';
import type {
  GrantInput,
  LevelChange,
  LevelReward,
  LevelStore,
  MemberLevel,
  Result,
  XpAdjustment,
} from '../types.js';

const ok = <T>(value: T): Promise<Result<T>> => Promise.resolve({ ok: true, value });

/** The leaderboard order of the Postgres store: XP descending, ties by user id ascending. */
function byRank(a: MemberLevel, b: MemberLevel): number {
  if (a.xp !== b.xp) return b.xp - a.xp;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/** XP and rewards kept in memory (memory storage driver); they are lost when the process restarts. */
export class MemoryLevelStore implements LevelStore {
  private readonly members = new Map<string, Map<string, MemberLevel>>();
  private readonly guildRewards = new Map<string, LevelReward[]>();

  private guild(guildId: string): Map<string, MemberLevel> {
    let entry = this.members.get(guildId);
    if (entry === undefined) {
      entry = new Map();
      this.members.set(guildId, entry);
    }
    return entry;
  }

  private sorted(guildId: string): MemberLevel[] {
    return [...(this.members.get(guildId)?.values() ?? [])].sort(byRank);
  }

  grant(input: GrantInput): Promise<Result<LevelChange>> {
    const members = this.guild(input.guildId);
    const current = members.get(input.userId);
    const previousLevel = current?.level ?? 0;
    const xp = Math.min((current?.xp ?? 0) + input.amount, XP_TOTAL_MAX);
    const level = Math.max(previousLevel, levelForXp(xp));
    members.set(input.userId, {
      guildId: input.guildId,
      userId: input.userId,
      xp,
      level,
      username: input.username,
      avatar: input.avatar,
      updatedAt: new Date(),
    });
    return ok({ xp, level, previousLevel });
  }

  get(guildId: string, userId: string): Promise<Result<MemberLevel | null>> {
    const found = this.members.get(guildId)?.get(userId);
    return ok(found ? { ...found } : null);
  }

  rank(guildId: string, xp: number, userId: string): Promise<Result<number>> {
    const ahead = this.sorted(guildId).filter((m) => m.xp > xp || (m.xp === xp && m.userId < userId));
    return ok(ahead.length + 1);
  }

  count(guildId: string): Promise<Result<number>> {
    return ok(this.members.get(guildId)?.size ?? 0);
  }

  page(guildId: string, offset: number, limit: number): Promise<Result<MemberLevel[]>> {
    return ok(this.sorted(guildId).slice(offset, offset + limit).map((m) => ({ ...m })));
  }

  adjust(guildId: string, userId: string, op: XpAdjustment): Promise<Result<LevelChange>> {
    const members = this.guild(guildId);
    const current = members.get(userId);
    const before = current?.xp ?? 0;
    const xp =
      op.kind === 'add'
        ? Math.min(before + op.amount, XP_TOTAL_MAX)
        : op.kind === 'remove'
          ? Math.max(before - op.amount, 0)
          : Math.min(Math.max(op.amount, 0), XP_TOTAL_MAX);
    const level = levelForXp(xp);
    members.set(userId, {
      guildId,
      userId,
      xp,
      level,
      username: current?.username ?? null,
      avatar: current?.avatar ?? null,
      updatedAt: new Date(),
    });
    return ok({ xp, level, previousLevel: current?.level ?? 0 });
  }

  reset(guildId: string, userId: string): Promise<Result<boolean>> {
    return ok(this.members.get(guildId)?.delete(userId) ?? false);
  }

  rewards(guildId: string): Promise<Result<LevelReward[]>> {
    const rewards = [...(this.guildRewards.get(guildId) ?? [])].sort((a, b) => a.level - b.level);
    return ok(rewards.map((r) => ({ ...r })));
  }

  deleteRewardsForRole(guildId: string, roleId: string): Promise<void> {
    const rewards = this.guildRewards.get(guildId);
    if (rewards !== undefined) this.guildRewards.set(guildId, rewards.filter((r) => r.roleId !== roleId));
    return Promise.resolve();
  }

  deleteRewards(guildId: string): Promise<void> {
    this.guildRewards.delete(guildId);
    return Promise.resolve();
  }
}
