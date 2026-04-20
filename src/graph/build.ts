import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { TradingState, type TradingStateType } from "./state.js";
import { analystNode } from "../agents/analyst.js";
import { sentimentNode } from "../agents/sentiment.js";
import { riskGuardNode } from "../agents/riskGuard.js";
import { executorNode } from "../agents/executor.js";
import { emitEvent, type AgentName } from "../runtime/session.js";

/**
 * Graph topology:
 *
 *   START → analystAgent → sentimentAgent → riskGuardAgent
 *                                             ├─ approve → executorAgent → END
 *                                             └─ reject  ──────────────→ END
 *
 * Node names are suffixed with "Agent" to avoid collision with same-named
 * fields in TradingState (LangGraph forbids node name == state key name).
 */
export function buildGraph() {
  const graph = new StateGraph(TradingState)
    .addNode("analystAgent", instrumentNode("analyst", analystNode))
    .addNode("sentimentAgent", instrumentNode("sentiment", sentimentNode))
    .addNode("riskGuardAgent", instrumentNode("risk_guard", riskGuardNode))
    .addNode("executorAgent", instrumentNode("executor", executorNode))
    .addEdge(START, "analystAgent")
    .addEdge("analystAgent", "sentimentAgent")
    .addEdge("sentimentAgent", "riskGuardAgent")
    .addConditionalEdges("riskGuardAgent", routeAfterRisk, {
      executorAgent: "executorAgent",
      end: END,
    })
    .addEdge("executorAgent", END);

  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

function routeAfterRisk(state: TradingStateType): "executorAgent" | "end" {
  return state.riskDecision?.decision === "approve" ? "executorAgent" : "end";
}

function instrumentNode(
  agent: AgentName,
  node: (state: TradingStateType) => Promise<Partial<TradingStateType>>,
) {
  return async (state: TradingStateType): Promise<Partial<TradingStateType>> => {
    const startedAt = Date.now();
    await emitEvent({
      type: "agent_started",
      agent,
      tokenAddress: state.tokenAddress,
    });

    const update = await node(state);

    await emitEvent({
      type: "agent_completed",
      agent,
      tokenAddress: state.tokenAddress,
      data: {
        durationMs: Date.now() - startedAt,
        updatedKeys: Object.keys(update),
      },
    });

    return update;
  };
}
