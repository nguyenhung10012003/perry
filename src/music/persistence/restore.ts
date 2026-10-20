import { ChannelType, PermissionFlagsBits } from "discord.js";
import type { LavalinkNode } from "lavalink-client";
import { RESTORE_STAGGER_MS } from "../../config/constants.js";
import { safeError } from "../../utils/errors.js";
import { applyFilterPreset } from "../filters.js";
import { countHumans } from "../lifecycle.js";
import type { MusicService } from "../music-service.js";
import { sendNotice } from "../now-playing.js";
import { fromSnapTrack } from "./snapshot.js";
import type { PlayerSnapshotV1 } from "./snapshot.js";

/** Max time to wait for the Lavalink session id after the node connected. */
const SESSION_WAIT_MS = 10_000;
const SESSION_POLL_MS = 100;
/** Never seek closer than this to the end of a track (it would end right away). */
const END_GUARD_MS = 2000;

const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
];

/** Short codes logged for every snapshot that was not restored. Never contains URLs, tokens or titles. */
export type RestoreOutcome =
  | "restored"
  | "invalid"
  | "guild-missing"
  | "player-active"
  | "channel-missing"
  | "channel-type"
  | "no-permission"
  | "channel-full"
  | "no-humans"
  | "empty"
  | "failed";

export interface RestoreSummary {
  restored: number;
  discarded: number;
  failed: number;
}

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function waitForSession(
  node: LavalinkNode,
  service: MusicService,
): Promise<boolean> {
  for (let waited = 0; waited < SESSION_WAIT_MS; waited += SESSION_POLL_MS) {
    if (service.isStopping) return false;
    if (node.sessionId) {
      // NodeSupervisor handles the "ready" op one tick after the session id is stored.
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      return true;
    }
    await sleep(SESSION_POLL_MS);
  }
  return false;
}

/** Position to resume at: 0 for streams and non-seekable tracks, never within END_GUARD_MS of the end. */
export function clampResumePosition(snapshot: PlayerSnapshotV1): number {
  const current = snapshot.current;
  if (!current || current.isStream || !current.isSeekable) return 0;
  const position = Math.max(0, Math.floor(snapshot.positionMs));
  if (current.duration <= 0) return position;
  return Math.min(position, Math.max(0, current.duration - END_GUARD_MS));
}

