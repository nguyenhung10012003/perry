import 'server-only';
import { timingSafeEqualStr } from './crypto.js';
import type { Session } from './session.js';

/**
 * CSRF check of every state-changing request (design 4.12): the X-CSRF-Token header equals the session's token
 * (constant time), and Origin equals the PUBLIC_URL origin, or, without Origin, Referer starts with PUBLIC_URL + '/'.
 */
export function checkCsrf(request: Request, session: Session, publicUrl: string): boolean {
  const token = request.headers.get('x-csrf-token');
  if (token === null || !timingSafeEqualStr(token, session.record.csrfToken)) return false;
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === publicUrl;
  const referer = request.headers.get('referer');
  return referer !== null && referer.startsWith(`${publicUrl}/`);
}
