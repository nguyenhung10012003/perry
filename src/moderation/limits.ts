/** Largest case number: mod_cases.case_number is a Postgres `integer` (M11). */
export const CASE_NUMBER_MAX = 2_147_483_647;

/**
 * A case number that is safe to pass to Postgres (integer 1..2,147,483,647), or null. Discord enforces the option
 * range too; this re-check keeps an out-of-range value from ever marking Postgres down (R8).
 */
export function parseCaseNumber(value: number): number | null {
  return Number.isInteger(value) && value >= 1 && value <= CASE_NUMBER_MAX ? value : null;
}

/** The requested page clamped to 1..totalPages (a page past the end shows the last page). */
export function clampPage(requested: number, totalPages: number): number {
  const last = Math.max(1, Math.floor(totalPages));
  const page = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  return Math.min(Math.max(1, page), last);
}
