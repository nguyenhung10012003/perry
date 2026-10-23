import Image from 'next/image';
import { guildInitials } from '@/shared/discord';

/** A guild icon from the Discord CDN, or the guild's initials. */
export function GuildIcon({ name, iconUrl, size = 40 }: { name: string; iconUrl: string | null; size?: number }) {
  if (iconUrl !== null) {
    return <Image src={iconUrl} alt="" width={size} height={size} className="shrink-0 rounded-xl" />;
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary"
      style={{ width: size, height: size }}
    >
      {guildInitials(name)}
    </span>
  );
}
