import { bind } from '@/server/runtime';
import { getPublicLeaderboard } from '@/server/handlers/public';

export const dynamic = 'force-dynamic';
export const GET = bind(getPublicLeaderboard);
