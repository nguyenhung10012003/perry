import { bind } from '@/server/runtime';
import { getSession } from '@/server/handlers/session';

export const dynamic = 'force-dynamic';
export const GET = bind(getSession);
