import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Leaderboard } from '@/shared/api';
import type { Locale, WebMessages } from '@/shared/i18n';

/**
 * Leaderboard table shared by the dashboard and the public page. Plain links for the pages, so the public page
 * works without JavaScript. Usernames are rendered as text (React escapes them).
 */
export function LeaderboardTable({
  board,
  t,
  locale,
  pageHref,
  emptyText,
}: {
  board: Leaderboard;
  t: WebMessages;
  locale: Locale;
  pageHref: (page: number) => string;
  emptyText: string;
}) {
  const l = t.dashboard.leaderboard;
  const number = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US');
  if (board.entries.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <div className="grid gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{l.rank}</TableHead>
            <TableHead>{l.member}</TableHead>
            <TableHead className="w-20 text-right">{l.level}</TableHead>
            <TableHead className="w-28 text-right">{l.xp}</TableHead>
            <TableHead className="hidden w-40 md:table-cell">{l.progress}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {board.entries.map((entry) => {
            const percent = Math.min(100, Math.round((entry.xpIntoLevel / Math.max(1, entry.xpForNext)) * 100));
            return (
              <TableRow key={entry.userId}>
                <TableCell className="font-semibold">#{entry.rank}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Image src={entry.avatarUrl} alt="" width={28} height={28} className="rounded-full" />
                    <span className="truncate">{entry.username ?? l.unknownMember}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right">{number.format(entry.level)}</TableCell>
                <TableCell className="text-right">{number.format(entry.xp)}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <div
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{l.pageOf(board.page, board.totalPages)}</span>
        <div className="flex gap-2">
          {board.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <a href={pageHref(board.page - 1)}>
                <ChevronLeftIcon data-icon="inline-start" />
                {l.previous}
              </a>
            </Button>
          ) : null}
          {board.page < board.totalPages ? (
            <Button asChild variant="outline" size="sm">
              <a href={pageHref(board.page + 1)}>
                {l.next}
                <ChevronRightIcon data-icon="inline-end" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
