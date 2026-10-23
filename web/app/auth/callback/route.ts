import { bind } from '@/server/runtime';
import { callback } from '@/server/handlers/auth';

export const dynamic = 'force-dynamic';
export const GET = bind(callback);
