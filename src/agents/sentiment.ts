import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/llm.js";
import { searchXPosts } from "../tools/xSentiment.js";
import { log } from "../config/logger.js";
import { env } from "../config/env.js";
import type { TradingStateType, SentimentResult } from "../graph/state.js";

const SentimentSchema = z.object({
  score: z.number().min(0).max(1),
  label: z.enum(["bullish", "bearish", "neutral"]),
  reasoning: z.string(),
});

export async function sentimentNode(
  state: TradingStateType,
): Promise<Partial<TradingStateType>> {
  log.divider("SENTIMENT AGENT");

  const symbol = state.onchainData?.symbol ?? state.tokenAddress;
  const query = state.onchainData?.symbol
    ? `$${state.onchainData.symbol} OR ${state.tokenAddress}`
    : state.tokenAddress;

  log.sentiment(`Searching X (Twitter) for recent posts`);
  log.sentiment(`Query: "${query}"`);
  log.sentiment(`Config: max_results=${env.X_MAX_RESULTS}  cache_ttl=${env.X_CACHE_TTL_MINUTES}min`);

  const { posts, fromCache, creditsUsed } = await searchXPosts(query);

  if (fromCache) {
    log.sentiment(`[CACHE HIT] Reusing cached posts — 0 credits used this run`);
  } else if (creditsUsed > 0) {
    log.sentiment(`[CACHE MISS] Fetched ${creditsUsed} tweet(s) — ${creditsUsed} read credit(s) used`);
  }

  if (posts.length === 0) {
    const reason = !env.X_ENABLED
      ? "X_ENABLED=false"
      : !env.X_BEARER_TOKEN
        ? "X_BEARER_TOKEN not set"
        : "zero results from API";
    log.warn(`No X posts — ${reason} — defaulting to neutral (0.50)`);
    log.sentiment(`→ Passing neutral sentiment to Risk Guard Agent`);

    const neutral: SentimentResult = {
      score: 0.5,
      label: "neutral",
      reasoning: `No X posts available (${reason}).`,
      sampleSize: 0,
    };
    return {
      sentiment: neutral,
      logs: [`[sentiment] ${symbol}: neutral 0.50 (no posts — ${reason})`],
    };
  }

  log.sentiment(`${posts.length} post(s) available — sending top ${Math.min(20, posts.length)} to LLM`);
  log.sentiment(`LLM task: score sentiment 0 (bearish) → 1 (bullish), filter bots/shills`);

  const sample = posts
    .slice(0, 20)
    .map((p, i) => `${i + 1}. ${p.text.replace(/\s+/g, " ").slice(0, 280)}`)
    .join("\n");

  const llm = getLLM().withStructuredOutput(SentimentSchema);

  const res = await llm.invoke([
    new SystemMessage(
      "You are a crypto sentiment analyst. Given recent X posts about a Solana token, " +
        "output a bullish score (0=extremely bearish, 1=extremely bullish). " +
        "Discount shill/bot content; weight engagement-sounding organic posts. " +
        "Return a concise one-paragraph reasoning.",
    ),
    new HumanMessage(
      `Token: ${symbol} (${state.tokenAddress})\n\nRecent posts:\n${sample}`,
    ),
  ]);

  const result: SentimentResult = { ...(res as Omit<SentimentResult, "sampleSize">), sampleSize: posts.length };

  const scoreBar = buildScoreBar(result.score);
  log.sentiment(`Score:     ${result.score.toFixed(3)}  ${scoreBar}`);
  log.sentiment(`Label:     ${result.label.toUpperCase()}`);
  log.sentiment(`Reasoning: ${result.reasoning}`);
  log.sentiment(`Sample:    ${posts.length} post(s) — credits used this session: ${creditsUsed}`);
  log.sentiment(`→ Passing sentiment result to Risk Guard Agent`);

  return {
    sentiment: result,
    logs: [
      `[sentiment] ${symbol}: ${result.label} ${result.score.toFixed(3)} ` +
      `(n=${posts.length}) — ${result.reasoning.slice(0, 120)}`,
    ],
  };
}

function buildScoreBar(score: number): string {
  const filled = Math.round(score * 20);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  return `[${bar}]`;
}
