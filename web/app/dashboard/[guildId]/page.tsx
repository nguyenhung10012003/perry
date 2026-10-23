import { GeneralForm } from '@/components/dashboard/GeneralForm';
import { loadGuildPage, loadPageData } from '@/server/pages';
import { generalView } from '@/shared/api';
import { renderFailure } from '../failure';

/** General page (W4): language, DJ role, volume, autoplay, 24/7. */
export default async function GeneralPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return renderFailure(page);
  const data = await loadPageData(page, async () => {
    const [settings, meta] = await Promise.all([page.deps.settings.read(guildId), page.deps.guildData.guildMeta(guildId)]);
    return { settings, meta };
  });
  if (!('ok' in data)) return renderFailure(data);
  const initial = generalView(data.value.settings);
  return <GeneralForm key={JSON.stringify(initial)} guildId={guildId} initial={initial} meta={data.value.meta} />;
}
