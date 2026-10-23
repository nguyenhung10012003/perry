import 'server-only';
import { API_ERROR_STATUS } from '../shared/api.js';
import type { ApiErrorCode, ErrorBody, Issue } from '../shared/api.js';

export interface ApiErrorOptions {
  message?: string;
  issues?: Issue[];
  inviteUrl?: string;
  /** Seconds for the Retry-After header (429 and 503). */
  retryAfter?: number;
  /** Discord's numeric error code (discord_rejected). */
  discordCode?: number;
}

const API_ERROR_BRAND = Symbol.for('perry.web.ApiError');

/** An expected API failure: becomes `{ error, message?, issues?, inviteUrl? }` with the status of its code. */
export class ApiError extends Error {
  readonly status: number;
  readonly [API_ERROR_BRAND] = true;

  constructor(
    readonly code: ApiErrorCode,
    readonly options: ApiErrorOptions = {},
  ) {
    super(options.message ?? code);
    this.name = 'ApiError';
    this.status = API_ERROR_STATUS[code];
  }

  toBody(): ErrorBody {
    const body: ErrorBody = { error: this.code };
    if (this.options.message !== undefined) body.message = this.options.message;
    if (this.options.issues !== undefined) body.issues = this.options.issues;
    if (this.options.inviteUrl !== undefined) body.inviteUrl = this.options.inviteUrl;
    if (this.options.discordCode !== undefined) body.code = this.options.discordCode;
    return body;
  }
}

/**
 * True for an ApiError created by any bundle. Next.js compiles instrumentation.ts (which builds the runtime) and the
 * routes and pages as separate webpack entries, so the class can exist more than once per process and instanceof
 * would miss errors thrown by the runtime's modules.
 */
export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && (err as Record<symbol, unknown>)[API_ERROR_BRAND] === true;
}

export const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } as const;

export function jsonResponse(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(JSON_HEADERS);
  if (extra !== undefined) for (const [key, value] of new Headers(extra)) headers.append(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(err: ApiError, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  if (err.options.retryAfter !== undefined) headers.set('Retry-After', String(Math.max(1, Math.ceil(err.options.retryAfter))));
  else if (err.code === 'bot_unavailable') headers.set('Retry-After', '5');
  return jsonResponse(err.toBody(), err.status, headers);
}
