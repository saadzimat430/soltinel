import { AsyncLocalStorage } from "node:async_hooks";
import type { OnchainData } from "../tools/birdeye.js";
import type { RugRisk } from "../tools/rugcheck.js";
import type { RiskDecision, SentimentResult } from "../graph/state.js";

export type SessionInteractionMode = "cli" | "headless";
export type SessionExecutionMode = "full" | "analysis";
export type OverrideSource = "hard-rule" | "llm";
export type AgentName = "analyst" | "sentiment" | "risk_guard" | "executor";

export interface SoltinelEvent {
  type:
    | "session_started"
    | "session_completed"
    | "session_failed"
    | "agent_started"
    | "agent_completed"
    | "decision_made"
    | "override_requested"
    | "override_applied"
    | "trade_confirmation_requested"
    | "trade_cancelled"
    | "price_impact_warning"
    | "trade_executed";
  timestamp: string;
  threadId: string;
  tokenAddress?: string;
  agent?: AgentName;
  data?: Record<string, unknown>;
}

export interface TradeConfirmationRequest {
  tokenAddress: string;
  symbol: string;
  inputSymbol: string;
  inputMint: string;
  defaultAmount: number;
  maxAmount: number;
  sentiment: SentimentResult | null;
  rugRisk: RugRisk | null;
  riskDecision: RiskDecision | null;
}

export interface TradeConfirmationResponse {
  approved: boolean;
  amountUsd?: number;
}

export interface OverrideRequest {
  tokenAddress: string;
  reason: string;
  source: OverrideSource;
  onchainData: OnchainData | null;
  sentiment: SentimentResult | null;
  rugRisk: RugRisk | null;
}

export interface PriceImpactApprovalRequest {
  tokenAddress: string;
  symbol: string;
  amountUsd: number;
  impactPct: number;
  thresholdPct: number;
}

export interface SoltinelSessionHooks {
  onEvent?: (event: SoltinelEvent) => void | Promise<void>;
  confirmTrade?: (
    request: TradeConfirmationRequest,
  ) => TradeConfirmationResponse | Promise<TradeConfirmationResponse>;
  confirmOverride?: (request: OverrideRequest) => boolean | Promise<boolean>;
  confirmHighPriceImpact?: (
    request: PriceImpactApprovalRequest,
  ) => boolean | Promise<boolean>;
}

export interface SessionRuntimeContext {
  threadId: string;
  interactionMode: SessionInteractionMode;
  executionMode: SessionExecutionMode;
  hooks: SoltinelSessionHooks;
}

const sessionStorage = new AsyncLocalStorage<SessionRuntimeContext>();

export function withSessionContext<T>(
  context: SessionRuntimeContext,
  fn: () => Promise<T>,
): Promise<T> {
  return sessionStorage.run(context, fn);
}

export function getSessionContext(): SessionRuntimeContext | null {
  return sessionStorage.getStore() ?? null;
}

export function getInteractionMode(): SessionInteractionMode {
  return getSessionContext()?.interactionMode ?? "cli";
}

export function getExecutionMode(): SessionExecutionMode {
  return getSessionContext()?.executionMode ?? "full";
}

export async function emitEvent(
  event: Omit<SoltinelEvent, "timestamp" | "threadId">,
): Promise<void> {
  const context = getSessionContext();
  const onEvent = context?.hooks.onEvent;
  if (!context || !onEvent) return;

  await onEvent({
    ...event,
    threadId: context.threadId,
    timestamp: new Date().toISOString(),
  });
}

export async function requestTradeConfirmation(
  request: TradeConfirmationRequest,
): Promise<TradeConfirmationResponse | null> {
  const handler = getSessionContext()?.hooks.confirmTrade;
  if (!handler) return null;
  return handler(request);
}

export async function requestOverrideDecision(
  request: OverrideRequest,
): Promise<boolean | null> {
  const handler = getSessionContext()?.hooks.confirmOverride;
  if (!handler) return null;
  return handler(request);
}

export async function requestPriceImpactDecision(
  request: PriceImpactApprovalRequest,
): Promise<boolean | null> {
  const handler = getSessionContext()?.hooks.confirmHighPriceImpact;
  if (!handler) return null;
  return handler(request);
}
