import type { Config } from '../../../config/env.js';
import type { Keys } from '../../../storage/keys.js';
import type { KeyValueCache } from '../../../storage/types.js';
import type { RecommendationProvider } from '../types.js';
import { createArtistSearchProvider } from './artist-search.js';
import { createLastfmProvider } from './lastfm.js';
import { createLavasrcProvider } from './lavasrc.js';
import { createYoutubeMixProvider } from './youtube-mix.js';

export interface ProviderDeps {
  cache: KeyValueCache;
  keys: Keys;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Builds the enabled providers in the order of DISCOVERY_PROVIDERS. Providers that cannot work are left out:
 * lastfm without LASTFM_API_KEY, lavasrc without DISCOVERY_LAVASRC_PREFIX. There is no Spotify provider.
 */
export function createProviders(config: Config['discovery'], deps: ProviderDeps): RecommendationProvider[] {
  const providers: RecommendationProvider[] = [];
  for (const id of config.providers) {
    switch (id) {
      case 'ytmix':
        providers.push(createYoutubeMixProvider());
        break;
      case 'lastfm':
        if (config.lastfmApiKey) {
          providers.push(
            createLastfmProvider({
              apiKey: config.lastfmApiKey,
              cache: deps.cache,
              keys: deps.keys,
              ...(deps.fetchFn ? { fetchFn: deps.fetchFn } : {}),
            }),
          );
        }
        break;
      case 'lavasrc':
        if (config.lavasrcPrefix) providers.push(createLavasrcProvider(config.lavasrcPrefix));
        break;
      case 'artist':
        providers.push(createArtistSearchProvider());
        break;
    }
  }
  return providers;
}
