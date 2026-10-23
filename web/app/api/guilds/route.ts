import { bind } from '@/server/runtime';
import { listGuilds } from '@/server/handlers/guilds';

export const dynamic = 'force-dynamic';
export const GET = bind(listGuilds);
