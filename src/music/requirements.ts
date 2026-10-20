import type { Requirements } from '../types/command.js';

/**
 * Requirement presets shared by slash commands and Now-Playing buttons (plan section 7).
 * - play:         /play
 * - join:         /join (may move an idle bot)
 * - control:      /pause /resume /stop /leave /volume /loop /shuffle /clear /move /filter (and np:pause/stop/loop/shuffle)
 * - trackControl: /skip /previous /remove (and np:skip) - the requester of the affected track bypasses the DJ role
 * - seek:         /seek /forward /rewind - like trackControl but something must be playing
 * - view:         /queue (and np:queue) - a player must exist, never DJ-gated
 * - nowPlaying:   /nowplaying /lyrics - something must be playing, never DJ-gated
 * - autoplay:     /autoplay - settings only: DJ-gated when a DJ role is set, no voice/player/join-permission requirement
 * - similar:      /similar - something must be playing; adding from its menu re-runs the guards with `play`
 * (/radio uses `play`.)
 */
export const REQ = {
  play: { needsVoice: true },
  join: { needsVoice: true, idleJoin: true },
  control: { needsVoice: true, needsPlayer: true, djOnly: true },
  trackControl: { needsVoice: true, needsPlayer: true, djOnly: true, requesterBypass: true },
  seek: { needsVoice: true, needsPlayer: true, needsPlaying: true, djOnly: true, requesterBypass: true },
  view: { needsPlayer: true },
  nowPlaying: { needsPlayer: true, needsPlaying: true },
  autoplay: { djOnly: true },
  similar: { needsVoice: true, needsPlayer: true, needsPlaying: true },
} as const satisfies Record<string, Requirements>;
