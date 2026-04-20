# LangChain Architecture in the Solana Trading Bot

This document explains exactly how `@langchain/core`, `@langchain/langgraph`, and the configured LLM are used throughout the codebase — what each abstraction does, why it was chosen, and where to find it.

---

## Package responsibilities

| Package | Role in this app |
|---|---|
| `@langchain/langgraph` | Orchestrates the four agents as a directed graph with typed shared state and a checkpointer |
| `@langchain/core` | Provides `BaseChatModel`, `SystemMessage`/`HumanMessage`, and the `withStructuredOutput` binding |
| `@langchain/anthropic` | Claude driver (implements `BaseChatModel`) |
| `@langchain/openai` | GPT-4o / OpenRouter driver (implements `BaseChatModel`) |

---

## 1. LangGraph — the orchestration layer

### 1.1 StateGraph

`src/graph/build.ts` constructs a `StateGraph` — a directed graph where every node is an async function that reads the shared state and returns a **partial update**:

```
StateGraph(TradingState)
  .addNode("analystAgent",   instrumentNode("analyst", analystNode))
  .addNode("sentimentAgent", instrumentNode("sentiment", sentimentNode))
  .addNode("riskGuardAgent", instrumentNode("risk_guard", riskGuardNode))
  .addNode("executorAgent",  instrumentNode("executor", executorNode))
```

Execution flows sequentially:

```
START → analystAgent → sentimentAgent → riskGuardAgent
                                          ├─ approve → executorAgent → END
                                          └─ reject  ──────────────→ END
```

The branch after `riskGuardAgent` is a **conditional edge** — a plain TypeScript function that inspects the state and returns the next node name:

```ts
// src/graph/build.ts:37
function routeAfterRisk(state: TradingStateType): "executorAgent" | "end" {
  return state.riskDecision?.decision === "approve" ? "executorAgent" : "end";
}
```

LangGraph calls this function after `riskGuardAgent` finishes and routes accordingly. No LLM is involved in routing — routing logic stays in typed code.

### 1.2 Typed state with Annotation

`src/graph/state.ts` defines state using LangGraph's `Annotation.Root` API. Each field declares its **reducer** — the merge function applied when a node returns a partial update:

```ts
// Most fields: last-write-wins
onchainData: Annotation<OnchainData | null>({
  reducer: (_old, next) => next,
  default: () => null,
}),

// logs: appending reducer so every node's messages accumulate
logs: Annotation<string[]>({
  reducer: (old, next) => [...(old ?? []), ...next],
  default: () => [],
}),
```

This matters because nodes run concurrently in some graph topologies. Explicit reducers prevent silent overwrites and make merge behaviour auditable.

> **Why not a plain object?** LangGraph merges partial returns from each node. Without reducers, concurrent writes to the same field would be ambiguous. `Annotation` makes the merge contract explicit and type-safe.

### 1.3 MemorySaver — the checkpointer

```ts
// src/graph/build.ts:33
const checkpointer = new MemorySaver();
return graph.compile({ checkpointer });
```

After every node completes, LangGraph serialises the full state snapshot and hands it to the checkpointer. `MemorySaver` stores snapshots in a plain in-memory `Map` keyed by `thread_id`.

Each run gets a unique `thread_id` (generated in `src/api.ts` for library calls or `src/cli.ts` for terminal runs). This enables:

- **Replay**: call `graph.invoke(null, { configurable: { thread_id } })` with the same thread to resume from the last checkpoint.
- **Human-in-the-loop**: add `interruptBefore: ["executorAgent"]` to `graph.compile({...})` to pause execution before the trade and await external approval before resuming.
- **Postgres persistence**: swap `MemorySaver` for `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres` — no other code changes needed.

---

## 2. LangChain Core — the LLM abstraction layer

### 2.1 BaseChatModel and provider switching

`src/config/llm.ts` returns a `BaseChatModel` regardless of which provider is configured:

```ts
export function getLLM(): BaseChatModel {
  if (env.OPENROUTER_API_KEY) return new ChatOpenAI({ ... baseURL: "https://openrouter.ai/api/v1" });
  if (env.ANTHROPIC_API_KEY)  return new ChatAnthropic({ model: "claude-opus-4-7", ... });
  return new ChatOpenAI({ model: "gpt-4o-mini", ... });
}
```

Both `sentimentAgent` and `riskGuardAgent` call `getLLM()` without knowing which provider is active. All provider-specific details (auth, model ID, retry policy) are encapsulated in this one function.

### 2.2 withStructuredOutput — typed LLM responses

Both LLM-using agents bind a **Zod schema** to the model before invoking it:

```ts
// src/agents/sentiment.ts:40
const llm = getLLM().withStructuredOutput(SentimentSchema);
```

```ts
// src/agents/riskGuard.ts:53
const llm = getLLM().withStructuredOutput(DecisionSchema);
```

