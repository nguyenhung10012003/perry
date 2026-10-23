import { Features, Steps } from '@/components/landing/Features';
import { Footer } from '@/components/landing/Footer';
import { Hero } from '@/components/landing/Hero';
import { SiteHeader } from '@/components/site-header';
import { landingInviteUrl, loadLocale } from '@/server/pages';
import { getWebMessages } from '@/shared/i18n';

/** Route 1: the public landing page, server-rendered HTML that works without JavaScript (W1, W5a). */
export default async function LandingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = getWebMessages(await loadLocale());
  const { login } = await searchParams;
  return (
    <>
      <SiteHeader t={t} />
      <main>
        <Hero t={t} inviteUrl={landingInviteUrl()} cancelled={login === 'cancelled'} />
        <Features t={t} />
        <Steps t={t} />
      </main>
      <Footer t={t} />
    </>
  );
}
