import type { GuildSettings, GuildSettingsStore } from './guild-settings.js';
import { defaultSettings, validateSettingsPatch } from './guild-settings.js';

/** Settings kept in memory only; they reset when the process restarts. */
export class InMemoryGuildSettingsStore implements GuildSettingsStore {
  private readonly data = new Map<string, GuildSettings>();

  get(guildId: string): Promise<GuildSettings> {
    return Promise.resolve({ ...(this.data.get(guildId) ?? defaultSettings()) });
  }

  update(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings> {
    try {
      validateSettingsPatch(patch);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const next: GuildSettings = { ...(this.data.get(guildId) ?? defaultSettings()), ...patch };
    this.data.set(guildId, next);
    return Promise.resolve({ ...next });
  }

  reset(guildId: string): Promise<void> {
    this.data.delete(guildId);
    return Promise.resolve();
  }
}
