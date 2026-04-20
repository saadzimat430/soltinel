import { randomUUID } from "node:crypto";
import { executorNode } from "./agents/executor.js";
import { buildGraph } from "./graph/build.js";
import type { TradingStateType } from "./graph/state.js";
import {
  emitEvent,
  withSessionContext,
  type SessionExecutionMode,
  type SessionInteractionMode,
  type SoltinelSessionHooks,
} from "./runtime/session.js";

export interface RunSoltinelSessionInput {
  tokenAddress: string;
  threadId?: string;
  executionMode?: SessionExecutionMode;
  interactionMode?: SessionInteractionMode;
  hooks?: SoltinelSessionHooks;
}

export interface AnalyzeTokenInput {
  tokenAddress: string;
  threadId?: string;
  interactionMode?: SessionInteractionMode;
  hooks?: SoltinelSessionHooks;
}

export interface ExecuteApprovedTradeInput {
  tokenAddress: string;
  threadId?: string;
  interactionMode?: SessionInteractionMode;
  hooks?: SoltinelSessionHooks;
  onchainData: TradingStateType["onchainData"];
  sentiment: TradingStateType["sentiment"];
  rugRisk: NonNullable<TradingStateType["rugRisk"]>;
  riskDecision: NonNullable<TradingStateType["riskDecision"]>;
  logs?: string[];
}

export interface SoltinelSessionResult {
  threadId: string;
  tokenAddress: string;
  executionMode: SessionExecutionMode;
  decision: "approve" | "reject" | "none";
  confidence: number | null;
  blockingReasons: string[];
  recommendedAction: "execute" | "reject" | "dry_run" | "review" | "none";
  executionStatus: "not_started" | "skipped" | "dry_run" | "executed" | "cancelled";
  finalAction: TradingStateType["finalAction"];
  state: TradingStateType;
}

export async function runSoltinelSession(
  input: RunSoltinelSessionInput,
): Promise<SoltinelSessionResult> {
  const threadId = input.threadId ?? randomUUID();
  const executionMode = input.executionMode ?? "full";
  const interactionMode = input.interactionMode ?? "headless";

  return withSessionContext(
    {
      threadId,
      executionMode,
      interactionMode,
      hooks: input.hooks ?? {},
    },
    async () => {
      await emitEvent({
        type: "session_started",
        tokenAddress: input.tokenAddress,
        data: { executionMode, interactionMode },
      });

      try {
        const graph = buildGraph();
        const state = await graph.invoke(
          { tokenAddress: input.tokenAddress },
          { configurable: { thread_id: threadId } },
        );

        const result = buildSessionResult(state, threadId, executionMode);
        await emitEvent({
          type: "session_completed",
          tokenAddress: input.tokenAddress,
          data: {
            decision: result.decision,
            executionStatus: result.executionStatus,
            recommendedAction: result.recommendedAction,
          },
        });
        return result;
      } catch (error) {
        await emitEvent({
          type: "session_failed",
          tokenAddress: input.tokenAddress,
          data: { message: toErrorMessage(error) },
        });
        throw error;
      }
    },
  );
}

export async function analyzeToken(
  input: AnalyzeTokenInput,
): Promise<SoltinelSessionResult> {
  return runSoltinelSession({
    ...input,
    executionMode: "analysis",
    interactionMode: input.interactionMode ?? "headless",
  });
}

export async function executeApprovedTrade(
  input: ExecuteApprovedTradeInput,
): Promise<SoltinelSessionResult> {
  if (input.riskDecision.decision !== "approve") {
    throw new Error("executeApprovedTrade requires an approved riskDecision");
  }

  const threadId = input.threadId ?? randomUUID();
  const interactionMode = input.interactionMode ?? "headless";
  const baseState: TradingStateType = {
    tokenAddress: input.tokenAddress,
    onchainData: input.onchainData,
    sentiment: input.sentiment,
    rugRisk: input.rugRisk,
    riskDecision: input.riskDecision,
    finalAction: null,
    logs: input.logs ?? [],
  };

  return withSessionContext(
    {
      threadId,
      executionMode: "full",
      interactionMode,
      hooks: input.hooks ?? {},
    },
    async () => {
      await emitEvent({
        type: "session_started",
        tokenAddress: input.tokenAddress,
        data: {
          executionMode: "full",
          interactionMode,
          source: "executeApprovedTrade",
        },
      });

      try {
        const update = await executorNode(baseState);
        const state = mergeState(baseState, update);
        const result = buildSessionResult(state, threadId, "full");
        await emitEvent({
          type: "session_completed",
          tokenAddress: input.tokenAddress,
          data: {
            decision: result.decision,
            executionStatus: result.executionStatus,
            recommendedAction: result.recommendedAction,
            source: "executeApprovedTrade",
          },
        });
        return result;
      } catch (error) {
        await emitEvent({
          type: "session_failed",
          tokenAddress: input.tokenAddress,
          data: {
            message: toErrorMessage(error),
            source: "executeApprovedTrade",
          },
        });
        throw error;
      }
    },
  );
}

function mergeState(
  state: TradingStateType,
  update: Partial<TradingStateType>,
): TradingStateType {
  return {
    ...state,
    ...update,
    logs: [...state.logs, ...(update.logs ?? [])],
  };
}

function buildSessionResult(
  state: TradingStateType,
  threadId: string,
  executionMode: SessionExecutionMode,
): SoltinelSessionResult {
  const decision = state.riskDecision?.decision ?? "none";
  const confidence = state.riskDecision?.rejectConfidence ?? null;
  const blockingReasons = parseBlockingReasons(state);
  const executionStatus = determineExecutionStatus(state);

  return {
    threadId,
    tokenAddress: state.tokenAddress,
    executionMode,
    decision,
    confidence,
    blockingReasons,
    recommendedAction: determineRecommendedAction(decision, executionStatus),
    executionStatus,
    finalAction: state.finalAction,
    state,
  };
}

function parseBlockingReasons(state: TradingStateType): string[] {
  const reason = state.riskDecision?.reason?.trim();
  if (!reason) return [];

  if (state.riskDecision?.decision === "reject" && reason.startsWith("Hard rules tripped: ")) {
    return reason
      .slice("Hard rules tripped: ".length)
      .split("; ")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [reason];
}

function determineExecutionStatus(
  state: TradingStateType,
): SoltinelSessionResult["executionStatus"] {
  const action = state.finalAction;
  if (!action) {
    return state.riskDecision?.decision === "approve" ? "not_started" : "skipped";
  }

  if (action.type === "swap") {
    return action.dryRun ? "dry_run" : "executed";
  }

  if (action.note?.includes("analysis-only")) return "skipped";
  if (action.note?.includes("risk guard did not approve")) return "skipped";
  return "cancelled";
}

function determineRecommendedAction(
  decision: SoltinelSessionResult["decision"],
  executionStatus: SoltinelSessionResult["executionStatus"],
): SoltinelSessionResult["recommendedAction"] {
  if (decision === "reject") return "reject";
  if (executionStatus === "dry_run") return "dry_run";
  if (decision === "approve" && executionStatus === "not_started") return "execute";
  if (executionStatus === "cancelled") return "review";
  return "none";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
