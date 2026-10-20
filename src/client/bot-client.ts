import { Client, Collection, GatewayIntentBits } from 'discord.js';
import type { Config } from '../config/env.js';
import { MusicService } from '../music/music-service.js';
import type { GuildSettingsStore } from '../settings/guild-settings.js';
import type { Storage } from '../storage/types.js';
import type { Command } from '../types/command.js';
import type { Logger } from '../utils/logger.js';

export class BotClient extends Client {
  readonly commands = new Collection<string, Command>();
  readonly config: Config;
  readonly logger: Logger;
  readonly storage: Storage;
  readonly settings: GuildSettingsStore;
  readonly music: MusicService;
  shuttingDown = false;

  constructor(config: Config, logger: Logger, storage: Storage) {
    super({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      allowedMentions: { parse: [] },
    });
    this.config = config;
    this.logger = logger;
    this.storage = storage;
    this.settings = storage.settings;
    this.music = new MusicService(this);
  }
}
