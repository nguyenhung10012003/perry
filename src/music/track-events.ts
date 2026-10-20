import type { Player, Track, UnresolvedTrack } from 'lavalink-client';
import { ERROR_BATCH_MS } from '../config/constants.js';
import type { Messages } from '../i18n/index.js';
import { redact, safeError } from '../utils/errors.js';
import { recentKeys } from './discovery/filters.js';
import type { GuildMusicState } from './guild-state.js';
import { safeTitle } from './format.js';
import type { MusicService } from './music-service.js';
import { endNowPlaying, sendNotice, sendNowPlaying } from './now-playing.js';
import { getRequester, isAutoplayTrack, trackProvider } from './requester.js';

/** Titles listed in one failure notice; the rest is summarised as a count. */
const MAX_LISTED_FAILURES = 5;

/**
 * Which user notice (if any) a player destroy reason produces, as a catalog selector (sendNotice resolves the
 * guild's language). Everything else is silent.
 */
function destroyNotice(reason: string | undefined): ((t: Messages) => string) | null {
  switch (reason) {
    case 'IdleTimeout':
      return (t) => t.music.idleLeft;
    case 'AloneTimeout':
      return (t) => t.music.aloneLeft;
    case 'NodeReconnectFail':
    case 'NodeDestroy':
    case 'NodeDeleted':
    case 'DisconnectAllNodes':
    case 'ReconnectAllNodes':
    case 'PlayerChangeNodeFail':
    case 'PlayerChangeNodeFailNoEligibleNode':
      return (t) => t.music.nodeLost;
    case 'TrackErrorMaxTracksErroredPerTime':
    case 'TrackStuckMaxTracksErroredPerTime':
      return (t) => t.music.tooManyErrors;
    default:
      // UserLeave, UserStop, Shutdown, Disconnected (kicked/moved out), ChannelDeleted, ...: no message.
      return null;
  }
}

function failedTitle(track: Track | UnresolvedTrack | null, payload: unknown): string {
  if (track?.info.title) return track.info.title;
  const fromPayload = (payload as { track?: { info?: { title?: unknown } } } | null)?.track?.info?.title;
  return typeof fromPayload === 'string' && fromPayload.length > 0 ? fromPayload : '?';
}

/**
 * Collects failed tracks and sends ONE notice per ERROR_BATCH_MS window.
 * Exception text is only logged (debug), never shown to users.
 */
function recordFailure(
  service: MusicService,
  player: Player,
  track: Track | UnresolvedTrack | null,
  payload: unknown,
  kind: 'error' | 'stuck',
): void {
  const state = service.getState(player.guildId);
  if (!state || state.disposed) return;
  const title = failedTitle(track, payload);

  const exception = (payload as { exception?: { message?: unknown } } | null)?.exception?.message;
  service.logger.warn({ guildId: player.guildId, kind, title: redact(title).slice(0, 100) }, 'Track playback failed');
  if (payload instanceof Error) {
    service.logger.debug({ err: safeError(payload) }, 'Track failure detail');
  } else if (typeof exception === 'string') {
    service.logger.debug({ message: redact(exception) }, 'Track failure detail');
  }

  state.errorBatch.push(safeTitle(title, 50));
  if (state.errorTimer) return;
  state.errorTimer = setTimeout(() => {
    state.errorTimer = undefined;
    const titles = [...new Set(state.errorBatch)];
    state.errorBatch = [];
    if (state.disposed || titles.length === 0) return;
    const listed = titles.slice(0, MAX_LISTED_FAILURES);
    service.track(
      sendNotice(service, player.textChannelId, (t) => t.music.trackFailed(listed, titles.length - listed.length)),
    );
  }, ERROR_BATCH_MS);
  state.errorTimer.unref();
}

/**
 * Remembers a started track for discovery de-duplication (recently played set), keeps the last human-requested
 * track as autoplay seed and, with PLAY_HISTORY=true, appends it to the play history. Fire and forget.
 */
