/**
 * Discord constants and pure helpers shared by the dashboard's client components and the web server. No Node or DOM
 * APIs, so client bundles can include this module.
 */

export const SNOWFLAKE_RE = /^\d{17,20}$/;

/** Channel type numbers of the Discord API (the ones the dashboard lists). */
export const CHANNEL_TYPES = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  stage: 13,
  forum: 15,
  media: 16,
} as const;

/** Text-based channel types where the bot can post the mod log and level-up messages. */
export const POSTABLE_CHANNEL_TYPES: readonly number[] = [CHANNEL_TYPES.text, CHANNEL_TYPES.announcement];

export const PERMISSION_ADMINISTRATOR = 0x8n;
export const PERMISSION_MANAGE_GUILD = 0x20n;

/** Fields of GET /users/@me/guilds the dashboard uses. */
export interface PartialGuildPermissions {
  owner: boolean;
  /** Decimal string of the permission bitfield (it exceeds 2^53). */
  permissions: string;
}

/** Owner, Manage Server or Administrator: the user may configure Perry for the guild (computed with BigInt). */
export function hasManagePermission(guild: PartialGuildPermissions): boolean {
  if (guild.owner) return true;
  if (!/^\d{1,30}$/.test(guild.permissions)) return false;
  const bits = BigInt(guild.permissions);
  return (bits & (PERMISSION_MANAGE_GUILD | PERMISSION_ADMINISTRATOR)) !== 0n;
}

const CDN = 'https://cdn.discordapp.com';
const HASH_RE = /^(a_)?[0-9a-f]{32}$/;

/** Avatar URL of a user; the default avatar when the user has none (or the hash is unexpected). */
export function avatarUrl(userId: string, avatar: string | null, size = 64): string {
  if (avatar !== null && HASH_RE.test(avatar) && SNOWFLAKE_RE.test(userId)) {
    return `${CDN}/avatars/${userId}/${avatar}.png?size=${size}`;
  }
  const index = SNOWFLAKE_RE.test(userId) ? Number((BigInt(userId) >> 22n) % 6n) : 0;
  return `${CDN}/embed/avatars/${index}.png`;
}

/** Icon URL of a guild, or null when it has none (the UI then shows its initials). */
export function guildIconUrl(guildId: string, icon: string | null, size = 64): string | null {
  if (icon === null || !HASH_RE.test(icon) || !SNOWFLAKE_RE.test(guildId)) return null;
  return `${CDN}/icons/${guildId}/${icon}.png?size=${size}`;
}

/** Up to two initials of a guild name, for guilds without an icon. */
export function guildInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}
