import { bind } from '@/server/runtime';
import { logout } from '@/server/handlers/auth';

export const dynamic = 'force-dynamic';
export const POST = bind(logout);
