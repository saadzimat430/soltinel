import { env } from "../config/env.js";

export interface XPost {
  id: string;
  text: string;
  createdAt?: string;
  author?: string;
}

/**
 * Pulls up to `max` recent posts mentioning the query from X API v2 recent search.
 * Returns [] if no bearer token is configured — the sentiment agent will then
 * produce a neutral score.
 */
export async function searchXPosts(query: string, max = 25): Promise<XPost[]> {
  if (!env.X_BEARER_TOKEN) return [];

  const q = encodeURIComponent(`${query} -is:retweet lang:en`);
  const url =
    `https://api.twitter.com/2/tweets/search/recent` +
    `?query=${q}&max_results=${Math.min(100, Math.max(10, max))}` +
    `&tweet.fields=created_at,author_id`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j = (await res.json()) as any;
    const posts: XPost[] = (j?.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      author: t.author_id,
    }));
    return posts;
  } catch (e) {
    console.warn("[x] search failed:", (e as Error).message);
    return [];
  }
}
