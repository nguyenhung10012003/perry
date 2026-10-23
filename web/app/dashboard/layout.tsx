import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/dashboard/LogoutButton';
import { SessionProvider } from '@/components/providers';
import { SiteHeader } from '@/components/site-header';
import { loadLocale, loadSession } from '@/server/pages';
import { avatarUrl } from '@/shared/discord';
import { getWebMessages } from '@/shared/i18n';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getWebMessages(await loadLocale()).meta.dashboardTitle, robots: { index: false, follow: false } };
}

/**
 * Header of every dashboard page (user, language switch, logout). It is not an access check: layouts are not
 * re-rendered on navigation, so every page checks the session and the guild itself.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const t = getWebMessages(await loadLocale());
  const loaded = await loadSession();
  const main = <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>;
  if (!('ok' in loaded)) {
    return (
      <>
        <SiteHeader t={t} />
        {main}
      </>
    );
  }
  const { record } = loaded.session;
  const user = {
    id: record.userId,
    username: record.username,
    globalName: record.globalName,
    avatarUrl: avatarUrl(record.userId, record.avatar),
  };
  return (
    <SessionProvider value={{ user, csrfToken: record.csrfToken }}>
      <SiteHeader t={t}>
        <span className="hidden items-center gap-2 text-sm sm:flex">
          <Image src={user.avatarUrl} alt="" width={28} height={28} className="rounded-full" />
          <span className="max-w-40 truncate">{user.globalName ?? user.username}</span>
        </span>
        <LogoutButton />
      </SiteHeader>
      {main}
    </SessionProvider>
  );
}
