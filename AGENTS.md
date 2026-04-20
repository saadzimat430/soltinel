# AGENTS.md — SolTinel

Multi-agent Solana trading bot. Four sequential AI agents analyse a token and execute a swap only when every check passes. **Think before you trade.**

---

## Project layout

```
src/
  api.ts        programmatic integration facade for external runtimes
  agents/       analyst, sentiment, riskGuard, executor — one file per agent
  cli.ts        terminal entry point
  config/       env (Zod schema), logger (ANSI palette), llm (provider resolution),
                prompt (readline singleton), setup (interactive .env wizard)
  graph/        state.ts (LangGraph Annotation schema), build.ts (topology + routing)
  runtime/      async session context for host hooks, approvals, and events
  tools/        birdeye, rugcheck, solanaKit, walletDashboard, xSentiment
bin/
  soltinel.mjs  CLI entry point (tsx spawner for `npm link`)
```

---

## Running the bot

```bash
npm run dev                    # analyze BONK (default) in dry-run mode
npm run dev -- <MINT>          # analyze a specific token
npm run dev:watch              # auto-reload on file changes
npm run typecheck              # tsc --noEmit (must pass before any commit)
npm run build                  # compile to dist/
soltinel <MINT>                # after npm link — same as npm run dev
```

**Always run `npm run typecheck` after changes.** The project uses strict TypeScript.

---

## Environment variables

All env vars are declared and validated with Zod in `src/config/env.ts`. Unknown keys are silently ignored. Adding a new config option means adding it there first.

### LLM (first match wins: OpenRouter → Anthropic → OpenAI)
| Variable | Notes |
|---|---|
| `OPENROUTER_API_KEY` | Preferred; set `OPENROUTER_MODEL` and `OPENROUTER_BASE_URL` too |
| `ANTHROPIC_API_KEY` | Claude direct |
| `OPENAI_API_KEY` | GPT-4o fallback |

### Solana
| Variable | Default | Notes |
|---|---|---|
| `SOLANA_PRIVATE_KEY` | — | **Required for live trades.** Base58. Use a dedicated hot wallet. |
| `SOLANA_RPC_URL` | mainnet-beta public | Switch to a paid RPC for reliability |

### Execution mode
| Variable | Default | Notes |
|---|---|---|
| `DRY_RUN` | `true` | Never signs transactions. Keep `true` for at least 10 test runs. |
| `REQUIRE_CONFIRMATION` | `true` | Interactive `y/n` before every live trade |
| `ALLOW_OVERRIDE` | `false` | Lets the user bypass Risk Guard rejections. Risky — opt-in only. |
| `SWAP_INPUT_TOKEN` | `USDC` | `USDC` · `USDT` · `SOL` |
| `MAX_TRADE_AMOUNT` | `25` | Cap per trade in input-token units |
| `MAX_SLIPPAGE_BPS` | `100` | Jupiter slippage (100 = 1%) |
| `MAX_PRICE_IMPACT_PCT` | `3` | Warn + prompt if Jupiter price impact exceeds this |

### Risk thresholds (hard rules — fail-closed)
| Variable | Default |
|---|---|
| `RUG_SCORE_MAX` | `40` |
| `SENTIMENT_MIN` | `0.35` |
| `MIN_LIQUIDITY_USD` | `5000` |
| `MIN_VOLUME_24H_USD` | `1000` |
| `MIN_VOL_LIQ_RATIO` | `0.01` |
| `MAX_PRICE_CHANGE_24H` | `-25` |

### X / Twitter
| Variable | Default | Notes |
|---|---|---|
| `X_BEARER_TOKEN` | — | Required for real sentiment; falls back to neutral 0.5 if absent |
| `X_ENABLED` | `true` | Set `false` to skip X entirely (saves API credits) |
| `X_MAX_RESULTS` | `10` | Tweets per search — each tweet = 1 read credit |
| `X_CACHE_TTL_MINUTES` | `15` | Reuse cached results within this window |

### Optional data sources
| Variable | Notes |
|---|---|
| `BIRDEYE_API_KEY` | Adds holder count to analyst output |
| `JUPITER_API_KEY` | Unlocks higher Jupiter API rate limits |

---

## Agent pipeline

```
START → analystAgent → sentimentAgent → riskGuardAgent
                                          ├─ approve → executorAgent → END
                                          └─ reject  ──────────────→ END
```

### State (`src/graph/state.ts`)

LangGraph `Annotation` object. Fields flow read-only through the pipeline — each agent returns a partial update.

| Field | Type | Set by |
|---|---|---|
| `tokenAddress` | `string` | caller |
| `onchainData` | `OnchainData \| null` | Analyst |
| `sentiment` | `SentimentResult \| null` | Sentiment |
| `rugRisk` | `RugRisk \| null` | RiskGuard |
| `riskDecision` | `{ decision, reason, rejectConfidence } \| null` | RiskGuard |
| `finalAction` | `{ type, inputMint, outputMint, amountUsd, txSignature, dryRun, note } \| null` | Executor |
| `logs` | `string[]` | all agents (accumulated) |

