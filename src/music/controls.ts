import type {
  Player,
  RepeatMode,
  Track,
  UnresolvedTrack,
} from "lavalink-client";
import { MAX_VOLUME } from "../config/constants.js";
import { t } from "../i18n/index.js";
import { applyFilterPreset } from "./filters.js";
import type { FilterName } from "./filters.js";
import { formatDuration } from "./format.js";
import { endNowPlaying, refreshNowPlaying } from "./now-playing.js";
import type { MusicService } from "./music-service.js";

/**
 * Shared player actions. Slash commands and Now-Playing buttons both call these functions; they are the only
 * place where the player is mutated for these actions. Each returns a result descriptor and never renders
 * anything: callers pick the message (see `controlError` for failures and the `t.music.*` strings for success).
 * Guards (voice/DJ) are NOT checked here; run `runGuards` with the matching REQ preset first.
 */

export type ControlFailure =
  | { ok: false; reason: "nothingPlaying" }
  | { ok: false; reason: "noPrevious" }
  | { ok: false; reason: "queueEmpty" }
  | { ok: false; reason: "queueTooShort" }
  | { ok: false; reason: "notSeekable" }
  | { ok: false; reason: "beyondEnd"; durationMs: number }
  | { ok: false; reason: "outOfRange"; max: number }
  | { ok: false; reason: "volumeOutOfRange"; max: number };

export type ControlResult<T extends object> =
  | ({ ok: true } & T)
  | ControlFailure;

const nothingPlaying: ControlFailure = { ok: false, reason: "nothingPlaying" };

/** Localised message for a failed control. */
export function controlError(failure: ControlFailure): string {
  switch (failure.reason) {
    case "nothingPlaying":
      return t.errors.nothingPlaying;
    case "noPrevious":
      return t.errors.noPrevious;
    case "queueEmpty":
      return t.errors.queueEmpty;
    case "queueTooShort":
      return t.errors.queueTooShort;
    case "notSeekable":
      return t.errors.notSeekable;
    case "beyondEnd":
      return t.errors.seekBeyond(formatDuration(failure.durationMs));
    case "outOfRange":
      return failure.max < 1
        ? t.errors.queueEmpty
        : t.errors.outOfRange(failure.max);
    case "volumeOutOfRange":
      return t.errors.volumeOutOfRange(failure.max);
  }
}

// --- pause / resume ---------------------------------------------------------------------------

export async function setPaused(
  service: MusicService,
  player: Player,
  paused: boolean,
): Promise<ControlResult<{ paused: boolean; changed: boolean }>> {
  if (!player.queue.current) return nothingPlaying;
  if (player.paused === paused) return { ok: true, paused, changed: false };
  if (paused) await player.pause();
  else await player.resume();
  refreshNowPlaying(service, player.guildId);
  return { ok: true, paused, changed: true };
}

export function togglePause(
  service: MusicService,
  player: Player,
): Promise<ControlResult<{ paused: boolean; changed: boolean }>> {
  return setPaused(service, player, !player.paused);
}

// --- skip / previous -------------------------------------------------------------------------

/**
 * Skips the current track. `to` is 1-based among the queued tracks (as shown by /queue): to=1 (or omitted)
 * plays the next track, to=N drops the N-1 tracks before it and plays the Nth. Skipping with an empty queue
 * ends playback (queueEnd).
 */
export async function skip(
  _service: MusicService,
  player: Player,
  to?: number,
): Promise<
  ControlResult<{
    skipped: Track | null;
    next: Track | UnresolvedTrack | null;
    to: number | null;
  }>
> {
  const queue = player.queue;
  if (!queue.current && queue.tracks.length === 0) return nothingPlaying;
  if (
    to !== undefined &&
    (!Number.isInteger(to) || to < 1 || to > queue.tracks.length)
  ) {
    return { ok: false, reason: "outOfRange", max: queue.tracks.length };
  }
  const skipped = queue.current;
  const next =
    queue.tracks[(to ?? 1) - 1] ??
    (player.repeatMode === "queue" ? skipped : null);
  await player.skip(to ?? 0, false);
  return { ok: true, skipped, next, to: to ?? null };
}

/**
 * Plays the previous track. The interrupted track goes back to the front of the queue, so the observable
 * result is "previous plays now, the track it replaced plays next".
 */
export async function previous(
  _service: MusicService,
  player: Player,
): Promise<ControlResult<{ track: Track }>> {
  const track = await player.queue.shiftPrevious();
  if (!track) return { ok: false, reason: "noPrevious" };
  const current = player.queue.current;
  if (current) await player.queue.add(current, 0);
  // paused: false so the previous track does not start in a paused player.
  await player.play({ clientTrack: track, paused: false });
  return { ok: true, track };
}

// --- stop / leave -----------------------------------------------------------------------------

/**
 * D12: stops playback and clears the queue. Leaves the voice channel unless 24/7 is enabled.
 */
export async function stop(
  service: MusicService,
  player: Player,
): Promise<ControlResult<{ left: boolean }>> {
  // A radio session ends with /stop; plain autoplay stays a guild setting.
  const state = service.getState(player.guildId);
  if (state) state.radio = null;
  const settings = await service.client.settings.get(player.guildId);
  if (!settings.twentyFourSeven) {
    await service.destroyPlayer(player.guildId, "UserStop");
    return { ok: true, left: true };
  }
  await player.stopPlaying(true, false);
  if (state) endNowPlaying(service, state);
  return { ok: true, left: false };
}

