import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { TradingState, type TradingStateType } from "./state.js";
import { analystNode } from "../agents/analyst.js";
import { sentimentNode } from "../agents/sentiment.js";
import { riskGuardNode } from "../agents/riskGuard.js";
import { executorNode } from "../agents/executor.js";

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
    .addNode("analystAgent", analystNode)
    .addNode("sentimentAgent", sentimentNode)
    .addNode("riskGuardAgent", riskGuardNode)
    .addNode("executorAgent", executorNode)
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
