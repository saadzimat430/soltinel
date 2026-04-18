# SolTinel

> **Multi-agent AI that analyses, guards, and executes Solana trades.**  
> Sentiment. Rug risk. On-chain data. All before the swap.

SolTinel is an open-source trading bot for Solana that runs four specialised AI agents in sequence before touching your wallet. It reads X posts, checks rug risk, analyses on-chain signals, and only executes a trade when every check passes.

```
Analyst ──▶ Sentiment ──▶ Risk Guard ──approve──▶ Executor
                                      └──reject──▶ (stops, explains why)
```

**New here?** Read the [Beginner Guide](GUIDE.md) — no prior Solana or AI experience needed.

---

## Why SolTinel?

Most bots execute first and ask questions never. SolTinel flips that:

| What it checks | How |
|---|---|
| Is the token a rug? | RugCheck.xyz risk score + flagged issues |
| What is the market saying? | X posts → LLM sentiment score 0–1 |
| Are the on-chain numbers real? | DexScreener: price, liquidity, volume, buy/sell ratio |
| Does everything pass? | Hard rules first, then LLM arbitration for edge cases |

If any check fails, the trade is rejected with a plain-English reason. No black box.

---

## Agents

| Agent | Does |
|---|---|
| **Analyst** | Fetches price, liquidity, 24h volume, buy/sell ratio via DexScreener (free, no key needed) |
| **Sentiment** | Pulls recent X posts → LLM scores bullish/bearish/neutral with reasoning |
| **Risk Guard** | Combines all signals, applies hard thresholds, asks LLM for grey-zone decisions |
| **Executor** | Jupiter v6 swap — only runs if Risk Guard approves, respects `DRY_RUN` |

---

## Quickstart

```bash
git clone https://github.com/your-username/soltinel
cd soltinel
cp .env.example .env   # fill in your API keys (see GUIDE.md for help)
npm install
npm run dev            # runs in dry-run mode on BONK by default
```

To analyse a specific token:

```bash
npm run dev -- <SOLANA_TOKEN_MINT_ADDRESS>
```

No wallet needed to start — `DRY_RUN=true` by default. You'll see the full agent pipeline run and a detailed rejection or approval reason without any funds at risk.

---

## Configuration (`.env`)

| Variable | Required | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (one of three) | Claude as the LLM brain |
| `OPENAI_API_KEY` | Yes (one of three) | GPT-4o as the LLM brain |
| `OPENROUTER_API_KEY` | Yes (one of three) | Any model via OpenRouter |
| `SOLANA_RPC_URL` | No | Defaults to mainnet-beta public RPC |
| `SOLANA_PRIVATE_KEY` | Only for live trades | Base58 key of your trading wallet |
| `BIRDEYE_API_KEY` | No | Adds holder count to analysis |
| `X_BEARER_TOKEN` | No | Enables real X sentiment (falls back to neutral) |
| `MAX_SLIPPAGE_BPS` | No | Jupiter swap slippage tolerance in basis points (default `100` = 1%) |
| `RUG_SCORE_MAX` | No | Reject if rug risk score exceeds this (0–100, default `40`) |
| `SENTIMENT_MIN` | No | Reject if sentiment score is below this (0–1, default `0.45`) |
| `MIN_LIQUIDITY_USD` | No | Reject if pool liquidity is below this in USD (default `5000`) |
| `MIN_VOLUME_24H_USD` | No | Reject if 24h volume is below this in USD (default `1000`) |
| `MIN_VOL_LIQ_RATIO` | No | Reject if volume/liquidity turnover ratio is below this (default `0.01` = 1%) |
| `MAX_PRICE_CHANGE_24H` | No | Reject if 24h price drop exceeds this % (default `-25`, i.e. reject drops > 25%) |
| `DRY_RUN` | No | `true` by default — set to `false` for live trades |
| `REQUIRE_CONFIRMATION` | No | `true` by default — prompts "y/n" before every real trade; set to `false` for headless/autonomous mode |
| `ALLOW_OVERRIDE` | No | `false` by default — when `true`, shows an override prompt after any rejection so you can proceed at your own risk |
| `MAX_TRADE_USD` | No | Max USDC per trade, defaults to $25 |
| `RUG_SCORE_MAX` | No | Reject if rug score exceeds this (0–100), defaults to 40 |
| `SENTIMENT_MIN` | No | Reject if sentiment below this (0–1), defaults to 0.45 |

---

## Risk policy

Hard rules applied before any LLM call (fail-closed):

- Rug score > `RUG_SCORE_MAX` → **reject**
- RugCheck unreachable → **reject** (never trade blind)
- Sentiment score < `SENTIMENT_MIN` → **reject**
- Liquidity < $5k → **reject**

Borderline cases go to the LLM with full context. Decisions are always typed and logged with a confidence score and plain-English reason.

---

## Extending

**Human-in-the-loop** — add `interruptBefore: ["executorAgent"]` to `graph.compile({...})` to pause before every trade for manual approval.

**Watchlist / cron mode** — wrap `graph.invoke(...)` in a `setInterval` or BullMQ worker over a list of mints for continuous monitoring.

**Persistent state** — swap `MemorySaver` for `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres` to survive restarts.

**More data sources** — add a node for Pump.fun trending, whale wallet tracking, or on-chain order book depth.

---

## Security

- Never commit `.env`. Use a dedicated hot wallet funded only to your risk tolerance.
- Keep `DRY_RUN=true` for at least 10 runs before going live.
- The Risk Guard **fails closed** — if RugCheck is down, it rejects. Do not remove this.
- Consider running the Executor in a separate process so analysis agents never touch the private key.

---

## Tech stack

`TypeScript` · `LangGraph` · `LangChain` · `DexScreener API` · `RugCheck API` · `Jupiter v6 API` · `X API v2` · `@solana/web3.js`

---

## Contributing

PRs welcome. See `CONTRIBUTING.md` for guidelines.  
Questions? Open an issue or find us on Twitter: [@soltinel](#)

---

## License

MIT — free to use, fork, and build on.
