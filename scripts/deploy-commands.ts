import { Routes } from "discord.js";
import { commands } from "../src/commands/index.js";
import { loadConfig } from "../src/config/env.js";
import {
  createRestPut,
  resolveTarget,
  serializeCommands,
} from "../src/startup/command-sync.js";
import { safeError } from "../src/utils/errors.js";

const forceGlobal = process.argv.includes("--global");
const clearDev = process.argv.includes("--clear-dev");

async function main(): Promise<void> {
  const config = loadConfig();
  const put = createRestPut(config.discordToken);

  if (clearDev) {
    if (!config.devGuildId)
      throw new Error("DEV_GUILD_ID is not set, nothing to clear");
    await put(
      Routes.applicationGuildCommands(config.clientId, config.devGuildId),
      [],
    );
    console.log("Cleared guild commands of the dev guild.");
    return;
  }

  const body = serializeCommands(commands);
  const names = body.map((c) => c.name).join(", ");
  const target = resolveTarget(config, forceGlobal);
  await put(target.route, body);
  if (target.scope === "global")
    console.log(`Registered ${body.length} global command(s): ${names}`);
  else
    console.log(
      `Registered ${body.length} command(s) in the dev guild: ${names}`,
    );
}

main().catch((err: unknown) => {
  const e = safeError(err);
  console.error(`Deploy failed: ${e.name}: ${e.message}`);
  process.exit(1);
});
