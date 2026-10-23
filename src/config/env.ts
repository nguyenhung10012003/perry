import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { FALLBACK_LOCALE, LOCALES } from "../i18n/locales.js";
import type { Locale } from "../i18n/locales.js";
import { registerSecrets } from "../utils/safe-error.js";
import {
  booleanString,
  exitInvalid,
  optionalText,
  POSTGRES_PROTOCOLS,
  REDIS_PROTOCOLS,
  registerUrlSecrets,
  urlProblem,
} from "./env-helpers.js";

// The helpers moved to env-helpers.ts (shared with the web); re-exported for existing imports.
export {
  booleanString,
  exitInvalid,
  optionalText,
  POSTGRES_PROTOCOLS,
  REDIS_PROTOCOLS,
  registerUrlSecrets,
  urlProblem,
} from "./env-helpers.js";

const PROVIDER_IDS = ["ytmix", "lastfm", "lavasrc", "artist"] as const;
export type DiscoveryProviderId = (typeof PROVIDER_IDS)[number];

const providerList = z
  .string()
  .default(PROVIDER_IDS.join(","))
  .transform((value, ctx) => {
    const result: DiscoveryProviderId[] = [];
    for (const part of value.split(",").map((p) => p.trim())) {
      const id = PROVIDER_IDS.find((candidate) => candidate === part);
      if (id === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `must be a comma separated list of: ${PROVIDER_IDS.join(", ")}`,
        });
        return z.NEVER;
      }
      if (!result.includes(id)) result.push(id);
    }
    return result;
  });

const schema = z
  .object({
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z
      .string()
      .regex(/^\d{17,20}$/, "must be a Discord snowflake"),
    DEV_GUILD_ID: z
      .string()
      .optional()
      .transform((v) =>
        v === undefined || v.trim() === "" ? undefined : v.trim(),
      )
      .pipe(
        z
          .string()
          .regex(/^\d{17,20}$/, "must be a Discord snowflake")
          .optional(),
      ),
    LAVALINK_HOST: z.string().min(1),
    LAVALINK_PORT: z.coerce.number().int().min(1).max(65535),
    LAVALINK_PASSWORD: z.string().min(1),
    LAVALINK_SECURE: booleanString.default(false),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    LOG_PRETTY: booleanString.default(false),
    DEFAULT_LOCALE: optionalText
      .pipe(z.enum(LOCALES).optional())
      .transform((value) => value ?? FALLBACK_LOCALE),
    STORAGE_DRIVER: z.enum(["persistent", "memory"]).default("persistent"),
    DATABASE_URL: optionalText,
    REDIS_URL: optionalText,
    REDIS_KEY_PREFIX: z
      .string()
      .regex(
        /^[a-z0-9_-]{1,32}$/,
        "must match [a-z0-9_-] and be 1-32 characters long",
      )
      .default("perry"),
    PLAYER_RESTORE: booleanString.default(true),
    PLAY_HISTORY: booleanString.default(false),
    PUBSUB_INVALIDATION: booleanString.default(false),
    DISCOVERY_PROVIDERS: providerList,
    LASTFM_API_KEY: optionalText,
    DISCOVERY_LAVASRC_PREFIX: optionalText.pipe(
      z.enum(["dzrec", "ymrec", "vkrec", "qbrec"]).optional(),
    ),
    DISCOVERY_MIN_DURATION_SEC: z.coerce.number().int().min(1).default(60),
    DISCOVERY_MAX_DURATION_SEC: z.coerce.number().int().min(2).default(1200),
    AUTO_MIGRATE: booleanString.default(false),
    REGISTER_COMMANDS_ON_START: booleanString.default(false),
    REGISTER_COMMANDS_FORCE: booleanString.default(false),
    HEARTBEAT_FILE: optionalText,
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === "persistent") {
      const database = urlProblem(env.DATABASE_URL, POSTGRES_PROTOCOLS);
      if (database)
        ctx.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: database,
        });
      const redis = urlProblem(env.REDIS_URL, REDIS_PROTOCOLS);
      if (redis)
        ctx.addIssue({ code: "custom", path: ["REDIS_URL"], message: redis });
    }
    if (env.DISCOVERY_MIN_DURATION_SEC >= env.DISCOVERY_MAX_DURATION_SEC) {
      ctx.addIssue({
        code: "custom",
        path: ["DISCOVERY_MIN_DURATION_SEC"],
        message: "must be lower than DISCOVERY_MAX_DURATION_SEC",
      });
    }
  });

