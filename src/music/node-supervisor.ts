import type { LavalinkNode } from 'lavalink-client';
import { NODE_BACKOFF_MS } from '../config/constants.js';
import { redact, safeError } from '../utils/errors.js';
import type { MusicService } from './music-service.js';

/** How long Lavalink keeps a session (and its players) alive after the websocket drops. */
const RESUME_TIMEOUT_MS = 60_000;

interface ReadyPayload {
  op: 'ready';
  resumed: boolean;
  sessionId: string;
}

function isReadyPayload(payload: unknown): payload is ReadyPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return candidate.op === 'ready' && typeof candidate.sessionId === 'string' && typeof candidate.resumed === 'boolean';
}

/**
 * Keeps the Lavalink node connected. lavalink-client makes one quick reconnect attempt; when that fails it
 * destroys the node and this class re-creates it with exponential backoff (NODE_BACKOFF_MS, capped at 60 s).
 * Sessions are resumable for 60 s so a short websocket drop keeps playback.
 * Event handlers never throw.
 */
export class NodeSupervisor {
  private attempt = 0;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly service: MusicService) {}

  attach(): void {
    const nodes = this.service.manager.nodeManager;

    nodes.on('connect', (node) => {
      this.attempt = 0;
      this.clearTimer();
      this.service.logger.info({ node: node.id }, 'Lavalink node connected');
    });

    // The "ready" op carries the session id (and whether the previous session was resumed).
    nodes.on('raw', (node, payload) => {
      if (!isReadyPayload(payload)) return;
      this.onReady(node, payload);
    });

    nodes.on('disconnect', (node, reason) => {
      this.service.logger.warn(
        { node: node.id, code: reason.code, reason: reason.reason ? redact(reason.reason) : undefined },
        'Lavalink node disconnected',
      );
    });

    nodes.on('error', (node, error) => {
      this.service.logger.warn({ node: node.id, err: safeError(error) }, 'Lavalink node error');
    });

    nodes.on('reconnecting', (node) => {
      this.service.logger.debug({ node: node.id }, 'Lavalink node reconnecting');
    });

    nodes.on('destroy', (node, reason) => {
      this.service.logger.warn({ node: node.id, reason: reason ? String(reason) : undefined }, 'Lavalink node destroyed');
      this.scheduleRecreate();
    });
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private onReady(node: LavalinkNode, payload: ReadyPayload): void {
    // The library stores the new session id right after the "raw" event returns, so defer one tick.
    setImmediate(() => {
      try {
        // Passing the session id on reconnect lets Lavalink resume the session instead of dropping players.
        node.options.sessionId = payload.sessionId;
        node.updateSession(true, RESUME_TIMEOUT_MS).catch((err: unknown) => {
          this.service.logger.warn({ err: safeError(err) }, 'Could not enable Lavalink session resuming');
        });
        if (!payload.resumed) this.dropStalePlayers(node);
      } catch (err) {
        this.service.logger.warn({ err: safeError(err) }, 'Lavalink ready handler failed');
      }
    });
  }

  /** Players that existed on the old session are unknown to a fresh session and cannot be revived. */
  private dropStalePlayers(node: LavalinkNode): void {
    for (const player of this.service.manager.players.values()) {
      if (player.node.id !== node.id) continue;
      this.service.fireAndForget(player.destroy('NodeReconnectFail'), 'dropStalePlayer');
    }
  }

  private scheduleRecreate(): void {
    if (this.stopped || this.service.isStopping || this.timer) return;
    const index = Math.min(this.attempt, NODE_BACKOFF_MS.length - 1);
    const delay = NODE_BACKOFF_MS[index] ?? NODE_BACKOFF_MS[NODE_BACKOFF_MS.length - 1];
    this.attempt++;
    this.service.logger.info({ delayMs: delay, attempt: this.attempt }, 'Scheduling Lavalink node reconnect');
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.recreate();
    }, delay);
    this.timer.unref();
  }

  private recreate(): void {
    if (this.stopped || this.service.isStopping) return;
    try {
      const manager = this.service.manager;
      let node = manager.nodeManager.getNode(this.service.nodeOptions.id ?? '');
      if (!node) node = manager.nodeManager.createNode(this.service.nodeOptions);
      if (!node.connected) node.connect();
    } catch (err) {
      this.service.logger.warn({ err: safeError(err) }, 'Lavalink node re-create failed');
      this.scheduleRecreate();
    }
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
