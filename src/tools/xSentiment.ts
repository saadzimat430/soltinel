import { env } from "../config/env.js";

export interface XPost {
  id: string;
  text: string;
  createdAt?: string;
  author?: string;
}

interface CacheEntry {
  posts: XPost[];
  fetchedAt: number;
}

const _cache = new Map<string, CacheEntry>();

const TTL_MS = env.X_CACHE_TTL_MINUTES * 60_000;

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

function getCached(query: string): { entry: CacheEntry; ageMs: number } | null {
  if (TTL_MS <= 0) return null;
  const key = cacheKey(query);
  const entry = _cache.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.fetchedAt;
  if (ageMs > TTL_MS) { _cache.delete(key); return null; }
  return { entry, ageMs };
}

function setCached(query: string, posts: XPost[]): void {
  if (TTL_MS <= 0) return;
  _cache.set(cacheKey(query), { posts, fetchedAt: Date.now() });
}

/**
 * Searches X (Twitter) for recent posts matching `query`.
 *
 * Cost controls:
 *   X_ENABLED=false        → skip entirely, return []
 *   X_CACHE_TTL_MINUTES=N  → serve from cache if last fetch was within N minutes
 *   X_MAX_RESULTS=N        → cap tweets fetched per call (each = 1 read credit)
 *
 * Returns [] when disabled, token missing, or API error — the sentiment agent
 * falls back to neutral (0.5) in all these cases.
 */
export async function searchXPosts(
  query: string,
): Promise<{ posts: XPost[]; fromCache: boolean; creditsUsed: number }> {
  if (!env.X_ENABLED || !env.X_BEARER_TOKEN) {
    return { posts: [], fromCache: false, creditsUsed: 0 };
  }

  const cached = getCached(query);
  if (cached) {
    return { posts: cached.entry.posts, fromCache: true, creditsUsed: 0 };
  }

  const maxResults = Math.min(100, Math.max(10, env.X_MAX_RESULTS));
  const q = encodeURIComponent(`${query} -is:retweet lang:en`);
  const url =
    `https://api.twitter.com/2/tweets/search/recent` +
    `?query=${q}&max_results=${maxResults}` +
    `&tweet.fields=created_at,author_id`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json());
    const posts: XPost[] = (j?.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      author: t.author_id,
    }));
    setCached(query, posts);
    return { posts, fromCache: false, creditsUsed: posts.length };
  } catch (e) {
    console.warn("[x] search failed:", (e as Error).message);
    return { posts: [], fromCache: false, creditsUsed: 0 };
  }
}
