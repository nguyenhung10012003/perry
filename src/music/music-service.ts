import { LavalinkManager } from "lavalink-client";
import type {
  LavalinkNode,
  LavalinkNodeOptions,
  Player,
} from "lavalink-client";
import type { Guild } from "discord.js";
import type { BotClient } from "../client/bot-client.js";
import { NODE_BACKOFF_MS } from "../config/constants.js";
import { safeError, UserError } from "../utils/errors.js";
import type { Logger } from "../utils/logger.js";
import { childLogger } from "../utils/logger.js";
import { AutoplayController } from "./discovery/autoplay.js";
import { DiscoveryEngine } from "./discovery/engine.js";
import { createProviders } from "./discovery/providers/index.js";
import { GuildMusicState } from "./guild-state.js";
import { cancelIdleTimer, startIdleTimer } from "./lifecycle.js";
import { NodeSupervisor } from "./node-supervisor.js";
import { SnapshotQueueStore } from "./persistence/queue-store.js";
import { restorePlayers } from "./persistence/restore.js";
import { SnapshotManager } from "./persistence/snapshot-manager.js";
import { registerTrackEvents } from "./track-events.js";

/** Max time shutdown waits for queued Now-Playing cleanups. */
const SHUTDOWN_CLEANUP_WAIT_MS = 3000;

export interface PlayerRequest {
  guild: Guild;
  voiceChannelId: string;
  textChannelId: string | null;
  /** Initial volume for a NEW player (restore); defaults to the guild setting. */
  volume?: number;
}

/**
 * Owns the LavalinkManager and all per-guild music state. Everything is keyed by guildId;
 * there is no module-level queue or player.
 */
export class MusicService {
  readonly manager: LavalinkManager;
  readonly states = new Map<string, GuildMusicState>();
  readonly logger: Logger;
  readonly nodeOptions: LavalinkNodeOptions;
  readonly snapshots: SnapshotManager;
  /** Finds related tracks for autoplay, radio and similar (provider chain from DISCOVERY_PROVIDERS). */
  readonly discovery: DiscoveryEngine;
  /** Refills the queue with related tracks (autoplay, /radio); registered as the library's autoPlayFunction. */
  readonly autoplay: AutoplayController;
  private readonly supervisor: NodeSupervisor;
  private initialized = false;
  private stopping = false;
  private readonly background = new Set<Promise<unknown>>();

  constructor(readonly client: BotClient) {
    this.logger = childLogger(client.logger, "music");
    const { host, port, password, secure } = client.config.lavalink;
    this.nodeOptions = {
      id: "main",
      host,
      port,
      authorization: password,
      secure,
      // One quick library retry; after that NodeSupervisor re-creates the node with exponential backoff.
      retryAmount: 1,
      retryDelay: NODE_BACKOFF_MS[0],
      requestSignalTimeoutMS: 10_000,
      heartBeatInterval: 30_000,
      enablePingOnStatsCheck: true,
    };
    // Snapshots: created before the manager because the queue store (the change seam) is passed to it.
    this.snapshots = new SnapshotManager({
      store: client.storage.snapshots,
      enabled: client.storage.driver !== "memory" && client.config.storage.playerRestore,
      logger: childLogger(this.logger, "snapshots"),
      getPlayer: (guildId) => this.manager.getPlayer(guildId),
      getPlayers: () => this.manager.players.values(),
      getState: (guildId) => this.states.get(guildId),
    });
    const queueStore = new SnapshotQueueStore((guildId) => {
      this.snapshots.markDirty(guildId);
    });
    this.autoplay = new AutoplayController(this);
    this.manager = new LavalinkManager({
      nodes: [this.nodeOptions],
      sendToShard: (guildId, payload) => {
        client.guilds.cache.get(guildId)?.shard.send(payload);
      },
      autoSkip: true,
      autoSkipOnResolveError: true,
      playerOptions: {
        defaultSearchPlatform: "ytsearch",
        onDisconnect: { autoReconnect: false, destroyPlayer: true },
        // destroyAfterMs intentionally unset: idle/24-7 logic is ours (lifecycle.ts).
        // minAutoPlayMs keeps the library default (10 s) so a failing refill cannot spin.
        onEmptyQueue: {
          autoPlayFunction: (player, track) =>
            this.autoplay.onQueueEmpty(player, track),
        },
        maxErrorsPerTime: { threshold: 10_000, maxAmount: 5 },
        useUnresolvedData: false,
      },
      queueOptions: { maxPreviousTracks: 25, queueStore },
    });
    const { storage, config } = client;
    this.discovery = new DiscoveryEngine({
      providers: createProviders(config.discovery, {
        cache: storage.cache,
        keys: storage.keys,
      }),
      config: config.discovery,
      recent: storage.recent,
    });
    this.supervisor = new NodeSupervisor(this);
  }

  /** Wires events and connects to Lavalink. Never throws: a down node is retried by NodeSupervisor. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const user = this.client.user;
    if (!user) {
      this.logger.error(
        "Cannot initialise music: client user is not available",
      );
      return;
    }
    try {
      registerTrackEvents(this);
      this.supervisor.attach();
      this.scheduleRestore();
      await this.manager.init({ id: user.id, username: user.username });
      this.logger.info("Music service initialised");
    } catch (err) {
      this.logger.error(
        { err: safeError(err) },
        "Music service failed to initialise",
      );
    }
  }

  /**
   * Restores the saved players once per process, after the first Lavalink node connected
   * (a Lavalink that is still booting is waited for). No-op without snapshots (memory driver, PLAYER_RESTORE=false).
   */
  private scheduleRestore(): void {
    if (!this.snapshots.enabled) return;
    let started = false;
    this.manager.nodeManager.on("connect", (node) => {
      if (started || this.stopping) return;
      started = true;
      this.fireAndForget(restorePlayers(this, node), "restorePlayers");
    });
  }

