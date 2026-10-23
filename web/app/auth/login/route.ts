import { bind } from '@/server/runtime';
import { login } from '@/server/handlers/auth';

export const dynamic = 'force-dynamic';
export const GET = bind(login);
