import 'server-only';
import type { z } from 'zod';
import { WEB_BODY_LIMIT_BYTES } from '../../src/config/constants.js';
import { safeError } from '../../src/utils/safe-error.js';
import { zodIssues } from '../shared/api.js';
import { readJsonBody } from './body.js';
import { clientIp } from './client-ip.js';
import { checkCsrf } from './csrf.js';
import type { WebDeps } from './deps.js';
import { ApiError, errorResponse, isApiError } from './errors.js';
import { requireManageableGuild } from './guild-access.js';
import type { ManageableGuild } from './guild-access.js';
import type { WebRateScope } from './rate-limit.js';
import { requireSession } from './session.js';
import type { Session } from './session.js';

/** Second argument of a Route Handler (route params are a promise in Next.js 16). */
export interface RouteContextArg {
  params: Promise<Record<string, string | string[] | undefined>>;
}
export type Handler = (request: Request, context: RouteContextArg) => Promise<Response>;
/** Framework-free handler factory: tests call it with fake deps and `new Request(...)`. */
export type HandlerFactory = (deps: WebDeps) => Handler;

export type RouteAuth = 'public' | 'session' | 'manage';

export interface RouteSpec<A extends RouteAuth, P, Q, B> {
  /** Route pattern for logs (never the URL, so OAuth codes and states never reach the logs). */
  route: string;
  auth: A;
  /** Per-IP limit of public routes. */
  ipLimit?: 'web-auth' | 'web-public';
  params?: z.ZodType<P>;
  query?: z.ZodType<Q>;
  body?: z.ZodType<B>;
  bodyLimit?: number;
  /** The request may carry no body and no Content-Type at all (route 4); body is then undefined. */
  optionalBody?: boolean;
  /** An extra per-user limit chosen from the parsed query (web-refresh for ?refresh=1). */
  extraLimit?: (query: Q) => WebRateScope | null;
  /** Renders expected failures (HTML pages of the auth routes); JSON otherwise. */
  renderError?: (deps: WebDeps, request: Request, err: ApiError) => Response;
}

export interface RouteCtx<A extends RouteAuth, P, Q, B> {
  deps: WebDeps;
  request: Request;
  params: P;
  query: Q;
  body: B;
  ip: string;
  session: A extends 'public' ? null : Session;
  access: A extends 'manage' ? ManageableGuild : null;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function limit(deps: WebDeps, scope: WebRateScope, id: string): Promise<void> {
  const result = await deps.rateLimits.check(scope, id);
  if (!result.ok) throw new ApiError('rate_limited', { retryAfter: result.retryAfterSeconds });
}

/** Route params as strings; Next passes no params object to routes without dynamic segments. */
function flatParams(raw: Record<string, string | string[] | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * Builds a handler factory with the checks of design 4.12 in this order: per-IP limit; session and the web-api limit;
 * CSRF and the web-write limit for writes; params and query (400 invalid_params); the guild permission re-check;
 * the JSON body with its byte limit and strict schema (400 invalid_body with issues). Every response gets
 * Cache-Control: no-store; unexpected errors become 500 internal_error and are logged with the route pattern.
 */
export function apiRoute<A extends RouteAuth, P = Record<string, never>, Q = Record<string, never>, B = undefined>(
  spec: RouteSpec<A, P, Q, B>,
  fn: (ctx: RouteCtx<A, P, Q, B>) => Promise<Response>,
): HandlerFactory {
  return (deps) => async (request, context) => {
    const started = deps.now();
    let response: Response;
    try {
      const ip = clientIp(request.headers, deps.config.trustProxy);
      if (spec.ipLimit !== undefined) await limit(deps, spec.ipLimit, ip);
      let session: Session | null = null;
      if (spec.auth !== 'public') {
        session = await requireSession(deps, request);
        await limit(deps, 'web-api', session.record.userId);
        if (WRITE_METHODS.has(request.method)) {
          if (!checkCsrf(request, session, deps.config.publicUrl)) {
            deps.logger.warn({ route: spec.route }, 'CSRF check failed');
            throw new ApiError('csrf_failed');
          }
          await limit(deps, 'web-write', session.record.userId);
        }
      }
      const rawParams = flatParams(await (context as Partial<RouteContextArg> | undefined)?.params);
      const params = spec.params === undefined ? ({} as P) : parseOr(spec.params, rawParams, 'invalid_params');
      const rawQuery = Object.fromEntries(new URL(request.url).searchParams);
      const query = spec.query === undefined ? ({} as Q) : parseOr(spec.query, rawQuery, 'invalid_params');
      const extra = spec.extraLimit?.(query) ?? null;
      if (extra !== null && session !== null) await limit(deps, extra, session.record.userId);
      let access: ManageableGuild | null = null;
      if (spec.auth === 'manage' && session !== null) {
        access = await requireManageableGuild(deps, session, (params as { guildId?: string }).guildId ?? '');
      }
      let body = undefined as B;
      if (spec.body !== undefined) {
        const raw = await readJsonBody(request, spec.bodyLimit ?? WEB_BODY_LIMIT_BYTES, {
          allowEmpty: spec.optionalBody === true,
        });
        if (raw !== undefined || spec.optionalBody !== true) body = parseOr(spec.body, raw, 'invalid_body');
      }
      response = await fn({
        deps,
        request,
        params,
        query,
        body,
        ip,
        session: session as RouteCtx<A, P, Q, B>['session'],
        access: access as RouteCtx<A, P, Q, B>['access'],
      });
    } catch (err) {
      if (isApiError(err)) {
        response = spec.renderError !== undefined ? spec.renderError(deps, request, err) : errorResponse(err);
      } else {
        deps.logger.error({ err: safeError(err), route: spec.route }, 'Route handler failed');
        const internal = new ApiError('internal_error');
        response = spec.renderError !== undefined ? spec.renderError(deps, request, internal) : errorResponse(internal);
      }
    }
    if (!response.headers.has('cache-control')) response.headers.set('Cache-Control', 'no-store');
    deps.logger.debug(
      { method: request.method, route: spec.route, status: response.status, ms: deps.now() - started },
      'API request',
    );
    return response;
  };
}

function parseOr<T>(schema: z.ZodType<T>, value: unknown, code: 'invalid_params' | 'invalid_body'): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(code, { issues: zodIssues(parsed.error) });
  return parsed.data;
}
