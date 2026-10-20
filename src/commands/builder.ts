import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';

/** Creates a guild-only, guild-install slash command builder. */
export function createCommand(name: string, description: string): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
}
