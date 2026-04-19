---
name: soltinel
description: Use when working with the SolTinel Solana trading bot — adding features, debugging agents, modifying risk rules, configuring env vars, extending the pipeline, or understanding how the multi-agent swap workflow operates.
---

# SolTinel

Multi-agent Solana trading bot: **Analyst → Sentiment → RiskGuard → Executor**. Think before you trade — full risk pipeline before any wallet interaction.

## Quick Start

```bash
cp .env.example .env   # fill keys
npm install
npm run dev            # analyze default token (BONK)
npm run dev -- <MINT>  # analyze specific token
soltinel <MINT>        # after npm link (global CLI)
```

## Architecture

```
START → analystAgent → sentimentAgent → riskGuardAgent
                                          ├─ approve → executorAgent → END
                                          └─ reject  ──────────────→ END
```

**State** ([src/graph/state.ts](src/graph/state.ts)): `tokenAddress`, `onchainData`, `sentiment`, `rugRisk`, `riskDecision`, `finalAction`, `logs`

| Agent | File | Does |
|---|---|---|
| Analyst | `src/agents/analyst.ts` | DexScreener + optional Birdeye |
| Sentiment | `src/agents/sentiment.ts` | X search → LLM score (0–1) |
| RiskGuard | `src/agents/riskGuard.ts` | Hard rules + LLM arbitration |
| Executor | `src/agents/executor.ts` | Jupiter v6 swap with confirmation |

**Tools:** `src/tools/` — `solanaKit.ts` (wallet/Jupiter), `birdeye.ts` (DexScreener), `rugcheck.ts`, `xSentiment.ts` (cached), `walletDashboard.ts`

**Config:** `src/config/` — `env.ts` (Zod schema), `setup.ts` (interactive setup), `logger.ts` (ANSI palette `c`), `llm.ts` (OpenRouter > Anthropic > OpenAI), `prompt.ts` (readline singleton)

## Key Environment Variables

**Required for live trading:**
```
SOLANA_PRIVATE_KEY=       # base58 hot wallet key
```

**LLM (first match wins):**
```
OPENROUTER_API_KEY=       # preferred
ANTHROPIC_API_KEY=        # or Claude direct
OPENAI_API_KEY=           # or GPT-4o
```

**Execution mode:**
```
DRY_RUN=true              # default — never signs transactions
REQUIRE_CONFIRMATION=true # prompt before each live trade
ALLOW_OVERRIDE=false      # let user bypass rejections (risky)
SWAP_INPUT_TOKEN=USDC     # USDC | USDT | SOL
MAX_TRADE_AMOUNT=25       # cap in input token units
```

**Risk thresholds (hard rules):**
```
RUG_SCORE_MAX=40          # reject if rug score > this
SENTIMENT_MIN=0.35        # reject if sentiment < this
MIN_LIQUIDITY_USD=5000
MIN_VOLUME_24H_USD=1000
MIN_VOL_LIQ_RATIO=0.01
MAX_PRICE_CHANGE_24H=-25  # reject if 24h drop > 25%
```

**X / Twitter cost controls:**
```
X_ENABLED=true            # false = skip X entirely
X_BEARER_TOKEN=           # required for real sentiment
X_MAX_RESULTS=10          # tweets per search (= credits used)
X_CACHE_TTL_MINUTES=15    # reuse cached results within window
```

**Optional:**
```
BIRDEYE_API_KEY=          # adds holder count
JUPITER_API_KEY=          # higher rate limits
SOLANA_RPC_URL=           # defaults to public mainnet
```

## Risk Guard Logic

1. **Hard rules** checked first (fail-closed) — any failure → reject
2. **LLM arbitration** only if all hard rules pass → `rejectConfidence ≥ 0.80` → reject
3. **Override gate** (if `ALLOW_OVERRIDE=true`) — prompts user after any rejection

RiskGuard fails closed if RugCheck.xyz is unreachable (score set to 100).

## Executor Confirmation Flow

```
DRY_RUN=true  → log only, no signing
DRY_RUN=false → confirmation prompt (y / a <amount> / n)
              → Jupiter /quote → price impact check
              → if impact > MAX_PRICE_IMPACT_PCT: warn + retry at 2× slippage
              → Jupiter /swap → print green success banner
```

## Extending the Pipeline

**Add a new agent:**
1. Create `src/agents/myAgent.ts` — export async function `myAgent(state: TradingState)`
2. Add node in `src/graph/build.ts`
3. Add fields to `TradingState` in `src/graph/state.ts`

**Add a hard rule to RiskGuard:**
- Edit `src/agents/riskGuard.ts` — add check in the hard-rules block before LLM call
- Add corresponding env var to `src/config/env.ts` (Zod schema)

**Add a new tool:**
- Create `src/tools/myTool.ts`
- Import and call from the relevant agent

**Change LLM:** Set `OPENROUTER_MODEL` or switch which key is provided.

## Important Gotchas

- **SOL required for fees** even when swapping USDC/USDT (~0.01 SOL)
- **MemorySaver** is session-scoped — graph history lost on restart
- **ANSI colors:** Import `c` from `src/config/logger.ts` — never redefine locally; respects `NO_COLOR`
- **Keypair/Connection singletons:** Use `getKeypair()` / `getConnection()` from `src/tools/solanaKit.ts`
- **X credits:** Each tweet = 1 read credit. Cache aggressively with `X_CACHE_TTL_MINUTES`
- **Dry run 10 times first** before enabling live trades with real funds
