import type { Track } from 'lavalink-client';
import type { DiscoveryContext, RecommendationProvider } from '../types.js';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * YouTube Mix: loads `watch?v=<id>&list=RD<id>` through Lavalink (youtube-source). About 25 tracks per call,
 * no API key. The seed itself comes back first and is removed by the engine's dedupe.
 */
export function createYoutubeMixProvider(): RecommendationProvider {
  return {
    id: 'ytmix',
    isAvailable(ctx: DiscoveryContext, seed: Track): boolean {
      return seed.info.sourceName === 'youtube' && VIDEO_ID.test(seed.info.identifier) && ctx.service.getSearchNode() !== null;
    },
    async recommend(ctx: DiscoveryContext, seed: Track): Promise<Track[]> {
      const node = ctx.service.getSearchNode();
      if (!node) return [];
      const id = seed.info.identifier;
      const result = await node.search({ query: `https://www.youtube.com/watch?v=${id}&list=RD${id}` }, ctx.requester);
      return result.loadType === 'playlist' ? result.tracks : [];
    },
  };
}
