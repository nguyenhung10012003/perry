import { bind } from '@/server/runtime';
import { patchGeneral } from '@/server/handlers/settings';

export const dynamic = 'force-dynamic';
export const PATCH = bind(patchGeneral);
