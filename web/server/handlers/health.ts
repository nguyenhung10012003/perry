import 'server-only';
import { jsonResponse } from '../errors.js';
import { apiRoute } from '../handler.js';

/** Route 7: GET /healthz (container health check): 200 when Postgres and Redis are usable, else 503. */
export const healthz = apiRoute({ route: '/healthz', auth: 'public' }, ({ deps }) => {
  const postgres = deps.health.postgresUp();
  const redis = deps.health.redisUp();
  if (postgres && redis) return Promise.resolve(jsonResponse({ status: 'ok' }));
  return Promise.resolve(
    jsonResponse({ status: 'degraded', postgres: postgres ? 'up' : 'down', redis: redis ? 'up' : 'down' }, 503),
  );
});