/** Restores one guild. Never throws: any failure destroys the half-built player and discards the snapshot. */
export async function restoreGuild(
  service: MusicService,
  guildId: string,
): Promise<RestoreOutcome> {
  const { client, logger, snapshots } = service;
  const discard = async (outcome: RestoreOutcome): Promise<RestoreOutcome> => {
    logger.info({ guildId, reason: outcome }, "Player snapshot discarded");
    await snapshots.discard(guildId);
    return outcome;
  };

  const snapshot = await client.storage.snapshots.load(guildId);
  // load() already deleted snapshots that are invalid or written by another version.
  if (!snapshot) {
    logger.info({ guildId, reason: "invalid" }, "No usable player snapshot");
    return "invalid";
  }
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return discard("guild-missing");
  if (service.getPlayer(guildId)) {
    // A live player owns the guild: drop the old snapshot and let the live one be written again.
    const outcome = await discard("player-active");
    snapshots.markDirty(guildId);
    return outcome;
  }
  if (!snapshot.current && snapshot.queue.length === 0) return discard("empty");

  const channel = guild.channels.cache.get(snapshot.voiceChannelId);
  if (!channel) return discard("channel-missing");
  if (channel.type !== ChannelType.GuildVoice) return discard("channel-type");
  const botId = client.user?.id;
  const me =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!botId || !me) return discard("no-permission");
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(REQUIRED_PERMISSIONS)) return discard("no-permission");
  if (channel.full && !permissions.has(PermissionFlagsBits.MoveMembers))
    return discard("channel-full");
  if (countHumans(guild, channel.id, botId) === 0) return discard("no-humans");

  snapshots.beginRestore(guildId);
  try {
    const player = await service.getOrCreatePlayer({
      guild,
      voiceChannelId: channel.id,
      textChannelId: snapshot.textChannelId,
      volume: snapshot.volume,
    });
    const manager = service.manager;
    const current = snapshot.current
      ? fromSnapTrack(manager, snapshot.current)
      : null;
    const queued = snapshot.queue.map((snap) => fromSnapTrack(manager, snap));
    player.queue.previous.push(
      ...snapshot.previous.map((snap) => fromSnapTrack(manager, snap)),
    );
    if (queued.length > 0) await player.queue.add(queued);
    if (snapshot.repeatMode !== "off")
      await player.setRepeatMode(snapshot.repeatMode);

    const position = clampResumePosition(snapshot);
    if (current) {
      await player.play({
        clientTrack: current,
        position,
        paused: snapshot.paused,
      });
    } else {
      await player.play({ paused: snapshot.paused });
    }
    service.cancelIdleTimer(guildId);

    if (snapshot.filter && snapshot.filter !== "off") {
      try {
        await applyFilterPreset(
          player,
          snapshot.filter,
          service.getOrCreateState(guildId),
        );
      } catch (err) {
        logger.warn(
          { err: safeError(err), guildId },
          "Could not re-apply the saved filter",
        );
      }
    }
    const trackCount = queued.length + (current ? 1 : 0);
    service.track(
      sendNotice(service, snapshot.textChannelId, (t) => t.music.restored(trackCount)),
    );
    logger.info(
      { guildId, tracks: trackCount, positionMs: position },
      "Player restored",
    );
    return "restored";
  } catch (err) {
    logger.warn({ err: safeError(err), guildId }, "Player restore failed");
    await service
      .destroyPlayer(guildId, "RestoreFailed")
      .catch(() => undefined);
    await discard("failed");
    return "failed";
  } finally {
    snapshots.endRestore(guildId);
  }
}

/** One-shot retry of the restore when Redis comes back (snapshots live for SNAPSHOT_TTL_SECONDS). */
function retryRestoreOnRecovery(service: MusicService): void {
  const redisHealth = service.client.storage.health.redis;
  if (!redisHealth) return;
  let done = false;
  redisHealth.onRecover(() => {
    if (done || service.isStopping) return undefined;
    const node = service.getSearchNode();
    if (!node) return undefined;
    done = true;
    return restorePlayers(service, node).then(() => undefined);
  });
}

/**
 * Restores every stored snapshot, one guild at a time (RESTORE_STAGGER_MS apart). Runs once per process, after the
 * first Lavalink node connected (see MusicService.init). Never throws.
 */
export async function restorePlayers(
  service: MusicService,
  node: LavalinkNode,
): Promise<RestoreSummary> {
  const summary: RestoreSummary = { restored: 0, discarded: 0, failed: 0 };
  const { logger } = service;
  try {
    if (!(await waitForSession(node, service))) {
      logger.warn("Player restore skipped: Lavalink session is not ready");
      return summary;
    }
    const guildIds = await service.client.storage.snapshots.listGuildIds();
    if (guildIds === null) {
      logger.warn(
        "Player restore postponed: Redis is unavailable, retrying once it recovers",
      );
      retryRestoreOnRecovery(service);
      return summary;
    }
    if (guildIds.length === 0) {
      logger.info("No player snapshots to restore");
      return summary;
    }
    logger.info({ snapshots: guildIds.length }, "Restoring players");
    for (const [index, guildId] of guildIds.entries()) {
      if (service.isStopping) break;
      if (index > 0) await sleep(RESTORE_STAGGER_MS);
      let outcome: RestoreOutcome;
      try {
        outcome = await restoreGuild(service, guildId);
      } catch (err) {
        logger.warn({ err: safeError(err), guildId }, "Player restore crashed");
        outcome = "failed";
      }
      if (outcome === "restored") summary.restored++;
      else if (outcome === "failed") summary.failed++;
      else summary.discarded++;
    }
    logger.info(summary, "Player restore finished");
  } catch (err) {
    logger.warn({ err: safeError(err) }, "Player restore aborted");
  }
  return summary;
}
