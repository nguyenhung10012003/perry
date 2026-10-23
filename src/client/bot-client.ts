import { Client, Collection, GatewayIntentBits, Options } from 'discord.js';
import type { Config } from '../config/env.js';
import { getMessages, resolveLocale } from '../i18n/index.js';
import type { Locale, Messages } from '../i18n/index.js';
import { LevelingService } from '../leveling/leveling-service.js';
import { MusicService } from '../music/music-service.js';
import type { GuildSettingsStore } from '../settings/guild-settings.js';
import type { Storage } from '../storage/types.js';
import type { Command } from '../types/command.js';
import { safeError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';

export class BotClient extends Client {
  readonly commands = new Collection<string, Command>();
  readonly config: Config;
  readonly logger: Logger;
  readonly storage: Storage;
  readonly settings: GuildSettingsStore;
  readonly music: MusicService;
  readonly leveling: LevelingService;
  shuttingDown = false;

  constructor(config: Config, logger: Logger, storage: Storage) {
    super({
      // GuildMessages (not privileged) delivers messageCreate for XP; the message content is not needed.
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages],
      // Nothing reads the message cache, so keep it small instead of 200 messages per channel.
      makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 25 }),
      allowedMentions: { parse: [] },
    });
    this.config = config;
    this.logger = logger;
    this.storage = storage;
    this.settings = storage.settings;
    this.music = new MusicService(this);
    this.leveling = new LevelingService(this);
  }

  /** Effective language of a guild: its `language` setting, otherwise DEFAULT_LOCALE (also for DMs or a failed read). */
  async localeFor(guildId: string | null): Promise<Locale> {
    if (guildId === null) return this.config.defaultLocale;
    try {
      const settings = await this.settings.get(guildId);
      return resolveLocale(settings.language, this.config.defaultLocale);
    } catch (err) {
      this.logger.debug({ err: safeError(err), guildId }, 'Could not read the guild language, using the default');
      return this.config.defaultLocale;
    }
  }

  /** Message catalog for a guild (see localeFor). */
  async messagesFor(guildId: string | null): Promise<Messages> {
    return getMessages(await this.localeFor(guildId));
  }
}
