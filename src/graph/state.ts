import { Annotation } from "@langchain/langgraph";
import type { OnchainData } from "../tools/birdeye.js";
import type { RugRisk } from "../tools/rugcheck.js";

export interface SentimentResult {
  score: number;                              // 0 (bearish) … 1 (bullish)
  label: "bullish" | "bearish" | "neutral";
  reasoning: string;
  sampleSize: number;
}

export interface RiskDecision {
  decision: "approve" | "reject";
  reason: string;
  rejectConfidence: number; // 0-1 — probability this trade should be rejected
}

export interface FinalAction {
  type: "swap" | "none";
  inputMint?: string;
  outputMint?: string;
  amountUsd?: number;
  txSignature?: string | null;
  dryRun: boolean;
  note?: string;
}

/**
 * Shared graph state. Using LangGraph's Annotation API so reducers are explicit
 * and each node can return a partial update.
 */
export const TradingState = Annotation.Root({
  tokenAddress: Annotation<string>({
    reducer: (_old, next) => next,
    default: () => "",
  }),
  onchainData: Annotation<OnchainData | null>({
    reducer: (_old, next) => next,
    default: () => null,
  }),
  sentiment: Annotation<SentimentResult | null>({
    reducer: (_old, next) => next,
    default: () => null,
  }),
  rugRisk: Annotation<RugRisk | null>({
    reducer: (_old, next) => next,
    default: () => null,
  }),
  riskDecision: Annotation<RiskDecision | null>({
    reducer: (_old, next) => next,
    default: () => null,
  }),
  finalAction: Annotation<FinalAction | null>({
    reducer: (_old, next) => next,
    default: () => null,
  }),
  logs: Annotation<string[]>({
    reducer: (old, next) => [...(old ?? []), ...next],
    default: () => [],
  }),
});

export type TradingStateType = typeof TradingState.State;
