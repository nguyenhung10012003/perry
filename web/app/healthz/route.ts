import { bind } from '@/server/runtime';
import { healthz } from '@/server/handlers/health';

export const dynamic = 'force-dynamic';
export const GET = bind(healthz);
