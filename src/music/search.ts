import { createHash } from "node:crypto";
import { DefaultSources } from "lavalink-client";
import type { Track } from "lavalink-client";
import { z } from "zod";
import {
  AUTOCOMPLETE_DEBOUNCE_MS,
  AUTOCOMPLETE_REDIS_TTL_SECONDS,
  AUTOCOMPLETE_TIMEOUT_MS,
  MAX_PLAYLIST_TRACKS,
} from "../config/constants.js";
import { safeError } from "../utils/errors.js";
import { truncate } from "./format.js";
import type { MusicService } from "./music-service.js";
import type { Requester } from "./requester.js";
import {
  isMixListId,
  normalizeYoutubeUrl,
  parseYoutubeIds,
} from "./youtube-url.js";

// ---------------------------------------------------------------------------
// URL safety (plan D15)
// ---------------------------------------------------------------------------

/** True for dotted-quad IPv4 addresses that point at loopback, private or otherwise non-public space. */
function isBlockedIPv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol + TEST-NET-1
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  return a >= 224; // multicast + reserved + broadcast
}

function parseIPv4(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1, 5).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/** Expands an IPv6 literal (without brackets) into eight 16-bit groups, or null when malformed. */
function parseIPv6(host: string): number[] | null {
  let text = host;
  const zoneIndex = text.indexOf("%");
  if (zoneIndex >= 0) text = text.slice(0, zoneIndex);
  // Embedded dotted IPv4 tail (e.g. ::ffff:1.2.3.4)
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (segment: string): number[] | null => {
    if (segment === "") return [];
    const groups: number[] = [];
    for (const piece of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(piece)) return null;
      groups.push(parseInt(piece, 16));
    }
    return groups;
  };
  const head = parseGroups(halves[0] ?? "");
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = parseGroups(halves[1] ?? "");
  if (!rest) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...rest];
}

function embeddedV4Blocked(hi: number, lo: number): boolean {
  return isBlockedIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff);
}

