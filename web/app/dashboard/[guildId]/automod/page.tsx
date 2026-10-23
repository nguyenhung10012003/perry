import { AutomodForm } from '@/components/dashboard/AutomodForm';
import { loadGuildPage, loadPageData } from '@/server/pages';
import { renderFailure } from '../../failure';

/** AutoMod page (DP-1 (b)): the Perry rules, read and written by the bot over the bridge. */
export default async function AutomodPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  const page = await loadGuildPage(guildId);
  if (!('ok' in page)) return renderFailure(page);
  const data = await loadPageData(page, async () => {
    const [list, meta] = await Promise.all([
      page.deps.bridge.request('automod.list', guildId, {}),
      page.deps.guildData.guildMeta(guildId),
    ]);
    return { list, meta };
  });
  if (!('ok' in data)) return renderFailure(data);
  return <AutomodForm guildId={guildId} list={data.value.list} meta={data.value.meta} />;
}
