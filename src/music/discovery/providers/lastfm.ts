import { createHash } from 'node:crypto';
import type { LavalinkNode, Track } from 'lavalink-client';
import { z } from 'zod';
import {
  LASTFM_CACHE_TTL_SECONDS,
  LASTFM_RESOLVE_CONCURRENCY,
  LASTFM_SIMILAR_LIMIT,
} from '../../../config/constants.js';
import type { Keys } from '../../../storage/keys.js';
import type { KeyValueCache } from '../../../storage/types.js';
import { buildMetadataSearchRequest } from '../../search.js';
import { cleanArtist, cleanTitle, normTitle } from '../filters.js';
import type { DiscoveryContext, RecommendationProvider } from '../types.js';

const ENDPOINT = 'https://ws.audioscrobbler.com/2.0/';
const REQUEST_TIMEOUT_MS = 4000;
const MAX_BODY_CHARS = 1_000_000;
/** Last.fm error codes: 10 invalid API key, 26 suspended API key (both permanent), 29 rate limit exceeded. */
const ERROR_INVALID_KEY = 10;
const ERROR_SUSPENDED_KEY = 26;
const ERROR_RATE_LIMIT = 29;

const similarEntry = z.object({
  name: z.string(),
  artist: z.union([z.string(), z.object({ name: z.string() })]),
});
const successSchema = z.object({
  // `track` is an array, a single object (one result) or missing (none).
  similartracks: z.object({ track: z.union([z.array(similarEntry), similarEntry]).optional() }),
});
const errorSchema = z.object({ error: z.number() });
const cachedSchema = z.array(z.object({ artist: z.string(), title: z.string() }));

interface SimilarTrack {
  artist: string;
  title: string;
}

export interface LastfmProviderOptions {
  apiKey: string;
  cache: KeyValueCache;
  keys: Keys;
  /** Injectable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
}

/** True when a search hit is plausibly the wanted song (its cleaned title contains the wanted cleaned title). */
function isPlausible(hit: Track, wantedTitle: string): boolean {
  if (hit.info.isStream) return false;
  const wanted = normTitle(wantedTitle);
  return wanted === '' || normTitle(hit.info.title, hit.info.author).includes(wanted);
}

/**
 * Last.fm `track.getSimilar`, resolved to playable tracks through a YouTube search. Needs LASTFM_API_KEY.
 * The request URL contains the key, so it is never logged: errors are reduced to Last.fm error codes.
 */
export function createLastfmProvider(options: LastfmProviderOptions): RecommendationProvider {
  const { apiKey, cache, keys } = options;
  const fetchFn = options.fetchFn ?? fetch;
  let disabled = false;

  /** Similar tracks of the seed, from the shared cache or from Last.fm. Null when the call was skipped or refused. */
  async function fetchSimilar(ctx: DiscoveryContext, artist: string, title: string): Promise<SimilarTrack[] | null> {
    const cacheKey = keys.lastfm(createHash('sha1').update(`${artist}|${title}`.toLowerCase()).digest('hex'));
    const cached = cachedSchema.safeParse(await cache.getJson(cacheKey));
    if (cached.success) return cached.data;

    const params = new URLSearchParams({
      method: 'track.getsimilar',
      artist,
      track: title,
      api_key: apiKey,
      format: 'json',
      limit: String(LASTFM_SIMILAR_LIMIT),
      autocorrect: '1',
    });
    const response = await fetchFn(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
    const text = (await response.text()).slice(0, MAX_BODY_CHARS);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Last.fm answered HTTP ${response.status} without JSON`);
    }

    const failure = errorSchema.safeParse(body);
    if (failure.success) {
      const code = failure.data.error;
      if (code === ERROR_INVALID_KEY || code === ERROR_SUSPENDED_KEY) {
        disabled = true;
        ctx.logger.warn({ code }, 'Last.fm rejected the API key; provider disabled until restart');
      } else if (code === ERROR_RATE_LIMIT) {
        ctx.logger.debug({ code }, 'Last.fm rate limit reached; skipping this lookup');
      } else {
        throw new Error(`Last.fm error ${code}`);
      }
      return null;
    }
    const parsed = successSchema.safeParse(body);
    if (!parsed.success) throw new Error('Unexpected Last.fm response');
    const raw = parsed.data.similartracks.track;
    const entries = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
    const similar = entries
      .slice(0, LASTFM_SIMILAR_LIMIT)
      .map((entry) => ({
        artist: typeof entry.artist === 'string' ? entry.artist : entry.artist.name,
        title: entry.name,
      }))
      .filter((entry) => entry.artist !== '' && entry.title !== '');
    await cache.setJson(cacheKey, similar, LASTFM_CACHE_TTL_SECONDS);
    return similar;
  }

  async function resolveOne(ctx: DiscoveryContext, node: LavalinkNode, entry: SimilarTrack): Promise<Track | null> {
    try {
      // Last.fm text is remote data: never let it become a URL/identifier or pick a Lavalink source.
      const request = buildMetadataSearchRequest(`${entry.artist} ${entry.title}`);
      if (!request) return null;
      const result = await node.search(request, ctx.requester);
      if (result.loadType !== 'search') return null;
      return result.tracks.find((hit) => isPlausible(hit, entry.title)) ?? null;
    } catch {
      return null; // one unresolvable entry must not sink the others
    }
  }

  return {
    id: 'lastfm',
    isAvailable(ctx: DiscoveryContext, seed: Track): boolean {
      return (
        !disabled &&
        cleanArtist(seed.info.author) !== '' &&
        cleanTitle(seed.info.title, seed.info.author) !== '' &&
        ctx.service.getSearchNode() !== null
      );
    },
    async recommend(ctx: DiscoveryContext, seed: Track): Promise<Track[]> {
      const node = ctx.service.getSearchNode();
      if (!node) return [];
      const similar = await fetchSimilar(
        ctx,
        cleanArtist(seed.info.author),
        cleanTitle(seed.info.title, seed.info.author),
      );
      if (!similar || similar.length === 0) return [];

      // Bounded concurrency; the result keeps Last.fm's similarity order.
      const resolved = new Array<Track | null>(similar.length).fill(null);
      let next = 0;
      const worker = async (): Promise<void> => {
        while (next < similar.length && !ctx.signal.aborted) {
          const index = next++;
          const entry = similar[index];
          if (entry) resolved[index] = await resolveOne(ctx, node, entry);
        }
      };
      await Promise.all(Array.from({ length: Math.min(LASTFM_RESOLVE_CONCURRENCY, similar.length) }, worker));
      return resolved.filter((track): track is Track => track !== null);
    },
  };
}
