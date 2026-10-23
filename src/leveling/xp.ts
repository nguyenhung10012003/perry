import { XP_PER_MESSAGE_MAX, XP_PER_MESSAGE_MIN } from '../config/constants.js';

/** Highest level a member can be stored with (member_levels_level_check); XP_TOTAL_MAX is about level 1058. */
export const LEVEL_MAX = 2000;

/** XP needed to go from level l to l + 1 (A25). */
export function xpToNext(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/**
 * Total XP needed to reach level L: the sum of xpToNext(0..L-1) in closed form.
 * (L-1)L(2L-1) is always divisible by 6, so the result is an integer.
 */
export function totalXpForLevel(level: number): number {
  if (level <= 0) return 0;
  return (5 * ((level - 1) * level * (2 * level - 1))) / 6 + 25 * level * (level - 1) + 100 * level;
}

/** The largest level L in 0..LEVEL_MAX with totalXpForLevel(L) <= xp (binary search). */
export function levelForXp(xp: number): number {
  let low = 0;
  let high = LEVEL_MAX;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (totalXpForLevel(mid) <= xp) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** XP earned inside the current level. */
export function xpIntoLevel(xp: number, level: number): number {
  return xp - totalXpForLevel(level);
}

/** XP the current level needs in total to reach the next one. */
export function xpForNext(level: number): number {
  return xpToNext(level);
}

/**
 * XP for one eligible message: a random 15..25 times the guild multiplier (percent), at least 1.
 * `random` is injectable for tests and must return a value in [0, 1) like Math.random.
 */
export function rollXp(percent: number, random: () => number = Math.random): number {
  const base = XP_PER_MESSAGE_MIN + Math.floor(random() * (XP_PER_MESSAGE_MAX - XP_PER_MESSAGE_MIN + 1));
  return Math.max(1, Math.round((base * percent) / 100));
}
