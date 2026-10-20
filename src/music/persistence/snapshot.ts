import type { anyObject, LavalinkManager, Player, SourceNames, Track, UnresolvedTrack } from 'lavalink-client';
import { z } from 'zod';
import {
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_MAX_PREVIOUS_TRACKS,
  SNAPSHOT_MAX_QUEUE_TRACKS,
} from '../../config/constants.js';
import { FILTER_NAMES } from '../filters.js';
import type { GuildMusicState } from '../guild-state.js';
import { getRequester } from '../requester.js';

/** Text limits applied when a track is written (the encoded blob carries the real data). */
const MAX_TEXT_LENGTH = 300;
const MAX_URL_LENGTH = 2048;
const MAX_ENCODED_LENGTH = 8192;
const MAX_ID_LENGTH = 64;
const MAX_PROVIDER_LENGTH = 32;

/** Compact track record stored in a snapshot. */
export const SnapTrackSchema = z.object({
  encoded: z.string().min(1).max(MAX_ENCODED_LENGTH),
  identifier: z.string().max(MAX_URL_LENGTH),
  title: z.string().max(MAX_TEXT_LENGTH),
  author: z.string().max(MAX_TEXT_LENGTH),
  duration: z.number().nonnegative(),
  uri: z.string().max(MAX_URL_LENGTH).nullable(),
  artworkUrl: z.string().max(MAX_URL_LENGTH).nullable(),
  sourceName: z.string().max(MAX_ID_LENGTH),
  isStream: z.boolean(),
  isSeekable: z.boolean(),
  isrc: z.string().max(MAX_ID_LENGTH).nullable(),
  requesterId: z.string().max(MAX_ID_LENGTH).nullable(),
  requesterName: z.string().max(MAX_TEXT_LENGTH).nullable(),
  autoplay: z.literal(true).optional(),
  provider: z.string().max(MAX_PROVIDER_LENGTH).optional(),
});
export type SnapTrack = z.infer<typeof SnapTrackSchema>;

export const PlayerSnapshotV1Schema = z.object({
  v: z.literal(1),
  guildId: z.string().min(1).max(MAX_ID_LENGTH),
  voiceChannelId: z.string().min(1).max(MAX_ID_LENGTH),
  textChannelId: z.string().min(1).max(MAX_ID_LENGTH).nullable(),
  savedAt: z.number().nonnegative(),
  volume: z.number().int().min(0).max(1000),
  repeatMode: z.enum(['off', 'track', 'queue']),
  paused: z.boolean(),
  positionMs: z.number().nonnegative(),
  filter: z.enum(FILTER_NAMES).nullable(),
  current: SnapTrackSchema.nullable(),
  queue: z.array(SnapTrackSchema).max(SNAPSHOT_MAX_QUEUE_TRACKS),
  previous: z.array(SnapTrackSchema).max(SNAPSHOT_MAX_PREVIOUS_TRACKS),
});
export type PlayerSnapshotV1 = z.infer<typeof PlayerSnapshotV1Schema>;

const cut = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text);
const cutOrNull = (text: string | null | undefined, max: number): string | null =>
  typeof text === 'string' && text.length > 0 && text.length <= max ? text : null;

/** Converts a queue entry to its snapshot form; null for unresolved tracks and tracks that are too large to keep. */
export function toSnapTrack(track: Track | UnresolvedTrack | null | undefined): SnapTrack | null {
  if (!track?.encoded || track.encoded.length > MAX_ENCODED_LENGTH) return null;
  const info = track.info;
  const requester = getRequester(track);
  const userData = (track.userData ?? {}) as Record<string, unknown>;
  const provider = typeof userData.provider === 'string' && userData.provider.length > 0 ? userData.provider : undefined;
  return {
    encoded: track.encoded,
    identifier: cut(info.identifier ?? '', MAX_URL_LENGTH),
    title: cut(info.title, MAX_TEXT_LENGTH),
    author: cut(info.author ?? '', MAX_TEXT_LENGTH),
    duration: typeof info.duration === 'number' && info.duration > 0 ? info.duration : 0,
    uri: cutOrNull(info.uri, MAX_URL_LENGTH),
    artworkUrl: cutOrNull(info.artworkUrl, MAX_URL_LENGTH),
    sourceName: cut(info.sourceName ?? 'unknown', MAX_ID_LENGTH),
    isStream: info.isStream === true,
    isSeekable: info.isSeekable === true,
    isrc: cutOrNull(info.isrc, MAX_ID_LENGTH),
    requesterId: requester ? cut(requester.id, MAX_ID_LENGTH) : null,
    requesterName: requester ? cut(requester.username, MAX_TEXT_LENGTH) : null,
    ...(userData.autoplay === true ? { autoplay: true as const } : {}),
    ...(provider ? { provider: cut(provider, MAX_PROVIDER_LENGTH) } : {}),
  };
}

