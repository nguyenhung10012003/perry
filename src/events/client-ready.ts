import { ActivityType, Events } from "discord.js";
import { commands } from "../commands/index.js";
import { getMessages } from "../i18n/index.js";
import {
  createRestPut,
  serializeCommands,
  syncCommandsOnStart,
} from "../startup/command-sync.js";
import type { BotEvent } from "./index.js";

export const clientReady: BotEvent<Events.ClientReady> = {
  name: Events.ClientReady,
  once: true,
  async execute(client, readyClient) {
    // The presence is global (not per guild), so it uses DEFAULT_LOCALE.
    const t = getMessages(client.config.defaultLocale);
    readyClient.user.setPresence({
      activities: [{ name: t.presence.activity, type: ActivityType.Custom }],
      status: "online",
    });
    client.logger.info(
      { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
      "Bot ready",
    );
    // Fire-and-forget and never throws: registers the slash commands only when their definitions changed.
    if (client.config.startup.registerCommands) {
      void syncCommandsOnStart({
        config: client.config,
        bodies: serializeCommands(commands),
        cache: client.storage.cache,
        keys: client.storage.keys,
        logger: client.logger,
        put: createRestPut(client.config.discordToken),
      });
    }
    // A down Lavalink must not stop the bot: init() never throws and NodeSupervisor keeps retrying.
    await client.music.init();
  },
};
