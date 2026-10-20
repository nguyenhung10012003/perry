import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { BotClient } from '../client/bot-client.js';

export type Category = 'music' | 'general' | 'settings';

export interface Requirements {
  /** User must be in a voice channel (and the bot's channel when a player exists). */
  needsVoice?: boolean;
  /** A player must exist for the guild. */
  needsPlayer?: boolean;
  /** Something must currently be playing. */
  needsPlaying?: boolean;
  /** DJ role check applies when the guild configured one. */
  djOnly?: boolean;
  /** The requester of the affected track may bypass the DJ check. */
  requesterBypass?: boolean;
  /** Allows the command to run when the bot is idle in a voice channel (e.g. /join). */
  idleJoin?: boolean;
}

/** Builder output shared by SlashCommandBuilder and its option/subcommand variants. */
export interface CommandData {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export interface CommandContext {
  interaction: ChatInputCommandInteraction<'cached'>;
  client: BotClient;
}

export interface AutocompleteContext {
  interaction: AutocompleteInteraction<'cached'>;
  client: BotClient;
}

export interface Command {
  data: CommandData;
  category: Category;
  cooldownSeconds?: number;
  requirements?: Requirements;
  execute(ctx: CommandContext): Promise<void>;
  autocomplete?(ctx: AutocompleteContext): Promise<void>;
}
