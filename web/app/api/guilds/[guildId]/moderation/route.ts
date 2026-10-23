import { bind } from '@/server/runtime';
import { patchModeration } from '@/server/handlers/settings';

export const dynamic = 'force-dynamic';
export const PATCH = bind(patchModeration);
