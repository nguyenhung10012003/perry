import type { Track } from 'lavalink-client';
import { buildMetadataSearchRequest } from '../../search.js';
import { cleanArtist } from '../filters.js';
import type { DiscoveryContext, RecommendationProvider } from '../types.js';

/** Last resort: search for the (cleaned) artist of the seed. Every hit is the same artist by construction. */
export function createArtistSearchProvider(): RecommendationProvider {
  return {
    id: 'artist',
    diversityExempt: true,
    isAvailable(ctx: DiscoveryContext, seed: Track): boolean {
      return cleanArtist(seed.info.author) !== '' && ctx.service.getSearchNode() !== null;
    },
    async recommend(ctx: DiscoveryContext, seed: Track): Promise<Track[]> {
      const node = ctx.service.getSearchNode();
      if (!node) return [];
      // The author comes from remote metadata: never let it become a URL/identifier or pick a Lavalink source.
      const request = buildMetadataSearchRequest(cleanArtist(seed.info.author));
      if (!request) return [];
      const result = await node.search(request, ctx.requester);
      return result.loadType === 'search' || result.loadType === 'playlist' ? result.tracks : [];
    },
  };
}
