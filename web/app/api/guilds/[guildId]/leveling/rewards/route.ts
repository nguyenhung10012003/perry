import { bind } from '@/server/runtime';
import { putRewards } from '@/server/handlers/leveling';

export const dynamic = 'force-dynamic';
export const PUT = bind(putRewards);