function recordPlayed(service: MusicService, player: Player, track: Track, state: GuildMusicState): void {
  const autoplay = isAutoplayTrack(track);
  if (!autoplay) state.humanSeed = track;
  service.fireAndForget(service.client.storage.recent.add(player.guildId, recentKeys(track)), 'recordRecent');
  if (!service.client.config.storage.playHistory) return;
  service.client.storage.history.record({
    guildId: player.guildId,
    identifier: track.info.identifier || null,
    sourceName: track.info.sourceName || null,
    title: track.info.title ? track.info.title.slice(0, 300) : null,
    author: track.info.author ? track.info.author.slice(0, 300) : null,
    durationMs: track.info.isStream ? null : track.info.duration,
    requesterId: autoplay ? null : (getRequester(track)?.id ?? null),
    discoveryProvider: trackProvider(track),
  });
}

/**
 * Subscribes to lavalink-client events (exactly once, called from MusicService.init).
 * Every handler is wrapped so a thrown error is logged and never reaches the event emitter.
 */
export function registerTrackEvents(service: MusicService): void {
  const { manager, logger } = service;

  const safe = (label: string, fn: () => void | Promise<void>): void => {
    const onError = (err: unknown): void => {
      logger.error({ err: safeError(err), event: label }, 'Music event handler failed');
    };
    try {
      const result = fn();
      if (result) result.catch(onError);
    } catch (err) {
      onError(err);
    }
  };

  manager.on('trackStart', (player, track) => {
    safe('trackStart', () => {
      service.snapshots.markDirty(player.guildId);
      const state = service.getState(player.guildId);
      if (!state) return;
      state.clearIdle();
      if (track) recordPlayed(service, player, track, state);
      sendNowPlaying(service, player);
    });
  });

  manager.on('queueEnd', (player) => {
    safe('queueEnd', () => {
      // Nothing left to resume: a restart must not bring this session back.
      service.fireAndForget(service.snapshots.discard(player.guildId), 'discardSnapshot');
      const state = service.getState(player.guildId);
      if (!state) return;
      endNowPlaying(service, state);
      service.startIdleTimer(player.guildId);
    });
  });

  manager.on('trackError', (player, track, payload) => {
    safe('trackError', () => {
      recordFailure(service, player, track, payload, 'error');
    });
  });

  manager.on('trackStuck', (player, track, payload) => {
    safe('trackStuck', () => {
      recordFailure(service, player, track, payload, 'stuck');
    });
  });

  manager.on('playerDestroy', (player, reason) => {
    safe('playerDestroy', () => {
      const guildId = player.guildId;
      const state = service.getState(guildId);
      logger.info({ guildId, reason: reason ? String(reason) : undefined }, 'Player destroyed');
      // Every reason except Shutdown ends the session; Shutdown keeps the snapshot for the next start.
      if (reason !== 'Shutdown') service.fireAndForget(service.snapshots.discard(guildId), 'discardSnapshot');
      if (state) {
        // Cleanup first (it must still see the Now-Playing reference), then clear timers.
        endNowPlaying(service, state);
        state.dispose();
        if (service.states.get(guildId) === state) service.states.delete(guildId);
      }
      const notice = destroyNotice(reason);
      if (notice && !service.isStopping) {
        service.track(sendNotice(service, player.textChannelId, notice));
      }
    });
  });

  manager.on('playerDisconnect', (player, voiceChannelId) => {
    logger.info({ guildId: player.guildId, voiceChannelId }, 'Player disconnected from voice');
  });

  manager.on('playerMove', (player, oldChannelId, newChannelId) => {
    logger.info({ guildId: player.guildId, from: oldChannelId, to: newChannelId }, 'Player moved');
    service.snapshots.markDirty(player.guildId);
  });

  manager.on('playerClientUpdate', (_oldPlayerJson, player) => {
    service.snapshots.markDirty(player.guildId);
  });

  manager.on('playerSocketClosed', (player, payload) => {
    logger.warn(
      { guildId: player.guildId, code: payload.code, byRemote: payload.byRemote, reason: redact(payload.reason ?? '') },
      'Voice websocket closed',
    );
  });
}
