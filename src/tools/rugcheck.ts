import { env } from "../config/env.js";

export interface RugRisk {
  score: number;            // 0-100, higher = riskier
  label: "low" | "medium" | "high" | "unknown";
  risks: string[];          // list of flagged issues
  mintAuthority: boolean | null;
  freezeAuthority: boolean | null;
  topHolderPct: number | null;
  raw?: unknown;
}

/**
 * Queries RugCheck.xyz for a token risk report. If the API is unreachable,
 * returns an "unknown" risk so downstream agents fail closed.
 */
export async function getRugRisk(tokenAddress: string): Promise<RugRisk> {
  const url = `${env.RUGCHECK_BASE_URL}/tokens/${tokenAddress}/report/summary`;

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const j = (await res.json()) as any;

    const score: number =
      typeof j?.score_normalised === "number"
        ? j.score_normalised
        : typeof j?.score === "number"
          ? Math.min(100, j.score)
          : 50;

    const risks: string[] = Array.isArray(j?.risks)
      ? j.risks.map((r: any) => `${r.name}${r.description ? ": " + r.description : ""}`)
      : [];

    const topHolderPct: number | null =
      j?.topHolders?.[0]?.pct ?? j?.top_holders?.[0]?.pct ?? null;

    const label: RugRisk["label"] =
      score >= 70 ? "high" : score >= 40 ? "medium" : "low";

    return {
      score,
      label,
      risks,
      mintAuthority: j?.token?.mintAuthority ?? null,
      freezeAuthority: j?.token?.freezeAuthority ?? null,
      topHolderPct,
      raw: j,
    };
  } catch (e) {
    console.warn("[rugcheck] failed:", (e as Error).message);
    return {
      score: 100,                 // fail closed
      label: "unknown",
      risks: ["rugcheck_unavailable"],
      mintAuthority: null,
      freezeAuthority: null,
      topHolderPct: null,
    };
  }
}
