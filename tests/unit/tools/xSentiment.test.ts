import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/config/env.js", () => ({
  env: {
    X_ENABLED: true,
    X_BEARER_TOKEN: "test-bearer-token",
    X_MAX_RESULTS: 10,
    X_CACHE_TTL_MINUTES: 5,
  },
}));

import { searchXPosts } from "../../../src/tools/xSentiment.js";

const rawPosts = [
  { id: "1", text: "BONK pumping!", created_at: "2026-01-01T00:00:00Z", author_id: "u1" },
  { id: "2", text: "Buying more BONK", created_at: "2026-01-01T00:01:00Z", author_id: "u2" },
];

function makeFetch(posts = rawPosts) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: posts }),
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("searchXPosts", () => {
  it("fetches posts and returns creditsUsed equal to post count", async () => {
    vi.stubGlobal("fetch", makeFetch());
    const result = await searchXPosts("BONK_FETCH");
    expect(result.posts).toHaveLength(2);
    expect(result.fromCache).toBe(false);
    expect(result.creditsUsed).toBe(2);
  });

  it("returns cached result on second call within TTL", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    await searchXPosts("BONK_CACHE");
    const second = await searchXPosts("BONK_CACHE");
    expect(second.fromCache).toBe(true);
    expect(second.creditsUsed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires (5 min)", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    await searchXPosts("BONK_TTL");
    vi.advanceTimersByTime(6 * 60 * 1000); // advance 6 min
    const result = await searchXPosts("BONK_TTL");
    expect(result.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats query case-insensitively for cache key", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
    await searchXPosts("BONK_CASE");
    const lower = await searchXPosts("bonk_case");
    expect(lower.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty and zero credits on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const result = await searchXPosts("ERR_TOKEN");
    expect(result.posts).toHaveLength(0);
    expect(result.creditsUsed).toBe(0);
    expect(result.fromCache).toBe(false);
  });

  it("returns empty on non-ok HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const result = await searchXPosts("RATE_LIMITED");
    expect(result.posts).toHaveLength(0);
  });
});