  /** True when at least one Lavalink node is connected. */
  get ready(): boolean {
    return this.manager.initiated && this.manager.useable;
  }

  /** Throws a UserError when no Lavalink node is usable. */
  ensureReady(): void {
    if (!this.ready) throw new UserError((t) => t.errors.noNode);
  }

  /** First connected node (used for searches and latency checks), or null. */
  getSearchNode(): LavalinkNode | null {
    return this.manager.nodeManager.leastUsedNodes()[0] ?? null;
  }

  getState(guildId: string): GuildMusicState | undefined {
    return this.states.get(guildId);
  }

  getOrCreateState(guildId: string): GuildMusicState {
    let state = this.states.get(guildId);
    if (!state || state.disposed) {
      state = new GuildMusicState(guildId);
      this.states.set(guildId, state);
    }
    return state;
  }

  getPlayer(guildId: string): Player | undefined {
    return this.manager.getPlayer(guildId);
  }

  /**
   * Returns the guild's player, creating and connecting it when needed (volume comes from guild settings).
   * An existing idle player is moved when `voiceChannelId` differs. Throws UserError(noNode) if no node is usable.
   */
  async getOrCreatePlayer(request: PlayerRequest): Promise<Player> {
    this.ensureReady();
    const { guild, voiceChannelId, textChannelId } = request;
    const existing = this.manager.getPlayer(guild.id);
    if (existing) {
      if (textChannelId) {
        const changed = existing.textChannelId !== textChannelId;
        existing.textChannelId = textChannelId;
        existing.options.textChannelId = textChannelId;
        if (changed) this.snapshots.markDirty(guild.id);
      }
      if (
        existing.voiceChannelId !== voiceChannelId &&
        existing.options.voiceChannelId !== voiceChannelId
      ) {
        await existing.changeVoiceState({ voiceChannelId });
      }
      return existing;
    }
    const volume =
      request.volume ?? (await this.client.settings.get(guild.id)).defaultVolume;
    const player = this.manager.createPlayer({
      guildId: guild.id,
      voiceChannelId,
      ...(textChannelId ? { textChannelId } : {}),
      selfDeaf: true,
      volume,
    });
    this.getOrCreateState(guild.id);
    try {
      await player.connect();
    } catch (err) {
      await player.destroy("ConnectFailed").catch(() => undefined);
      this.disposeState(guild.id);
      throw err;
    }
    // A fresh player is idle until something plays; trackStart cancels this timer.
    this.startIdleTimer(guild.id);
    return player;
  }

  /** Destroys the guild's player (reason is used for user notices, see track-events.ts). */
  async destroyPlayer(guildId: string, reason: string): Promise<void> {
    const player = this.manager.getPlayer(guildId);
    if (player) {
      await player.destroy(reason);
      return;
    }
    this.disposeState(guildId);
  }

  /** Starts the 3 minute idle timer (no-op when 24/7 is enabled). Safe to call repeatedly. */
  startIdleTimer(guildId: string): void {
    this.fireAndForget(startIdleTimer(this, guildId), "startIdleTimer");
  }

  /** Cancels the idle timer. Call after adding tracks to the queue. */
  cancelIdleTimer(guildId: string): void {
    cancelIdleTimer(this, guildId);
  }

  /** Clears timers and forgets the guild state. */
  disposeState(guildId: string): void {
    const state = this.states.get(guildId);
    if (!state) return;
    state.dispose();
    this.states.delete(guildId);
  }

  /** Tracks a background task so shutdown can wait for it (e.g. Now-Playing cleanup). */
  track(task: Promise<unknown>): void {
    this.background.add(task);
    const done = (): void => {
      this.background.delete(task);
    };
    task.then(done, done);
  }

  /** Runs a promise in the background and logs (never throws) when it fails. */
  fireAndForget(task: Promise<unknown>, label: string): void {
    task.catch((err: unknown) => {
      this.logger.warn(
        { err: safeError(err), task: label },
        "Background music task failed",
      );
    });
  }

  get isStopping(): boolean {
    return this.stopping;
  }

  /**
   * Saves every player (kept for the next start), destroys them, waits briefly for cleanups and disconnects
   * from Lavalink. Idempotent.
   */
  async shutdown(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.supervisor.stop();
    // Exact positions first; after freeze() destroy() (which always empties the queue store) cannot touch them.
    await this.snapshots.flushAll();
    this.snapshots.freeze();
    const players = [...this.manager.players.values()];
    await Promise.allSettled(
      players.map((player) => player.destroy("Shutdown")),
    );
    let cleanupTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.background]),
      new Promise<void>((resolve) => {
        cleanupTimer = setTimeout(resolve, SHUTDOWN_CLEANUP_WAIT_MS);
      }),
    ]);
    clearTimeout(cleanupTimer);
    for (const state of this.states.values()) state.dispose();
    this.states.clear();
    for (const node of [...this.manager.nodeManager.nodes.values()]) {
      try {
        node.destroy("Shutdown", true, false);
      } catch (err) {
        this.logger.warn(
          { err: safeError(err) },
          "Failed to close Lavalink node",
        );
      }
    }
    this.snapshots.dispose();
  }
}
