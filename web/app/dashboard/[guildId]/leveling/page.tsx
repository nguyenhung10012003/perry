import { LevelingForm } from '@/components/dashboard/LevelingForm';
import { RewardTable } from '@/components/dashboard/RewardTable';
import { loadGuildPage, loadPageData } from '@/server/pages';
import { levelingView } from '@/shared/api';
import { renderFailure } from '../../failure';

/** Leveling page (W4, G7): settings and role rewards. */
export default async function LevelingPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return renderFailure(page);
  const { deps } = page;
  const data = await loadPageData(page, async () => {
    const [settings, rewards, meta] = await Promise.all([
      deps.settings.read(guildId),
      deps.levels.rewards(guildId),
      deps.guildData.guildMeta(guildId),
    ]);
    return { settings, rewards, meta };
  });
  if (!('ok' in data)) return renderFailure(data);
  const initial = levelingView(data.value.settings);
  return (
    <div className="grid gap-6">
      <LevelingForm
        key={JSON.stringify(initial)}
        guildId={guildId}
        initial={initial}
        meta={data.value.meta}
        publicUrl={deps.config.publicUrl}
      />
      <RewardTable key={JSON.stringify(data.value.rewards)} guildId={guildId} initial={data.value.rewards} meta={data.value.meta} />
    </div>
  );
}
