import type { ClientEvents } from "discord.js";
import type { BotClient } from "../client/bot-client.js";
import { clientReady } from "./client-ready.js";
import { guildDelete } from "./guild-delete.js";
import { guildRoleDelete } from "./guild-role-delete.js";
import { interactionCreate } from "./interaction-create.js";
import { voiceStateUpdate } from "./voice-state-update.js";

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute(client: BotClient, ...args: ClientEvents[K]): Promise<void> | void;
}

/** Explicit list of event modules. */
export const events: BotEvent<keyof ClientEvents>[] = [
  clientReady,
  guildDelete,
  guildRoleDelete,
  interactionCreate,
  voiceStateUpdate,
];
