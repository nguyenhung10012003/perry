import { EmbedBuilder } from 'discord.js';

export const BRAND_COLOR = 0x5865f2;
export const ERROR_COLOR = 0xed4245;

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(BRAND_COLOR);
}

export function infoEmbed(description: string): EmbedBuilder {
  return baseEmbed().setDescription(description);
}

export function errorEmbed(description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(ERROR_COLOR).setDescription(description);
}
