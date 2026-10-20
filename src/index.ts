import { BotClient } from "./client/bot-client.js";
import { registerEvents } from "./client/register-events.js";
import { commands } from "./commands/index.js";
import { setTimeout as sleep } from "node:timers/promises";
import { LOGIN_FAILURE_EXIT_DELAY_MS, SHUTDOWN_TIMEOUT_MS } from "./config/constants.js";
import { loadConfig } from "./config/env.js";
import { startHeartbeat } from "./health/heartbeat.js";
import { migrateOnStart } from "./startup/auto-migrate.js";
import { createStorage } from "./storage/index.js";
import { redact, safeError } from "./utils/errors.js";
import { createLogger } from "./utils/logger.js";

const config = loadConfig();
const logger = createLogger(config);
if (config.startup.autoMigrate && config.storage.driver === "persistent")
  await migrateOnStart(config, logger);
const storage = await createStorage(config, logger);
const client = new BotClient(config, logger, storage);
const stopHeartbeat = startHeartbeat(client, config.startup.heartbeatFile, logger);

for (const command of commands) client.commands.set(command.data.name, command);
registerEvents(client);

client.on("error", (err) =>
  logger.error({ err: safeError(err) }, "Client error"),
);
client.on("warn", (message) =>
  logger.warn({ message: redact(message) }, "Client warning"),
);

let shuttingDown = false;

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  client.shuttingDown = true;
  logger.info("Shutting down");
  stopHeartbeat();

  const watchdog = setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  watchdog.unref();

  try {
    await client.music.shutdown();
  } catch (err) {
    logger.error({ err: safeError(err) }, "Music shutdown failed");
  }
  try {
    await storage.close();
  } catch (err) {
    logger.error({ err: safeError(err) }, "Storage shutdown failed");
  }
  try {
    await client.destroy();
  } catch (err) {
    logger.error({ err: safeError(err) }, "Client destroy failed");
  }
  logger.flush();
  process.exit(exitCode);
}

process.on("unhandledRejection", (reason) => {
  logger.error({ err: safeError(reason) }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err: safeError(err) }, "Uncaught exception");
  void shutdown(1);
});
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

try {
  await client.login(config.discordToken);
} catch (err) {
  const e = safeError(err);
  logger.error({ name: e.name, code: e.code }, `Login failed: ${e.message}`);
  logger.flush();
  // Throttle restart loops (restart: unless-stopped): a SIGTERM during the wait still runs the normal shutdown.
  await sleep(LOGIN_FAILURE_EXIT_DELAY_MS);
  if (!shuttingDown) process.exit(1);
}
