import { LEADERBOARD_PAGE_MAX, LEADERBOARD_PAGE_SIZE } from '../../config/constants.js';
import type { Locale, Messages } from '../../i18n/index.js';
import { clampPage } from '../../moderation/limits.js';
import type { LevelStore } from '../../storage/types.js';
import type { Command } from '../../types/command.js';
import { baseEmbed } from '../../utils/embeds.js';
import { UserError } from '../../utils/errors.js';
import type { PageContent } from '../../utils/pagination.js';
import { paginate } from '../../utils/pagination.js';
import { createCommand, describe } from '../builder.js';

/**
 * The page renderer of /leaderboard: reads the member count, clamps the requested page to the last page, then reads
 * that page (so Postgres only ever sees an offset inside the leaderboard). Throws a UserError when Postgres is down.
 */
export function leaderboardRenderer(
  levels: LevelStore,
  guildId: string,
  t: Messages,
  locale: Locale,
): (requested: number) => Promise<PageContent> {
  const format = new Intl.NumberFormat(locale);
  return async (requested) => {
    const total = await levels.count(guildId);
    if (!total.ok) throw new UserError((m) => m.leveling.storageUnavailable);
    const totalPages = Math.max(1, Math.ceil(total.value / LEADERBOARD_PAGE_SIZE));
    const page = clampPage(requested, totalPages);
    const offset = (page - 1) * LEADERBOARD_PAGE_SIZE;
    const rows = await levels.page(guildId, offset, LEADERBOARD_PAGE_SIZE);
    if (!rows.ok) throw new UserError((m) => m.leveling.storageUnavailable);
    const lines = rows.value.map((member, index) =>
      t.leveling.leaderboard.line(
        format.format(offset + index + 1),
        `<@${member.userId}>`,
        format.format(member.level),
        format.format(member.xp),
      ),
    );
    const embed = baseEmbed()
      .setTitle(t.leveling.leaderboard.title)
      .setDescription(lines.length > 0 ? lines.join('\n') : t.leveling.leaderboard.empty)
      .setFooter({ text: t.leveling.leaderboard.footer(page, totalPages) });
    return { embed, page, totalPages };
  };
}

export const leaderboard: Command = {
  data: createCommand('leaderboard', (m) => m.commands.leaderboard.description).addIntegerOption((option) =>
    describe(option.setName('page'), (m) => m.commands.leaderboard.page)
      .setMinValue(1)
      .setMaxValue(LEADERBOARD_PAGE_MAX),
  ),
  category: 'leveling',
  cooldownSeconds: 5,
  async execute({ interaction, client, t, locale }) {
    // Public reply (A26); deferred first, so the database-backed first render has the deferred reply's time.
    await interaction.deferReply();
    const render = leaderboardRenderer(client.storage.levels, interaction.guildId, t, locale);
    await paginate(interaction, render, t, { startPage: interaction.options.getInteger('page') ?? 1 });
  },
};
