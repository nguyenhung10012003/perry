/** Helpers for YouTube links (video + list parameters, Mix lists). Pure functions, no I/O. */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,128}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

export interface YoutubeIds {
  videoId?: string;
  listId?: string;
}

function parseUrl(text: string): URL | null {
  try {
    return new URL(text.trim());
  } catch {
    return null;
  }
}

/**
 * Lavalink loads `youtu.be/<id>?list=X` as a single track and ignores the list. Rewrites exactly that shape to
 * `https://www.youtube.com/watch?v=<id>&list=X` (other parameters are dropped); every other input is returned unchanged.
 * The rewritten URL has a fixed, public host, so it needs no further safety check.
 */
export function normalizeYoutubeUrl(text: string): string {
  const url = parseUrl(text);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return text;
  if (url.hostname.toLowerCase() !== 'youtu.be') return text;
  const videoId = url.pathname.split('/').filter((part) => part !== '')[0];
  const listId = url.searchParams.get('list');
  if (videoId === undefined || !VIDEO_ID.test(videoId) || listId === null || !LIST_ID.test(listId)) return text;
  return `https://www.youtube.com/watch?v=${videoId}&list=${listId}`;
}

/** Video and list ids of a YouTube link (`youtube.com`, `m.`, `music.` and `youtu.be`); empty object for anything else. */
export function parseYoutubeIds(text: string): YoutubeIds {
  const url = parseUrl(text);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return {};
  const host = url.hostname.toLowerCase();
  const ids: YoutubeIds = {};
  let video: string | null | undefined;
  if (host === 'youtu.be') {
    video = url.pathname.split('/').filter((part) => part !== '')[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    video = url.searchParams.get('v');
  } else {
    return {};
  }
  if (video !== undefined && video !== null && VIDEO_ID.test(video)) ids.videoId = video;
  const list = url.searchParams.get('list');
  if (list !== null && LIST_ID.test(list)) ids.listId = list;
  return ids;
}

/** True for YouTube Mix / radio list ids (they start with `RD`). */
export function isMixListId(listId: string | undefined): boolean {
  return listId !== undefined && listId.startsWith('RD');
}
