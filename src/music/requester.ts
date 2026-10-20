import type { anyObject, Track, UnresolvedTrack } from 'lavalink-client';

/** Plain object stored in `track.requester` (lavalink-client keeps it as an opaque value). */
export interface Requester {
  id: string;
  username: string;
}

export function isRequester(value: unknown): value is Requester {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.username === 'string';
}

/**
 * Reads the requester of a track. Tracks created without a requester get the bot's own
 * client info from the library, so callers must not assume the id belongs to a user.
 */
export function getRequester(track: Track | UnresolvedTrack | null | undefined): Requester | null {
  const value: unknown = track?.requester;
  return isRequester(value) ? value : null;
}

/** True for tracks the bot queued by itself (autoplay, radio refills). */
export function isAutoplayTrack(track: Track | UnresolvedTrack | null | undefined): boolean {
  return (track?.userData as Record<string, unknown> | undefined)?.autoplay === true;
}

/** Discovery provider that suggested the track, when it was queued by discovery. */
export function trackProvider(track: Track | UnresolvedTrack | null | undefined): string | null {
  const provider = (track?.userData as Record<string, unknown> | undefined)?.provider;
  return typeof provider === 'string' && provider.length > 0 ? provider : null;
}

/** Marks a track as queued by discovery and attributes it to the bot. */
export function tagAsAutoplay(track: Track, requester: Requester, provider: string): void {
  track.requester = requester;
  // anyObject only types strings/numbers/objects, but the autoplay flag is a boolean (read back by isAutoplayTrack).
  track.userData = { ...(track.userData ?? {}), autoplay: true, provider } as unknown as anyObject;
}
