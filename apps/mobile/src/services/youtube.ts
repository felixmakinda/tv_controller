import type { MediaResult, MediaSearchProvider } from '@tvc/command-engine';
import Storage from 'expo-sqlite/kv-store';
import { secrets } from '@/store/storage';

/**
 * YouTube Data API v3 search. Search ONLY — the Data API cannot control a TV;
 * playback is handed to the TV adapter's deep link.
 *
 * Quota: search.list has its own bucket of 100 calls/day by default
 * (developers.google.com/youtube/v3/determine_quota_cost, checked 2026-11-08),
 * so results are cached for 24h.
 */
export const YOUTUBE_KEY_SECRET = 'youtube.apiKey';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function apiKey(): Promise<string | null> {
  return (await secrets.get<string>(YOUTUBE_KEY_SECRET)) ?? (process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || null);
}

export async function youtubeConfigured(): Promise<boolean> {
  return (await apiKey()) !== null;
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export const youtubeSearch: MediaSearchProvider = {
  app: 'youtube',
  async search(query, options = {}) {
    const key = await apiKey();
    if (!key) throw new Error('Add a YouTube API key in Settings to search.');
    const limit = options.limit ?? 10;
    const cacheKey = `yt.${options.mode ?? 'video'}.${limit}.${query.trim().toLowerCase()}`;
    const cached = await Storage.getItem(cacheKey);
    if (cached) {
      const { at, results } = JSON.parse(cached) as { at: number; results: MediaResult[] };
      if (Date.now() - at < CACHE_TTL_MS) return results;
    }

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(limit),
      q: query,
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      key,
    });
    if (options.mode === 'music') params.set('videoCategoryId', '10');
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (res.status === 403) throw new Error('YouTube search quota reached or key not allowed.');
    if (!res.ok) throw new Error(`YouTube search failed (${res.status}).`);
    const json = (await res.json()) as {
      items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }[];
    };
    const results: MediaResult[] = (json.items ?? []).flatMap((it) => {
      const id = it.id?.videoId;
      if (!id) return [];
      const thumb = it.snippet?.thumbnails?.medium?.url;
      const channel = it.snippet?.channelTitle;
      return [{
        id,
        title: decodeEntities(it.snippet?.title ?? id),
        ...(channel ? { channel } : {}),
        ...(thumb ? { thumbnailUrl: thumb } : {}),
      }];
    });
    await Storage.setItem(cacheKey, JSON.stringify({ at: Date.now(), results }));
    return results;
  },
};
