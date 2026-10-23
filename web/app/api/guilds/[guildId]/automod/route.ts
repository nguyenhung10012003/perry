import { bind } from '@/server/runtime';
import { getRules } from '@/server/handlers/automod';

export const dynamic = 'force-dynamic';
export const GET = bind(getRules);