### Risk Guard logic

1. Hard rules evaluated in order (fail-closed). Any failure → reject immediately.
2. RugCheck unreachable → score forced to 100 → automatic reject. **Never remove this.**
3. If all hard rules pass → LLM arbitration → `rejectConfidence ≥ 0.80` → reject.
4. If `ALLOW_OVERRIDE=true`, a manual override prompt appears after any rejection.

### Executor confirmation flow

```
DRY_RUN=true  ──▶ log only, no signing, returns dryRun:true
analysis mode ──▶ returns note="analysis-only mode — execution skipped"
DRY_RUN=false ──▶ confirmation prompt  (y | a <amount> | n)
                ──▶ Jupiter /quote
                ──▶ price impact check (warn + optional 2× slippage retry)
                ──▶ Jupiter /swap
                ──▶ green success banner with Solscan link
```

### Integration surface

`src/api.ts` exposes:

- `analyzeToken(input)` — run Analyst → Sentiment → Risk Guard in analysis-only mode
- `runSoltinelSession(input)` — run the full graph with host-controlled approvals/events
- `executeApprovedTrade(input)` — execute only the Executor stage from a pre-approved state

Runtime hosts can inject:

- `onEvent(event)` for structured progress streaming
- `confirmTrade(request)` instead of readline confirmation
- `confirmOverride(request)` instead of the Risk Guard override prompt
- `confirmHighPriceImpact(request)` instead of the price-impact prompt

---

## Code conventions

### Imports and singletons

- **ANSI colors:** always import `c` from `src/config/logger.ts`. Never define a local color palette. Respects `NO_COLOR`.
- **Wallet / RPC:** use `getKeypair()` and `getConnection()` from `src/tools/solanaKit.ts`. Both are singletons — do not instantiate `Keypair` or `Connection` elsewhere.
- **Readline:** use the singleton from `src/config/prompt.ts`. Never open a second `readline.createInterface`.
- **Integration hooks:** if work must interact with another runtime, thread it through `src/runtime/session.ts` rather than adding direct prompts/network callbacks to agents.
- **LLM:** call `resolveLlm()` from `src/config/llm.ts` to get the configured model. Do not construct `ChatAnthropic` / `ChatOpenAI` directly.
- **Env vars:** access via the Zod-parsed object exported from `src/config/env.ts`, not `process.env` directly.

### TypeScript

- `strict: true` — no `any`, no implicit returns, no unused variables.
- ESM only (`"type": "module"`). Use `.js` extensions in imports when referencing compiled output.
- All LLM calls run at `temperature: 0` (deterministic).
- Run `npm run typecheck` before declaring work done. Zero errors required.

### Logging

Use the tagged helpers from `src/config/logger.ts`:

```ts
log.analyst("fetched pair data")   // [ANALYST] …
log.sentiment("score: 0.72")       // [SENTIMENT] …
log.risk("hard rule failed")       // [RISK] …
log.executor("submitting swap")    // [EXECUTOR] …
log.warn("RugCheck timeout")       // [WARN] …
log.approve("trade approved")      // [APPROVE] …
log.reject("rug score too high")   // [REJECT] …
```

Never use `console.log` / `console.warn` in agent or tool code — use `log.*`.

---

## Extending the project

### Add a new agent

1. Create `src/agents/myAgent.ts`, export `async function myAgent(state: TradingState): Promise<Partial<TradingState>>`
2. Register the node in `src/graph/build.ts`
3. Add any new state fields to `TradingState` in `src/graph/state.ts`

### Add a hard rule to Risk Guard

1. Edit `src/agents/riskGuard.ts` — insert check in the hard-rules block before the LLM call
2. Add the corresponding env var to `src/config/env.ts` (Zod schema + default)

### Add a new data source

1. Create `src/tools/myTool.ts`
2. Import and call from the relevant agent
3. Add any API keys to `src/config/env.ts`

### Persistent graph state

Swap `MemorySaver` for `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres`. The thread ID is already generated per run.

---

## Security rules (non-negotiable)

- **Never commit `.env`.** It is in `.gitignore`. Keep it there.
- **Use a dedicated hot wallet** funded only to your stated risk tolerance. Never use a cold or primary wallet.
- **`DRY_RUN=true` by default.** Run at least 10 dry-run cycles before enabling live trades.
- **Fail-closed Risk Guard.** If RugCheck is unreachable the bot rejects. Do not remove or weaken this behaviour.
- **`ALLOW_OVERRIDE=false` by default.** Only enable if the user explicitly opts in; document why.
- **SOL for fees.** Live trades require ~0.01 SOL for network fees even when the input token is USDC/USDT. Warn users who have zero SOL.