`withStructuredOutput` wraps the model call in a tool/function-calling request so the provider is forced to emit JSON matching the schema. The return type is statically inferred from the Zod schema — no runtime casting needed:

```ts
// SentimentSchema → { score: number; label: "bullish"|"bearish"|"neutral"; reasoning: string }
const res = await llm.invoke([systemMsg, humanMsg]);
res.score;    // number — TypeScript knows this
res.label;    // "bullish" | "bearish" | "neutral"
```

If the model returns malformed JSON, LangChain retries with an error feedback message before surfacing an exception.

### 2.3 Message types — SystemMessage and HumanMessage

LangChain's message types map directly to the chat roles used by every provider:

```ts
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

await llm.invoke([
  new SystemMessage("You are a crypto sentiment analyst..."),
  new HumanMessage(`Token: ${symbol}\n\nRecent posts:\n${sample}`),
]);
```

`SystemMessage` → `role: "system"` (sets the persona/instructions).  
`HumanMessage` → `role: "user"` (carries the actual data payload).

Using these types rather than raw strings keeps the code provider-agnostic — Anthropic's API uses `system` as a top-level field while OpenAI puts it in the messages array; LangChain handles the translation transparently.

---

## 3. Which agents use LangChain vs. plain code

| Agent | LangChain usage | LLM call? |
|---|---|---|
| `analystAgent` | None — pure `fetch` to Birdeye | No |
| `sentimentAgent` | `getLLM().withStructuredOutput(SentimentSchema)` | Yes — scores posts |
| `riskGuardAgent` | `getLLM().withStructuredOutput(DecisionSchema)` | Yes — borderline cases only; hard rules skip the LLM |
| `executorAgent` | None — pure `fetch` to Jupiter API | No |

The analystAgent is intentionally LLM-free: Birdeye returns structured JSON already, and adding an LLM step would add latency and cost with no benefit. The riskGuardAgent only reaches the LLM if all hard rules pass — the LLM acts as a final arbiter for grey-zone decisions, not a replacement for deterministic policy.

---

## 4. Data flow through the graph

```
graph.invoke({ tokenAddress: "..." }, { configurable: { thread_id } })
  │
  ▼
analystAgent(state)
  reads:  state.tokenAddress
  writes: state.onchainData, state.logs
  tool:   fetch → Birdeye REST API
  │
  ▼
sentimentAgent(state)
  reads:  state.onchainData.symbol, state.tokenAddress
  writes: state.sentiment, state.logs
  tool:   fetch → X API v2
  llm:    getLLM().withStructuredOutput(SentimentSchema).invoke([...])
  │
  ▼
riskGuardAgent(state)
  reads:  state.onchainData, state.sentiment, state.tokenAddress
  writes: state.rugRisk, state.riskDecision, state.logs
  tool:   fetch → RugCheck API
  llm:    getLLM().withStructuredOutput(DecisionSchema).invoke([...])  ← only if hard rules pass
  │
  ├─ decision === "reject" ──────────────────────────────────────────→ END
  │
  ▼
executorAgent(state)
  reads:  state.riskDecision, state.tokenAddress, state.onchainData.symbol
  writes: state.finalAction, state.logs
  tool:   fetch → Jupiter v6 REST API (skipped if DRY_RUN=true)
  │
  ▼
END → graph.invoke returns final TradingStateType snapshot
```

---

## 5. Integration layer

`src/api.ts` is the embeddable boundary around the graph:

- `analyzeToken()` runs the graph in `analysis` mode, so the executor returns a typed skip instead of touching Jupiter.
- `runSoltinelSession()` runs the full graph in `headless` or `cli` mode and returns machine-readable output.
- `executeApprovedTrade()` runs the executor directly from a pre-approved state.

`src/runtime/session.ts` uses `AsyncLocalStorage` to inject host runtime hooks into the agent pipeline without threading callback functions through `TradingState`. This is how the same graph supports both terminal prompts and external orchestrators.

The runtime can subscribe to `onEvent(event)` for structured events such as `session_started`, `agent_started`, `decision_made`, `trade_confirmation_requested`, `trade_executed`, and `session_completed`.

---

## 6. Extending the LangChain layer

**Add a new agent** — create an async function `(state: TradingStateType) => Promise<Partial<TradingStateType>>` and register it with `.addNode()`. Name it with a suffix that doesn't match any state key.

**Switch to streaming** — replace `graph.invoke` with `graph.stream` and iterate over `{ node, state }` chunks to get real-time updates as each agent finishes.

**Add tool use inside an agent** — use `createReactAgent` from `@langchain/langgraph` to give a node its own ReAct loop with bound tools, then wrap that agent in a single StateGraph node.

**Trace with LangSmith** — set `LANGCHAIN_TRACING_V2=true` and `LANGCHAIN_API_KEY` in `.env`. Every `invoke` call, message, and token count will appear in the LangSmith dashboard with no code changes.