/** Rebuilds a playable Track (requester and the autoplay/provider markers survive). */
export function fromSnapTrack(manager: LavalinkManager, snap: SnapTrack): Track {
  const requester = snap.requesterId !== null ? { id: snap.requesterId, username: snap.requesterName ?? '' } : undefined;
  return manager.utils.buildTrack(
    {
      encoded: snap.encoded,
      info: {
        identifier: snap.identifier,
        title: snap.title,
        author: snap.author,
        duration: snap.duration,
        artworkUrl: snap.artworkUrl,
        uri: snap.uri ?? '',
        sourceName: snap.sourceName as SourceNames,
        isSeekable: snap.isSeekable,
        isStream: snap.isStream,
        isrc: snap.isrc,
      },
      pluginInfo: {},
      // anyObject only types strings/numbers/objects, but the autoplay flag is a boolean (read back by toSnapTrack).
      userData: {
        ...(snap.autoplay ? { autoplay: true } : {}),
        ...(snap.provider ? { provider: snap.provider } : {}),
      } as anyObject,
    },
    requester,
  );
}

function snapList(tracks: readonly (Track | UnresolvedTrack)[], max: number): SnapTrack[] {
  const result: SnapTrack[] = [];
  for (const track of tracks) {
    if (result.length >= max) break;
    const snap = toSnapTrack(track);
    if (snap) result.push(snap);
  }
  return result;
}

const byteLength = (snapshot: PlayerSnapshotV1): number => Buffer.byteLength(JSON.stringify(snapshot), 'utf8');

/**
 * Captures the player. Returns null when there is nothing worth restoring (no current track and an empty queue).
 * The queue is capped at SNAPSHOT_MAX_QUEUE_TRACKS, the history at SNAPSHOT_MAX_PREVIOUS_TRACKS and the JSON
 * at SNAPSHOT_MAX_BYTES (the queue is trimmed first, then the history).
 */
export function buildSnapshot(player: Player, state?: Pick<GuildMusicState, 'activeFilter'>): PlayerSnapshotV1 | null {
  const voiceChannelId = player.voiceChannelId ?? player.options.voiceChannelId;
  if (!voiceChannelId) return null;
  const current = toSnapTrack(player.queue.current);
  const queue = snapList(player.queue.tracks, SNAPSHOT_MAX_QUEUE_TRACKS);
  if (!current && queue.length === 0) return null;

  let positionMs = 0;
  if (current && !current.isStream) {
    positionMs = Math.max(0, Math.floor(player.position));
    if (current.duration > 0) positionMs = Math.min(positionMs, current.duration);
  }
  const snapshot: PlayerSnapshotV1 = {
    v: 1,
    guildId: player.guildId,
    voiceChannelId,
    textChannelId: player.textChannelId ?? null,
    savedAt: Date.now(),
    volume: Math.max(0, Math.min(1000, Math.round(player.volume))),
    repeatMode: player.repeatMode,
    paused: player.paused,
    positionMs,
    filter: state?.activeFilter ?? null,
    current,
    queue,
    previous: snapList(player.queue.previous, SNAPSHOT_MAX_PREVIOUS_TRACKS),
  };
  while (snapshot.queue.length > 0 && byteLength(snapshot) > SNAPSHOT_MAX_BYTES) {
    snapshot.queue = snapshot.queue.slice(0, Math.floor(snapshot.queue.length / 2));
  }
  if (byteLength(snapshot) > SNAPSHOT_MAX_BYTES) snapshot.previous = [];
  return snapshot;
}
