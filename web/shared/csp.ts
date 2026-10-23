/**
 * CSP of every page (design 4.12), built by proxy.ts with a fresh nonce per response. Scripts run only with the
 * nonce; inline styles are allowed because Radix/shadcn components and Next's error pages render inline style
 * attributes on the server. Development adds 'unsafe-eval', which React needs there.
 */
export function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://cdn.discordapp.com data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
