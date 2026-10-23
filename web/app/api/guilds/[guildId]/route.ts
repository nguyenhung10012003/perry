import { bind } from '@/server/runtime';
import { getGuild } from '@/server/handlers/guilds';

export const dynamic = 'force-dynamic';
export const GET = bind(getGuild);
