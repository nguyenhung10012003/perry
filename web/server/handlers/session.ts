import 'server-only';
import type { SessionResponse } from '../../shared/api.js';
import { avatarUrl } from '../../shared/discord.js';
import { negotiateLocale } from '../../shared/i18n/index.js';
import { cookieNames, parseCookies } from '../cookies.js';
import { jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';

/** Route 8: GET /api/session. Never returns the (sealed) Discord token. */
export const getSession = apiRoute({ route: '/api/session', auth: 'session' }, ({ deps, request, session }) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const { record } = session;
  const body: SessionResponse = {
    user: {
      id: record.userId,
      username: record.username,
      globalName: record.globalName,
      avatarUrl: avatarUrl(record.userId, record.avatar),
    },
    csrfToken: record.csrfToken,
    locale: negotiateLocale({
      cookie: cookies.get(cookieNames(deps.config.secureCookies).lang),
      acceptLanguage: request.headers.get('accept-language'),
      defaultLocale: deps.config.defaultLocale,
    }),
    defaultLocale: deps.config.defaultLocale,
  };
  return Promise.resolve(jsonResponse(body));
});