/** Subset read by scripts/db-migrate.ts: only the database URL is needed. */
const storageSchema = z
  .object({ DATABASE_URL: optionalText })
  .superRefine((env, ctx) => {
    const problem = urlProblem(env.DATABASE_URL, POSTGRES_PROTOCOLS);
    if (problem)
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: problem,
      });
  });

export interface Config {
  readonly discordToken: string;
  readonly clientId: string;
  readonly devGuildId: string | undefined;
  readonly lavalink: {
    readonly host: string;
    readonly port: number;
    readonly password: string;
    readonly secure: boolean;
  };
  readonly logLevel: z.infer<typeof schema>["LOG_LEVEL"];
  readonly logPretty: boolean;
  /** Bot language for guilds without their own language setting (DEFAULT_LOCALE, default en). */
  readonly defaultLocale: Locale;
  readonly storage: {
    readonly driver: "persistent" | "memory";
    readonly databaseUrl: string | undefined;
    readonly redisUrl: string | undefined;
    readonly keyPrefix: string;
    readonly playerRestore: boolean;
    readonly playHistory: boolean;
    readonly pubsubInvalidation: boolean;
  };
  readonly discovery: {
    readonly providers: readonly DiscoveryProviderId[];
    readonly lastfmApiKey: string | undefined;
    readonly lavasrcPrefix: "dzrec" | "ymrec" | "vkrec" | "qbrec" | undefined;
    readonly minDurationMs: number;
    readonly maxDurationMs: number;
  };
  readonly startup: {
    readonly autoMigrate: boolean;
    readonly registerCommands: boolean;
    readonly forceRegisterCommands: boolean;
    readonly heartbeatFile: string | undefined;
  };
}

function loadDotEnv(): void {
  const path = fileURLToPath(new URL("../../.env", import.meta.url));
  // process.loadEnvFile never overrides variables that are already set in the environment.
  if (existsSync(path)) process.loadEnvFile(path);
}


/** Loads and validates configuration. Exits the process (code 1) listing variable names only on failure. */
export function loadConfig(): Config {
  loadDotEnv();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) exitInvalid(parsed.error);
  const env = parsed.data;
  registerSecrets(env.DISCORD_TOKEN, env.LAVALINK_PASSWORD, env.LASTFM_API_KEY);
  registerUrlSecrets(env.DATABASE_URL);
  registerUrlSecrets(env.REDIS_URL);
  return Object.freeze({
    discordToken: env.DISCORD_TOKEN,
    clientId: env.DISCORD_CLIENT_ID,
    devGuildId: env.DEV_GUILD_ID,
    lavalink: Object.freeze({
      host: env.LAVALINK_HOST,
      port: env.LAVALINK_PORT,
      password: env.LAVALINK_PASSWORD,
      secure: env.LAVALINK_SECURE,
    }),
    logLevel: env.LOG_LEVEL,
    logPretty: env.LOG_PRETTY,
    defaultLocale: env.DEFAULT_LOCALE,
    storage: Object.freeze({
      driver: env.STORAGE_DRIVER,
      databaseUrl: env.DATABASE_URL,
      redisUrl: env.REDIS_URL,
      keyPrefix: env.REDIS_KEY_PREFIX,
      playerRestore: env.PLAYER_RESTORE,
      playHistory: env.PLAY_HISTORY,
      pubsubInvalidation: env.PUBSUB_INVALIDATION,
    }),
    discovery: Object.freeze({
      providers: Object.freeze([...env.DISCOVERY_PROVIDERS]),
      lastfmApiKey: env.LASTFM_API_KEY,
      lavasrcPrefix: env.DISCOVERY_LAVASRC_PREFIX,
      minDurationMs: env.DISCOVERY_MIN_DURATION_SEC * 1000,
      maxDurationMs: env.DISCOVERY_MAX_DURATION_SEC * 1000,
    }),
    startup: Object.freeze({
      autoMigrate: env.AUTO_MIGRATE,
      registerCommands: env.REGISTER_COMMANDS_ON_START,
      forceRegisterCommands: env.REGISTER_COMMANDS_FORCE,
      heartbeatFile: env.HEARTBEAT_FILE,
    }),
  });
}

/** Loads only what the storage scripts need (DATABASE_URL). Exits with code 1 listing variable names on failure. */
export function loadStorageEnv(): { readonly databaseUrl: string } {
  loadDotEnv();
  const parsed = storageSchema.safeParse(process.env);
  if (!parsed.success) exitInvalid(parsed.error);
  const databaseUrl = parsed.data.DATABASE_URL;
  if (databaseUrl === undefined)
    throw new Error("DATABASE_URL is missing after validation");
  registerUrlSecrets(databaseUrl);
  return { databaseUrl };
}
