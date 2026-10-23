import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { InviteCard } from '@/components/dashboard/InviteCard';
import { Unavailable } from '@/components/dashboard/Unavailable';
import { loadLocale, loadLoginHref } from '@/server/pages';
import type { PageFailure } from '@/server/pages';
import { getWebMessages } from '@/shared/i18n';

/**
 * The outcome of a dashboard page that could not load: no session -> 307 to the login (with returnTo); a guild the
 * user cannot manage -> 404 (without saying whether it exists); the bot not in the guild -> invite card; a backend
 * or the bot unavailable -> the localized notice with a retry button.
 */
export async function renderFailure(failure: PageFailure): Promise<ReactNode> {
  if (failure.kind === 'login') redirect(await loadLoginHref());
  if (failure.kind === 'not_found') notFound();
  if (failure.kind === 'invite') {
    const t = getWebMessages(await loadLocale());
    return <InviteCard t={t} guildName={failure.guildName} inviteUrl={failure.inviteUrl} />;
  }
  return <Unavailable reason={failure.reason} />;
}
