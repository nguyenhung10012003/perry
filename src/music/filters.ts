import type { Player } from 'lavalink-client';
import type { GuildMusicState } from './guild-state.js';

export const FILTER_NAMES = ['bassboost', 'nightcore', '8d', 'vaporwave', 'karaoke', 'off'] as const;
export type FilterName = (typeof FILTER_NAMES)[number];

export function isFilterName(value: string): value is FilterName {
  return (FILTER_NAMES as readonly string[]).includes(value);
}

/** Lavalink equalizer gain range is -0.25..1.0; these lift the lowest four bands. */
const BASSBOOST_BANDS = [
  { band: 0, gain: 0.25 },
  { band: 1, gain: 0.2 },
  { band: 2, gain: 0.15 },
  { band: 3, gain: 0.1 },
];

/**
 * Applies one preset. Filters are exclusive: everything is reset first, so selecting a preset
 * again re-applies it and `off` only resets. Returns the active filter (null when off).
 */
export async function applyFilterPreset(
  player: Player,
  name: FilterName,
  state?: GuildMusicState,
): Promise<FilterName | null> {
  const filters = player.filterManager;
  await filters.resetFilters();
  switch (name) {
    case 'bassboost':
      await filters.setEQ(BASSBOOST_BANDS);
      break;
    case 'nightcore':
      await filters.toggleNightcore();
      break;
    case '8d':
      await filters.toggleRotation(0.2);
      break;
    case 'vaporwave':
      await filters.toggleVaporwave();
      break;
    case 'karaoke':
      await filters.toggleKaraoke();
      break;
    case 'off':
      break;
  }
  const active = name === 'off' ? null : name;
  if (state) state.activeFilter = active;
  return active;
}
