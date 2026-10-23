import { bind } from '@/server/runtime';
import { getLeaderboard } from '@/server/handlers/leveling';

export const dynamic = 'force-dynamic';
export const GET = bind(getLeaderboard);
