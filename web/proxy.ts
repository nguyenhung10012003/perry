import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCsp } from '@/shared/csp';
import { LANG_COOKIE, isLocale, negotiateLocale } from '@/shared/i18n/index';

/**
 * Next.js Proxy (Node.js runtime): headers only, never authorization (every check runs in the Route Handlers and the
 * page loaders). Per page request: a fresh CSP nonce (Next puts it on its scripts), the negotiated locale, the
 * perry_lang cookie for a valid ?lang, the request path for login redirects, and 404 for Server Action requests
 * (Server Actions are not used; Next would otherwise answer 400 and log a stack trace).
 */

const LANG_COOKIE_MAX_AGE = 31_536_000;

export function proxy(request: NextRequest): NextResponse {
  if (request.headers.has('next-action')) {
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const queryLang = request.nextUrl.searchParams.get('lang');
  const locale = negotiateLocale({
    query: queryLang,
    cookie: request.cookies.get(LANG_COOKIE)?.value,
    acceptLanguage: request.headers.get('accept-language'),
    defaultLocale: process.env.DEFAULT_LOCALE,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set('x-perry-locale', locale);
  requestHeaders.set('x-perry-path', `${request.nextUrl.pathname}${request.nextUrl.search}`.slice(0, 2048));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (isLocale(queryLang)) {
    const secure = (process.env.PUBLIC_URL ?? '').startsWith('https://');
    response.headers.append(
      'Set-Cookie',
      `${LANG_COOKIE}=${queryLang}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`,
    );
  }
  return response;
}

export const config = {
  matcher: ['/((?!api/|auth/|healthz|_next/static/|_next/image|favicon\\.svg|auth\\.css|landing/).*)'],
};
