import type { Track } from 'lavalink-client';
import type { Config } from '../../../config/env.js';
import type { DiscoveryContext, RecommendationProvider } from '../types.js';

type LavasrcPrefix = NonNullable<Config['discovery']['lavasrcPrefix']>;

/** Recommendation prefix -> Lavalink source manager name == `info.sourceName` of its tracks. */
const PLATFORM: Record<LavasrcPrefix, string> = {
  dzrec: 'deezer',
  ymrec: 'yandexmusic',
  vkrec: 'vkmusic',
  qbrec: 'qobuz',
};

/**
 * LavaSrc recommendations (`<prefix>:<identifier>`). Only available when an operator configured the prefix, the node
 * has the matching source enabled and the seed comes from that platform. Spotify is not offered (its recommendations
 * endpoint is closed to new apps).
 */
export function createLavasrcProvider(prefix: LavasrcPrefix): RecommendationProvider {
  const platform = PLATFORM[prefix];
  return {
    id: 'lavasrc',
    isAvailable(ctx: DiscoveryContext, seed: Track): boolean {
      const node = ctx.service.getSearchNode();
      return (
        node !== null &&
        seed.info.sourceName === platform &&
        (node.info?.sourceManagers.includes(platform) ?? false)
      );
    },
    async recommend(ctx: DiscoveryContext, seed: Track): Promise<Track[]> {
      const node = ctx.service.getSearchNode();
      if (!node) return [];
      const result = await node.search(`${prefix}:${seed.info.identifier}`, ctx.requester);
      return result.loadType === 'playlist' || result.loadType === 'search' ? result.tracks : [];
    },
  };
}