/** Always destroys the player and leaves the channel. */
export async function leave(
  service: MusicService,
  player: Player,
): Promise<ControlResult<object>> {
  await service.destroyPlayer(player.guildId, "UserLeave");
  return { ok: true };
}

// --- loop / shuffle / volume ------------------------------------------------------------------

export async function setLoop(
  service: MusicService,
  player: Player,
  mode: RepeatMode,
): Promise<ControlResult<{ mode: RepeatMode }>> {
  await player.setRepeatMode(mode);
  refreshNowPlaying(service, player.guildId);
  return { ok: true, mode };
}

const NEXT_LOOP_MODE: Record<RepeatMode, RepeatMode> = {
  off: "track",
  track: "queue",
  queue: "off",
};

/** off -> track -> queue -> off (used by the np:loop button). */
export function cycleLoop(
  service: MusicService,
  player: Player,
): Promise<ControlResult<{ mode: RepeatMode }>> {
  return setLoop(service, player, NEXT_LOOP_MODE[player.repeatMode]);
}

export async function shuffle(
  _service: MusicService,
  player: Player,
): Promise<ControlResult<{ count: number }>> {
  const count = player.queue.tracks.length;
  if (count < 2) return { ok: false, reason: "queueTooShort" };
  await player.queue.shuffle();
  return { ok: true, count };
}

export async function setVolume(
  service: MusicService,
  player: Player,
  level: number,
): Promise<ControlResult<{ level: number }>> {
  if (!Number.isInteger(level) || level < 0 || level > MAX_VOLUME) {
    return { ok: false, reason: "volumeOutOfRange", max: MAX_VOLUME };
  }
  await player.setVolume(level);
  refreshNowPlaying(service, player.guildId);
  return { ok: true, level };
}

// --- seek -------------------------------------------------------------------------------------

function seekable(
  player: Player,
): { track: Track; durationMs: number } | ControlFailure {
  const track = player.queue.current;
  if (!track) return nothingPlaying;
  if (!track.info.isSeekable || track.info.isStream)
    return { ok: false, reason: "notSeekable" };
  return { track, durationMs: track.info.duration };
}

/** Seeks to an absolute position (ms). */
export async function seekTo(
  _service: MusicService,
  player: Player,
  positionMs: number,
): Promise<ControlResult<{ positionMs: number }>> {
  const target = seekable(player);
  if ("ok" in target) return target;
  if (!Number.isFinite(positionMs) || positionMs < 0)
    return { ok: false, reason: "outOfRange", max: 0 };
  if (positionMs > target.durationMs)
    return { ok: false, reason: "beyondEnd", durationMs: target.durationMs };
  await player.seek(positionMs);
  return { ok: true, positionMs };
}

/** Seeks relative to the current position (negative = rewind). The result is clamped to [0, duration - 1 s]. */
export async function seekBy(
  _service: MusicService,
  player: Player,
  deltaMs: number,
): Promise<ControlResult<{ positionMs: number }>> {
  const target = seekable(player);
  if ("ok" in target) return target;
  const upperBound = Math.max(0, target.durationMs - 1000);
  const positionMs = Math.min(
    upperBound,
    Math.max(0, Math.round(player.position + deltaMs)),
  );
  await player.seek(positionMs);
  return { ok: true, positionMs };
}

// --- queue editing ----------------------------------------------------------------------------

/** Removes the queued track at a 1-based position. */
export async function removeAt(
  _service: MusicService,
  player: Player,
  position: number,
): Promise<ControlResult<{ removed: Track | UnresolvedTrack }>> {
  const tracks = player.queue.tracks;
  const removed = Number.isInteger(position) ? tracks[position - 1] : undefined;
  if (!removed) return { ok: false, reason: "outOfRange", max: tracks.length };
  await player.queue.splice(position - 1, 1);
  return { ok: true, removed };
}

/** Moves a queued track between two 1-based positions. */
export async function move(
  _service: MusicService,
  player: Player,
  from: number,
  to: number,
): Promise<
  ControlResult<{ track: Track | UnresolvedTrack; from: number; to: number }>
> {
  const tracks = player.queue.tracks;
  const max = tracks.length;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    from > max ||
    to < 1 ||
    to > max
  ) {
    return { ok: false, reason: "outOfRange", max };
  }
  const track = tracks[from - 1];
  if (!track) return { ok: false, reason: "outOfRange", max };
  if (from !== to) {
    await player.queue.splice(from - 1, 1);
    await player.queue.splice(to - 1, 0, track);
  }
  return { ok: true, track, from, to };
}

/** Clears the upcoming queue (the current track keeps playing). */
export async function clear(
  _service: MusicService,
  player: Player,
): Promise<ControlResult<{ count: number }>> {
  const count = player.queue.tracks.length;
  if (count === 0) return { ok: false, reason: "queueEmpty" };
  await player.queue.splice(0, count);
  return { ok: true, count };
}

// --- filters ----------------------------------------------------------------------------------

export async function applyFilter(
  service: MusicService,
  player: Player,
  name: FilterName,
): Promise<ControlResult<{ filter: FilterName | null }>> {
  const filter = await applyFilterPreset(
    player,
    name,
    service.getState(player.guildId),
  );
  refreshNowPlaying(service, player.guildId);
  return { ok: true, filter };
}
