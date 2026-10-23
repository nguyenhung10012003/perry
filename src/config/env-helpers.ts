import { z } from "zod";
import { registerSecrets } from "../utils/safe-error.js";

/**
 * Env parsing helpers shared by the bot's config (env.ts) and the web's config (web/server/config.ts). Kept apart
 * from env.ts so the web never bundles the bot's env schema.
 */

export const booleanString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

/** Trims a string; an empty string counts as "not set" (.env.example ships empty placeholders). */
export const optionalText = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined || v.trim() === "" ? undefined : v.trim(),
  );

export const POSTGRES_PROTOCOLS = ["postgres:", "postgresql:"];
export const REDIS_PROTOCOLS = ["redis:", "rediss:"];

/** Describes why a connection string is unusable. The message never contains the value. */
export function urlProblem(
  value: string | undefined,
  protocols: readonly string[],
): string | undefined {
  if (value === undefined) return "required (see .env.example)";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be a valid URL";
  }
  if (!protocols.includes(url.protocol))
    return `must start with ${protocols.map((p) => `${p}//`).join(" or ")}`;
  try {
    // Client libraries percent-decode credentials and throw on malformed sequences.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    return "must be a valid URL (percent-encode special characters in the credentials)";
  }
  return undefined;
}

/** Registers the raw connection string and its password (plain and percent-decoded) as secrets. */
export function registerUrlSecrets(value: string | undefined): void {
  if (value === undefined) return;
  registerSecrets(value);
  try {
    const url = new URL(value);
    registerSecrets(url.password);
    registerSecrets(decodeURIComponent(url.password));
  } catch {
    // The value was already rejected or is not parseable; the raw string is registered above.
  }
}

/** Prints variable names with a short reason (never values) and exits with code 1. */
export function exitInvalid(error: z.ZodError): never {
  const lines = error.issues.map((issue) => {
    const name = issue.path.map(String).join(".") || "(root)";
    const reason =
      issue.code === "invalid_type" ? "missing or invalid" : issue.message;
    return `  - ${name}: ${reason}`;
  });
  process.stderr.write(
    `Invalid configuration. Check these environment variables:\n${lines.join("\n")}\n`,
  );
  process.exit(1);
}
