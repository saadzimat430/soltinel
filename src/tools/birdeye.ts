/**
 * On-chain data fetcher.
 *
 * Primary source: DexScreener — fully public, no API key required.
 *   https://api.dexscreener.com/latest/dex/tokens/{address}
 *   Returns the highest-liquidity pair for the token on Solana.
 *
 * Optional enhancement: Birdeye /defi/token_overview — requires BIRDEYE_API_KEY.
 *   Adds holder count, which DexScreener does not provide.
 *   Both /defi/price and /defi/token_overview return 401 without a key — the
 *   "public-api" subdomain is misleading; all endpoints are authenticated.
 *
 * If BIRDEYE_API_KEY is not set, Birdeye calls are skipped entirely.
 */
import { env } from "../config/env.js";

const DEXSCREENER_BASE = "https://api.dexscreener.com/latest/dex";
const BIRDEYE_BASE = "https://public-api.birdeye.so";

export interface OnchainData {
  price: number | null;
  liquidity: number | null;
  marketCap: number | null;
  fdv: number | null;
  priceChange24h: number | null;
  priceChange1h: number | null;
  volume24h: number | null;
  buys24h: number | null;
  sells24h: number | null;
  holders: number | null;      // only populated when BIRDEYE_API_KEY is set
  symbol: string | null;
  name: string | null;
  dex: string | null;          // e.g. "raydium", "meteora"
  pairAddress: string | null;
  source: "dexscreener" | "birdeye" | "none";
  raw?: unknown;
}

export async function getOnchainData(tokenAddress: string): Promise<OnchainData> {
  const result = await fetchDexScreener(tokenAddress);

  // Optionally enrich with holder count from Birdeye if a key is configured
  if (env.BIRDEYE_API_KEY) {
    await enrichWithBirdeye(tokenAddress, result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// DexScreener (primary — no API key needed)
// ---------------------------------------------------------------------------

async function fetchDexScreener(tokenAddress: string): Promise<OnchainData> {
  const empty: OnchainData = {
    price: null, liquidity: null, marketCap: null, fdv: null,
    priceChange24h: null, priceChange1h: null,
    volume24h: null, buys24h: null, sells24h: null,
    holders: null, symbol: null, name: null,
    dex: null, pairAddress: null, source: "none",
  };

  try {
    const res = await fetch(`${DEXSCREENER_BASE}/tokens/${tokenAddress}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      console.warn(`[dexscreener] HTTP ${res.status}`);
      return empty;
    }

    const j = (await res.json()) as any;

    // DexScreener returns one entry per trading pair; pick the Solana pair
    // with the highest USD liquidity for the most representative data.
    const pairs: any[] = (j?.pairs ?? []).filter(
      (p: any) => p.chainId === "solana",
    );
    if (pairs.length === 0) return empty;

    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const p = pairs[0];

    return {
      price:          parseNum(p.priceUsd),
      liquidity:      parseNum(p.liquidity?.usd),
      marketCap:      parseNum(p.marketCap),
      fdv:            parseNum(p.fdv),
      priceChange24h: parseNum(p.priceChange?.h24),
      priceChange1h:  parseNum(p.priceChange?.h1),
      volume24h:      parseNum(p.volume?.h24),
      buys24h:        p.txns?.h24?.buys   ?? null,
      sells24h:       p.txns?.h24?.sells  ?? null,
      holders:        null,
      symbol:         p.baseToken?.symbol ?? null,
      name:           p.baseToken?.name   ?? null,
      dex:            p.dexId             ?? null,
      pairAddress:    p.pairAddress       ?? null,
      source:         "dexscreener",
      raw:            p,
    };
  } catch (e) {
    console.warn("[dexscreener] fetch failed:", (e as Error).message);
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Birdeye enrichment (optional — only runs when BIRDEYE_API_KEY is set)
// ---------------------------------------------------------------------------

async function enrichWithBirdeye(
  tokenAddress: string,
  result: OnchainData,
): Promise<void> {
  try {
    const res = await fetch(
      `${BIRDEYE_BASE}/defi/token_overview?address=${tokenAddress}`,
      {
        headers: {
          accept: "application/json",
          "x-chain": "solana",
          "X-API-KEY": env.BIRDEYE_API_KEY!,
        },
      },
    );
    if (!res.ok) {
      console.warn(`[birdeye] token_overview HTTP ${res.status} — holder count unavailable`);
      return;
    }
    const j = (await res.json()) as any;
    const d = j?.data ?? {};
    result.holders = d.holder ?? null;
    result.source = "birdeye";
  } catch (e) {
    console.warn("[birdeye] enrichment failed:", (e as Error).message);
  }
}

// ---------------------------------------------------------------------------

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isFinite(n) ? n : null;
}
