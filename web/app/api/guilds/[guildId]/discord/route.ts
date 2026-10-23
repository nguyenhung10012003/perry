import { bind } from '@/server/runtime';
import { getGuildData } from '@/server/handlers/guilds';

export const dynamic = 'force-dynamic';
export const GET = bind(getGuildData);
