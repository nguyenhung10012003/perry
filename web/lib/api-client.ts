import { isApiErrorCode } from '@/shared/api';
import type { ErrorBody } from '@/shared/api';

/** Outcome of a dashboard API call. error is null when the server could not be reached or answered no JSON. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: ErrorBody | null };

export interface ApiRequest {
  method?: 'GET' | 'PATCH' | 'PUT' | 'POST';
  body?: unknown;
  csrfToken?: string;
}

/** fetch for the dashboard's own API: same-origin cookies, JSON bodies and the X-CSRF-Token header on writes. */
export async function apiRequest<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.csrfToken !== undefined) headers['X-CSRF-Token'] = request.csrfToken;
  let response: Response;
  try {
    response = await fetch(path, {
      method: request.method ?? 'GET',
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  } catch {
    return { ok: false, status: 0, error: null };
  }
  let json: unknown;
  try {
    json = response.status === 204 ? null : await response.json();
  } catch {
    json = null;
  }
  if (response.ok) return { ok: true, data: json as T };
  const error =
    typeof json === 'object' && json !== null && isApiErrorCode((json as { error?: unknown }).error)
      ? (json as ErrorBody)
      : null;
  return { ok: false, status: response.status, error };
}

/** The login URL that returns to the current dashboard page. */
export function loginHref(): string {
  return `/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
}
