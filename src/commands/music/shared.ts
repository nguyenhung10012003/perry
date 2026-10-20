import { DiscordAPIError } from "discord.js";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { Player, Track, UnresolvedTrack } from "lavalink-client";
import type { BotClient } from "../../client/bot-client.js";
import { t } from "../../i18n/index.js";
import { controlError } from "../../music/controls.js";
import type { ControlFailure } from "../../music/controls.js";
import { safeTitle } from "../../music/format.js";
import type { AutocompleteChoice, LoadOutcome } from "../../music/search.js";
import { UserError } from "../../utils/errors.js";
import { replyError, replyInfo } from "../../utils/respond.js";

/** Helpers shared by the music command modules (presentation only, no player mutation). */

/** Discord: unknown interaction (autocomplete answered too late). */
const UNKNOWN_INTERACTION = 10062;

type CommandInteraction = ChatInputCommandInteraction<"cached">;

/** The guild's player. Guards already ran, so a missing player only happens on a race (player destroyed). */
export function requirePlayer(client: BotClient, guildId: string): Player {
  const player = client.music.getPlayer(guildId);
  if (!player) throw new UserError(t.errors.noPlayer);
  return player;
}

/** Public confirmation message. */
export function announce(
  interaction: CommandInteraction,
  message: string,
): Promise<void> {
  return replyInfo(interaction, message, { ephemeral: false });
}

/** Ephemeral error for a failed control. */
export function failControl(
  interaction: CommandInteraction,
  failure: ControlFailure,
): Promise<void> {
  return replyError(interaction, controlError(failure));
}

/** Markdown-safe title of a track (or a dash when unknown). */
export function titleOf(track: Track | UnresolvedTrack | null | undefined): string {
  return safeTitle(track?.info.title ?? "-");
}

/** Error message for every non-ok load outcome (shared by /play and /radio). */
export function loadErrorMessage(
  outcome: Exclude<LoadOutcome, { kind: "ok" }>,
): string {
  switch (outcome.kind) {
    case "empty":
      return t.errors.noResults;
    case "error":
      return t.errors.loadFailed;
    case "unsafe":
      return t.errors.unsafeUrl;
    case "sourceDisabled":
      return t.errors.sourceDisabled;
    case "noNode":
      return t.errors.noNode;
  }
}

/** Answers an autocomplete interaction; a response that arrives after the 3 s window is silently dropped. */
export async function respondAutocomplete(
  interaction: AutocompleteInteraction,
  choices: AutocompleteChoice[],
): Promise<void> {
  try {
    await interaction.respond(choices);
  } catch (err) {
    if (err instanceof DiscordAPIError && err.code === UNKNOWN_INTERACTION)
      return;
    throw err;
  }
}
