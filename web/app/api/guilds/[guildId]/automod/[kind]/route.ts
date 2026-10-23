import { bind } from '@/server/runtime';
import { putRule } from '@/server/handlers/automod';

export const dynamic = 'force-dynamic';
export const PUT = bind(putRule);
