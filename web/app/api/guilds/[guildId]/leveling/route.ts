import { bind } from '@/server/runtime';
import { patchLeveling } from '@/server/handlers/settings';

export const dynamic = 'force-dynamic';
export const PATCH = bind(patchLeveling);
