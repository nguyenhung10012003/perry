import { ModerationForm } from '@/components/dashboard/ModerationForm';
import { loadGuildPage, loadPageData } from '@/server/pages';
import { moderationView } from '@/shared/api';
import { renderFailure } from '../../failure';

/** Moderation page (W4): mod-log channel and DM toggle. */
export default async function ModerationPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return renderFailure(page);
  const data = await loadPageData(page, async () => {
    const [settings, meta] = await Promise.all([page.deps.settings.read(guildId), page.deps.guildData.guildMeta(guildId)]);
    return { settings, meta };
  });
  if (!('ok' in data)) return renderFailure(data);
  const initial = moderationView(data.value.settings);
  return <ModerationForm key={JSON.stringify(initial)} guildId={guildId} initial={initial} meta={data.value.meta} />;
}
