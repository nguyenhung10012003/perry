import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import type { APIApplicationCommandOptionChoice, LocalizationMap } from 'discord.js';
import { en, localizations } from '../i18n/index.js';
import type { Messages } from '../i18n/index.js';

/** Picks one string of a catalog; used for command metadata (English default + localizations). */
export type MessageSelector = (m: Messages) => string;

/** Anything with a description and description localizations (options and subcommands). */
interface Describable<T> {
  setDescription(description: string): T;
  setDescriptionLocalizations(localizedDescriptions: LocalizationMap | null): T;
}

/**
 * Creates a guild-only, guild-install slash command builder. The description is the English text and the other
 * catalogs become Discord description localizations (shown by each user's client language).
 */
export function createCommand(name: string, select: MessageSelector): SlashCommandBuilder {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(select(en))
    .setDescriptionLocalizations(localizations(select))
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall);
}

/** Sets the English description and its localizations on an option or subcommand builder. */
export function describe<T extends Describable<T>>(builder: T, select: MessageSelector): T {
  return builder.setDescription(select(en)).setDescriptionLocalizations(localizations(select));
}

/** A choice with an English name and localized names; the value never changes. */
export function choice<V extends string>(value: V, select: MessageSelector): APIApplicationCommandOptionChoice<V> {
  return { name: select(en), name_localizations: localizations(select), value };
}