function isBlockedIPv6(groups: number[]): boolean {
  const g = (index: number): number => groups[index] ?? 0;
  const firstSixZero = groups.slice(0, 6).every((x) => x === 0);
  if (groups.every((x) => x === 0)) return true; // ::
  if (groups.slice(0, 7).every((x) => x === 0) && g(7) === 1) return true; // ::1
  if (firstSixZero) return embeddedV4Blocked(g(6), g(7)); // IPv4-compatible
  if (groups.slice(0, 5).every((x) => x === 0) && g(5) === 0xffff)
    return embeddedV4Blocked(g(6), g(7)); // mapped
  if (
    g(0) === 0x64 &&
    g(1) === 0xff9b &&
    groups.slice(2, 6).every((x) => x === 0)
  ) {
    return embeddedV4Blocked(g(6), g(7)); // NAT64
  }
  if (g(0) === 0x2002) return embeddedV4Blocked(g(1), g(2)); // 6to4
  if ((g(0) & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g(0) & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g(0) & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((g(0) & 0xff00) === 0xff00) return true; // multicast
  if (g(0) === 0x2001 && g(1) === 0x0db8) return true; // documentation
  return false;
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

/**
 * Single enforcement point for URLs passed to Lavalink (its http source can fetch arbitrary URLs).
 * Allows only http/https to public-looking hosts. DNS rebinding is not covered.
 */
export function isSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  let host = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host === "") return false;

  if (host.startsWith("[") && host.endsWith("]")) {
    const groups = parseIPv6(host.slice(1, -1));
    return groups !== null && !isBlockedIPv6(groups);
  }
  const v4 = parseIPv4(host);
  if (v4) return !isBlockedIPv4(v4[0], v4[1], v4[2]);

  if (host === "localhost" || host === "host.docker.internal") return false;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
  // Single-label names (docker service names, intranet hosts) are never public sites.
  return host.includes(".");
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

export type SearchSource = "youtube" | "youtubemusic" | "soundcloud";
type SearchPrefix = "ytsearch" | "ytmsearch" | "scsearch";

const SOURCE_PREFIX: Record<SearchSource, SearchPrefix> = {
  youtube: "ytsearch",
  youtubemusic: "ytmsearch",
  soundcloud: "scsearch",
};

export type SearchRequest =
  | { query: string; source: SearchPrefix }
  | { query: string; source?: undefined };

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

export function isUrlLike(text: string): boolean {
  return URL_LIKE.test(text.trim());
}

/** Every lavalink-client source key (some contain dots or spaces, e.g. "spotify.com", "youtube music"). */
const SOURCE_PREFIXES = Object.keys(DefaultSources).map((key) =>
  key.toLowerCase(),
);

/**
 * Builds the request for lavalink-client. Returns null for unsafe URLs.
 * Plain text gets an explicit search source; a typed "<source>:" prefix (any DefaultSources key, matched like
 * lavalink-client's findSourceOfQuery) is neutralised by turning its colon into a space, so users cannot pick
 * arbitrary lavalink-client sources (e.g. `local:`).
 */
export function buildSearchRequest(
  query: string,
  source: SearchSource = "youtube",
): SearchRequest | null {
  const text = query.trim();
  // The safety check runs on the original text; the youtu.be rewrite only produces a fixed www.youtube.com URL.
  if (isUrlLike(text))
    return isSafeUrl(text) ? { query: normalizeYoutubeUrl(text) } : null;
  return { query: neutraliseSourcePrefix(text), source: SOURCE_PREFIX[source] };
}

/** Turns a leading "<source>:" (any DefaultSources key) into "<source> " so it cannot select a lavalink-client source. */
function neutraliseSourcePrefix(text: string): string {
  const lower = text.toLowerCase();
  const prefix = SOURCE_PREFIXES.find((key) => lower.startsWith(`${key}:`));
  return prefix !== undefined
    ? `${text.slice(0, prefix.length)} ${text.slice(prefix.length + 1)}`
    : text;
}

/**
 * Builds a plain-text search request from remote metadata (artist/title strings from tracks or Last.fm), which is
 * attacker-controllable. URL-like text is dropped (null) and a source prefix is neutralised, so metadata can never
 * become a raw Lavalink identifier or select a source. Always searches the given source.
 */
export function buildMetadataSearchRequest(
  text: string,
  source: SearchSource = "youtube",
): SearchRequest | null {
  const trimmed = text.trim();
  if (trimmed === "" || isUrlLike(trimmed)) return null;
  return {
    query: neutraliseSourcePrefix(trimmed),
    source: SOURCE_PREFIX[source],
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface LoadedPlaylist {
  name: string;
  uri: string | null;
  thumbnail: string | null;
  /** Number of tracks returned by the node before the cap. */
  totalTracks: number;
}

export type LoadOutcome =
  | {
      kind: "ok";
      loadType: "track" | "playlist" | "search";
      tracks: Track[];
      playlist: LoadedPlaylist | null;
      wasCapped: boolean;
      droppedCount: number;
      /** Index of the video selected by the link (`v=` inside a list) before rotation, -1 when none. */
      selectedIndex: number;
      /** The link was a YouTube Mix / radio list (`list=RD...`). */
      isMix: boolean;
      /** The playlist was rotated so that `tracks[0]` is the selected video. */
      rotated: boolean;
    }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unsafe" }
  | { kind: "sourceDisabled" }
  | { kind: "noNode" };

// lavalink-client validates sources client-side: "... Lavalink Node has not 'spotify' enabled".
const SOURCE_DISABLED_PATTERN = /has not '[^']+' enabled/i;

/**
 * Resolves a query or URL into tracks. Never throws and never leaks exception text.
 * `source` only applies to plain-text queries.
 */
export async function loadTracks(
  service: MusicService,
  query: string,
  source: SearchSource | undefined,
  requester: Requester,
): Promise<LoadOutcome> {
  const request = buildSearchRequest(query, source);
  if (!request) return { kind: "unsafe" };
  const node = service.getSearchNode();
  if (!node) return { kind: "noNode" };
  try {
    const result = await node.search(request, requester);
    if (result.loadType === "error") {
      service.logger.debug(
        {
          message: result.exception?.message
            ? safeError(new Error(result.exception.message)).message
            : undefined,
        },
        "Lavalink returned a load error",
      );
      return { kind: "error" };
    }
    if (result.loadType === "empty" || result.tracks.length === 0)
      return { kind: "empty" };
    let tracks = result.tracks;
    let droppedCount = 0;
    const isPlaylist = result.loadType === "playlist";
    const selected = isPlaylist ? result.playlist?.selectedTrack : null;
    const selectedIndex = selected?.encoded
      ? tracks.findIndex((track) => track.encoded === selected.encoded)
      : -1;
    const rotated = selectedIndex > 0;
    // Rotate BEFORE the cap so the selected video is first and the dropped tail is counted correctly.
    if (rotated)
      tracks = [
        ...tracks.slice(selectedIndex),
        ...tracks.slice(0, selectedIndex),
      ];
    if (isPlaylist && tracks.length > MAX_PLAYLIST_TRACKS) {
      droppedCount = tracks.length - MAX_PLAYLIST_TRACKS;
      tracks = tracks.slice(0, MAX_PLAYLIST_TRACKS);
    }
    return {
      kind: "ok",
      loadType: result.loadType,
      tracks,
      playlist:
        result.loadType === "playlist" && result.playlist
          ? {
              name: result.playlist.name || result.playlist.title,
              uri: result.playlist.uri ?? null,
              thumbnail: result.playlist.thumbnail ?? null,
              totalTracks: result.tracks.length,
            }
          : null,
      wasCapped: droppedCount > 0,
      droppedCount,
      selectedIndex,
      isMix: isPlaylist && isMixListId(parseYoutubeIds(request.query).listId),
      rotated,
    };
  } catch (err) {
    service.logger.debug({ err: safeError(err) }, "Track loading failed");
    const message = err instanceof Error ? err.message : "";
    if (SOURCE_DISABLED_PATTERN.test(message))
      return { kind: "sourceDisabled" };
    if (!service.manager.useable || !node.connected) return { kind: "noNode" };
    return { kind: "error" };
  }
}

// ---------------------------------------------------------------------------
// Autocomplete (plan D14)
// ---------------------------------------------------------------------------

export interface AutocompleteChoice {
  name: string;
  value: string;
}

const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 60_000;
const MIN_QUERY_LENGTH = 2;
const MAX_CHOICES = 25;
const MAX_CHOICE_LENGTH = 100;
/** The shared (Redis) cache may use at most half of the autocomplete budget; the rest is left for the search. */
const SHARED_CACHE_READ_BUDGET_MS = Math.floor(AUTOCOMPLETE_TIMEOUT_MS / 2);

const sharedChoicesSchema = z
  .array(
    z.object({
      name: z.string().max(MAX_CHOICE_LENGTH),
      value: z.string().max(MAX_CHOICE_LENGTH),
    }),
  )
  .max(MAX_CHOICES);

interface CacheEntry {
  expiresAt: number;
  choices: AutocompleteChoice[];
}

interface PendingDebounce {
  timer: NodeJS.Timeout;
  supersede: () => void;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<AutocompleteChoice[]>>();
const pending = new Map<string, PendingDebounce>();

function cacheGet(key: string): AutocompleteChoice[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // refresh recency (Map keeps insertion order)
  cache.delete(key);
  cache.set(key, entry);
  return entry.choices;
}

function cacheSet(key: string, choices: AutocompleteChoice[]): void {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, choices });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

function toChoice(track: Track): AutocompleteChoice {
  const label = truncate(
    `${track.info.title} - ${track.info.author}`.replace(/\s+/g, " "),
    MAX_CHOICE_LENGTH,
  );
  const uri = track.info.uri;
  const value =
    uri.length > 0 && uri.length <= MAX_CHOICE_LENGTH
      ? uri
      : truncate(track.info.title, MAX_CHOICE_LENGTH);
  return { name: label, value };
}

/** Waits for the debounce window; resolves false when a newer request from the same user superseded this one. */
function debounce(userId: string): Promise<boolean> {
  const previous = pending.get(userId);
  if (previous) {
    clearTimeout(previous.timer);
    previous.supersede();
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(userId);
      resolve(true);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    pending.set(userId, { timer, supersede: () => resolve(false) });
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Redis key for a typed query: `ac:{source}:{sha1(lowercased query)}`. */
function sharedCacheKey(
  service: MusicService,
  source: SearchSource,
  typed: string,
): string {
  const hash = createHash("sha1").update(typed.toLowerCase()).digest("hex");
  return service.client.storage.keys.autocomplete(source, hash);
}

/** Reads the shared cache within SHARED_CACHE_READ_BUDGET_MS; any failure is a miss. */
async function readSharedCache(
  service: MusicService,
  key: string,
): Promise<AutocompleteChoice[] | null> {
  const storage = service.client.storage;
  if (storage.driver === "memory") return null;
  const stored = await withTimeout(
    storage.cache.getJson(key).catch((): unknown => undefined),
    SHARED_CACHE_READ_BUDGET_MS,
    undefined,
  );
  const parsed = sharedChoicesSchema.safeParse(stored);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/**
 * Autocomplete helper for /play. Debounced per user, cached, and bounded by a timeout
 * (a late result still fills the cache). Returns at most 25 choices with name/value <= 100 chars.
 */
export async function autocompleteSearch(
  service: MusicService,
  userId: string,
  text: string,
  source: SearchSource = "youtube",
): Promise<AutocompleteChoice[]> {
  const typed = text.trim();
  if (typed.length < MIN_QUERY_LENGTH) return [];

  if (isUrlLike(typed)) {
    // URLs are not searched: echo the typed value when Discord can accept it as a choice value.
    if (typed.length > MAX_CHOICE_LENGTH || !isSafeUrl(typed)) return [];
    return [{ name: typed, value: typed }];
  }

  const key = `${source}:${typed.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  if (!(await debounce(userId))) return [];
  const cachedAfterWait = cacheGet(key);
  if (cachedAfterWait) return cachedAfterWait;

  let task = inFlight.get(key);
  if (!task) {
    task = (async (): Promise<AutocompleteChoice[]> => {
      // Second layer: shared across processes. Inside the task, so the whole lookup stays within the timeout below.
      const sharedKey = sharedCacheKey(service, source, typed);
      const shared = await readSharedCache(service, sharedKey);
      if (shared) {
        cacheSet(key, shared);
        return shared;
      }
      const outcome = await loadTracks(service, typed, source, {
        id: userId,
        username: "",
      });
      if (outcome.kind !== "ok") return [];
      const choices = outcome.tracks.slice(0, MAX_CHOICES).map(toChoice);
      cacheSet(key, choices);
      if (service.client.storage.driver !== "memory") {
        // Fire and forget: setJson never rejects and a failed write is simply ignored.
        void service.client.storage.cache.setJson(
          sharedKey,
          choices,
          AUTOCOMPLETE_REDIS_TTL_SECONDS,
        );
      }
      return choices;
    })().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, task);
  }
  return withTimeout(task, AUTOCOMPLETE_TIMEOUT_MS, []);
}
