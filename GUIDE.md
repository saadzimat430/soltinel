# SolTinel — Beginner's Guide

This guide assumes you've never used a trading bot, never touched LangGraph, and maybe only have a passing familiarity with Solana. By the end you'll have SolTinel running and understand exactly what it's doing.

---

## What is SolTinel?

SolTinel is a program that analyses a Solana token before deciding whether to buy it. Instead of one algorithm making a snap decision, it runs **four specialised AI agents** one after another — each checking a different thing:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Analyst   │───▶│  Sentiment  │───▶│ Risk Guard  │───▶│  Executor   │
│             │    │             │    │             │    │             │
│ Looks up    │    │ Reads recent│    │ Combines    │    │ Buys the    │
│ price,      │    │ X posts and │    │ everything, │    │ token via   │
│ liquidity,  │    │ scores buzz │    │ makes final │    │ Jupiter     │
│ volume      │    │ 0–1         │    │ call        │    │ (if approved│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

If any agent finds a red flag, the process stops and tells you exactly why. Nothing touches your wallet unless every check passes — and even then, only if you've turned off **dry-run mode**.

---

## What you need

Before you start, make sure you have:

- [ ] **Node.js 22+** — [download here](https://nodejs.org). Check your version: `node --version`
- [ ] **An AI API key** — one of:
  - [Anthropic](https://console.anthropic.com) (Claude) — recommended
  - [OpenAI](https://platform.openai.com) (GPT-4o)
  - [OpenRouter](https://openrouter.ai) (routes to any model)
- [ ] **Git** — to clone the repo: `git --version`
- [ ] A terminal (Command Prompt, PowerShell, or Terminal on Mac/Linux)

That's the minimum. Everything else is optional and explained below.

---

## 5-minute setup

### Step 1 — Get the code

**macOS / Linux:**
```bash
git clone https://github.com/saadzimat430/soltinel
cd soltinel
```

**Windows (Command Prompt or PowerShell):**
```cmd
git clone https://github.com/saadzimat430/soltinel
cd soltinel
```

> No Git? Download it at [git-scm.com](https://git-scm.com/downloads), then restart your terminal.

---

### Step 2 — Install dependencies

**macOS / Linux / Windows** (same command on all):
```bash
npm install
```

This downloads all the libraries SolTinel needs. Takes about 30–60 seconds.

> If you see `npm: command not found`, install Node.js 22+ from [nodejs.org](https://nodejs.org) first, then restart your terminal.

---

### Step 3 — Create your config file

**macOS / Linux:**
```bash
cp .env.example .env
```

**Windows (Command Prompt):**
```cmd
copy .env.example .env
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

This creates a `.env` file from the template. Open it with any text editor:
- **Windows**: Notepad, VS Code, or right-click → Open With
- **macOS**: TextEdit, VS Code, or `open -e .env` in Terminal
- **Linux**: `nano .env`, `gedit .env`, or your editor of choice

---

### Step 4 — Add your API key

Find the line that matches the AI service you signed up for and paste your key:

```
# Choose ONE of these three:
ANTHROPIC_API_KEY=sk-ant-your-key-here
# OPENAI_API_KEY=sk-your-key-here
# OPENROUTER_API_KEY=sk-or-your-key-here
```

Remove the `#` at the start of the line for whichever key you're using. That `#` marks a comment — commented lines are ignored.

That's the only required change. Leave everything else as-is for now.

> **Windows tip**: Make sure your editor saves the file as plain text (`.env`), not `.env.txt`. In Notepad, select "All Files" in the Save As dialog to avoid this.

---

### Step 5 — Run it

**macOS / Linux / Windows** (same command on all):
```bash
npm run dev
```

You should see coloured output showing each agent working through BONK (a popular Solana meme coin used as the default demo token). The whole run takes 10–20 seconds.

> **Windows colour issue**: If you see garbled characters instead of colours, run SolTinel in **Windows Terminal** (download from the Microsoft Store) or **VS Code's integrated terminal** — both support ANSI colours. Alternatively, add `NO_COLOR=1` to your `.env` to disable colours entirely.

---

## Understanding the output

Here's what a typical run looks like and what each section means:

```
── ANALYST AGENT ──────────────────────────────────────
[ANALYST]  Token:      Bonk (BONK)
[ANALYST]  Price:      $0.000006
[ANALYST]  Liquidity:  $880K        ← how much money is in the trading pool
[ANALYST]  Volume 24h: $18K         ← how much traded in the last 24 hours
[ANALYST]  Price Δ 24h: -6.38%      ← price change over 24 hours
[ANALYST]  Txns 24h:   400 (42% buys) ← more sells than buys = bearish signal
```

```
── SENTIMENT AGENT ────────────────────────────────────
[SENTIMENT] Score:  0.72  [██████████████░░░░░░]
[SENTIMENT] Label:  BULLISH
[SENTIMENT] Reasoning: Organic posts show excitement about meme season...
```
The score runs from 0 (everyone is bearish/panicking) to 1 (everyone is bullish/excited). 0.5 is neutral.

```
── RISK GUARD AGENT ───────────────────────────────────
[RISK]  Rug score: 7/100   ← low is good. Above 40 = automatic reject
[RISK]  [PASS] Rug score 7 ≤ 40
[RISK]  [PASS] Sentiment 0.72 ≥ 0.45
[RISK]  [PASS] Liquidity $880K ≥ $5K
[RISK]  [PASS] Liquidity $880K ≥ $5K
[REJECT] On-chain signals are thin: volume $18K against $880K liquidity...
```

Even when all hard rules pass, the LLM takes a final look. Here it noticed the volume-to-liquidity ratio was low (only 2% turnover) and rejected.

```
── EXECUTOR AGENT ─────────────────────────────────────
[EXECUTOR] Risk Guard did not approve — no trade will be executed
```

When `DRY_RUN=true` (the default), the executor always explains what it _would_ have done without actually doing it.

---

## Your first real analysis run

Try it on a token you've heard about. Find its mint address on [Solscan](https://solscan.io) or [DexScreener](https://dexscreener.com/solana) — it's the long string of letters/numbers on the token's page.

Then run:

```bash
npm run dev -- PASTE_THE_MINT_ADDRESS_HERE
```

Example with SOL-USDC:
```bash
npm run dev -- So11111111111111111111111111111111111111112
```

---

## Using SolTinel from another agent

If you want to integrate SolTinel into another runtime instead of launching the CLI, import the package API:

```ts
import { analyzeToken, runSoltinelSession } from "soltinel";

const result = await analyzeToken({
  tokenAddress: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  interactionMode: "headless",
  hooks: {
    onEvent(event) {
      console.log(event.type, event.agent, event.data);
    },
  },
});
```

For live orchestration, `runSoltinelSession()` also accepts host approval hooks:

- `confirmTrade(request)` for the executor confirmation gate
- `confirmOverride(request)` for Risk Guard rejection overrides
- `confirmHighPriceImpact(request)` for the Jupiter price-impact warning

This keeps the core trading logic reusable without wiring another system through terminal prompts.

---

## Optional: get better data

SolTinel works out of the box with no extra keys. But these unlock more:

**X / Twitter sentiment** (`X_BEARER_TOKEN`)  
Without this, the Sentiment Agent defaults to neutral (0.5). With it, it reads real posts about the token.  
Get a free bearer token at [developer.twitter.com](https://developer.twitter.com).

> **X API costs money.** The API is pay-per-use: every tweet fetched counts as one read credit. Three settings let you control your bill:
>
> | Setting | Default | What it does |
> |---|---|---|
> | `X_ENABLED` | `true` | Set to `false` to skip X entirely and always use neutral sentiment — zero credits used. |
> | `X_MAX_RESULTS` | `10` | Tweets fetched per search call (min 10, max 100). Each tweet = 1 read credit. Lower = cheaper. |
> | `X_CACHE_TTL_MINUTES` | `15` | Re-runs within this window reuse the cached posts — **0 credits used**. The biggest cost saver if you run the bot frequently. Set to `0` to disable caching. |
>
> With defaults, each unique token costs 10 credits the first run, then **nothing** for the next 15 minutes.

**Holder count** (`BIRDEYE_API_KEY`)  
Adds the number of wallet holders to the analysis. Get a free key at [birdeye.so](https://birdeye.so).

Add them to your `.env`:
```
X_BEARER_TOKEN=your-token-here
X_MAX_RESULTS=10
X_CACHE_TTL_MINUTES=15
BIRDEYE_API_KEY=your-key-here
```

---

## Adjusting the risk settings

All thresholds live in your `.env`. Every one of them is a **hard rule** — a fail means the trade is rejected immediately, before any LLM analysis runs. They also get passed to the LLM so it uses your configured tolerance when making grey-zone decisions.

### Trade size & execution

| Setting | Default | What it means |
|---|---|---|
| `SWAP_INPUT_TOKEN` | `USDC` | Token you spend on every trade. Options: `USDC`, `USDT`, `SOL`. |
| `MAX_TRADE_AMOUNT` | `25` | Max amount of `SWAP_INPUT_TOKEN` to spend per trade. For USDC/USDT this is dollars (e.g. `25` = $25). For SOL this is SOL units (e.g. `0.15` = 0.15 SOL). The confirmation prompt lets you go lower, never higher. |
| `MAX_SLIPPAGE_BPS` | `100` | Jupiter swap slippage tolerance. 100 = 1%, 50 = 0.5%. Lower = less price impact but more failed swaps. |
| `MAX_PRICE_IMPACT_PCT` | `3` | Warn and prompt before executing if Jupiter's route costs more than this % against the mid-market rate. Raise it for very low-liquidity tokens, lower it to be stricter. |

### Risk thresholds

| Setting | Default | What it means | Tighter | Looser |
|---|---|---|---|---|
| `RUG_SCORE_MAX` | `40` | Reject if rug risk score exceeds this (0–100) | `20` | `60` |
| `SENTIMENT_MIN` | `0.45` | Reject if sentiment score is below this (0–1) | `0.60` | `0.30` |
| `MIN_LIQUIDITY_USD` | `5000` | Reject if pool has less than this in USD | `50000` | `1000` |
| `MIN_VOLUME_24H_USD` | `1000` | Reject if 24h trading volume is below this | `10000` | `500` |
| `MIN_VOL_LIQ_RATIO` | `0.01` | Reject if daily volume/liquidity is below this ratio (1% = thin activity) | `0.05` | `0.005` |
| `MAX_PRICE_CHANGE_24H` | `-25` | Reject if 24h price dropped more than this % | `-10` | `-40` |

### Preset risk profiles

Copy one of these blocks into your `.env` as a starting point:

**Conservative** — high bar, fewer trades, lower chance of loss:
```
RUG_SCORE_MAX=20
SENTIMENT_MIN=0.60
MIN_LIQUIDITY_USD=50000
MIN_VOLUME_24H_USD=10000
MIN_VOL_LIQ_RATIO=0.05
MAX_PRICE_CHANGE_24H=-10
MAX_TRADE_AMOUNT=10
MAX_SLIPPAGE_BPS=50
MAX_PRICE_IMPACT_PCT=1
```

**Balanced** (default) — reasonable for most tokens:
```
RUG_SCORE_MAX=40
SENTIMENT_MIN=0.45
MIN_LIQUIDITY_USD=5000
MIN_VOLUME_24H_USD=1000
MIN_VOL_LIQ_RATIO=0.01
MAX_PRICE_CHANGE_24H=-25
MAX_TRADE_AMOUNT=25
MAX_SLIPPAGE_BPS=100
MAX_PRICE_IMPACT_PCT=3
```

**Aggressive** — lower bar, more trades, higher risk:
```
RUG_SCORE_MAX=60
SENTIMENT_MIN=0.35
MIN_LIQUIDITY_USD=1000
MIN_VOLUME_24H_USD=500
MIN_VOL_LIQ_RATIO=0.005
MAX_PRICE_CHANGE_24H=-40
MAX_TRADE_AMOUNT=50
MAX_SLIPPAGE_BPS=200
MAX_PRICE_IMPACT_PCT=5
```

---

## Going live (read this carefully)

### Is this safe to use?

Yes. SolTinel is **100% open-source** (MIT license) — every line of code is public and auditable on GitHub. There is no hidden server, no telemetry, no third-party service that touches your wallet. Your private key never leaves your machine; it is only used to sign transactions locally via `@solana/web3.js` and broadcast directly to the Solana network. If you're unsure, read the code — `src/tools/solanaKit.ts` is where signing happens, and it's 50 lines.

When you're ready to trade real money:

**Step 1** — Create a dedicated wallet for SolTinel. **Do not use your main wallet — this is non-negotiable.** If something goes wrong (a bug, a bad trade, a compromised `.env` file), a dedicated wallet limits the damage to only what you put in it. Your main wallet stays untouched. Use [Phantom](https://phantom.app) or [Solflare](https://solflare.com) to create a new one in under a minute.

**Step 2** — Fund it with only as much USDC as you're comfortable losing. Seriously — start with $10–25.

**Step 3** — Export the wallet's private key (in base58 format) and add it to `.env`:
```
SOLANA_PRIVATE_KEY=your-base58-private-key
```

**Step 4** — Set dry run to false:
```
DRY_RUN=false
```

**Step 5** — Run one more dry-run first on the token you want to trade, just to confirm the analysis looks right. Then run for real.

**Step 6** — When you run live, SolTinel will pause before every trade and show you a confirmation prompt:

```
  ══════════════════════════════════════════════════════
  TRADE CONFIRMATION REQUIRED
  ══════════════════════════════════════════════════════
  Action:    BUY BONK
  Spending:  $25.00 USDC from your wallet
  Token:     DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263
  Rug score: 7/100 (low)
  Sentiment: 0.720 (bullish)
  Reason:    All signals passed
  ══════════════════════════════════════════════════════
  Options:
    y          — confirm and execute
    a <amount> — adjust amount (e.g. "a 10" to buy with $10)
    n          — cancel
  ══════════════════════════════════════════════════════

  >
```

You have three options at the prompt:

| Input | What happens |
|---|---|
| `y` | Confirms and executes the swap immediately |
| `a 10` | Changes the buy amount to $10 (or any number), then re-shows the box |
| `n` or Enter | Cancels — no funds move |

The adjusted amount cannot exceed `MAX_TRADE_USD` from your `.env` — SolTinel caps it automatically as a safety guard.

**Your funds will not move until you type `y`.**

This prompt is on by default (`REQUIRE_CONFIRMATION=true` in `.env`). It can be disabled for headless/server deployments by setting `REQUIRE_CONFIRMATION=false`, but leave it on while you're getting started.

### Overriding a rejection

By default, a rejection is final. If you want the option to proceed anyway after a rejection, set:

```
ALLOW_OVERRIDE=true
```

When enabled, every rejection — whether from a hard rule or the LLM — will pause and show:

```
  ══════════════════════════════════════════════════════
  TRADE REJECTED — OVERRIDE AVAILABLE
  ══════════════════════════════════════════════════════
  Source:  Hard rule violation
  Reason:  rug score 72 > 40
  ──────────────────────────────────────────────────────
  ⚠  WARNING: Overriding means you accept full risk.
  ⚠  This token may be a scam, rug, or highly risky.
  ⚠  You could lose the entire trade amount.
  ══════════════════════════════════════════════════════

  Proceed anyway? [y/N]:
```

You must type the word `override` exactly (not just `y`) to proceed — this is intentional friction to prevent accidental bypasses. Anything else cancels safely.

The override is recorded in the logs with `[USER OVERRIDE]` so you always know a trade was manually forced. `ALLOW_OVERRIDE` defaults to `false` and should stay off unless you know exactly what you're doing.

> **Security reminder**: Never share your `.env` file. Never commit it to Git. The `.gitignore` already excludes it, but double-check before pushing.

---

## What the rejection reasons mean

| Rejection message | What it means | What to do |
|---|---|---|
| `rug score X > 40` | RugCheck flagged this token as high risk | Avoid it |
| `rug risk unknown — failing closed` | RugCheck couldn't be reached | Try again; or investigate manually |
| `sentiment X < 0.45` | X posts are mostly bearish or neutral | Check the token's community yourself |
| `liquidity $X below $5k floor` | Too little money in the pool — easy to manipulate | Avoid very new or tiny tokens |
| `On-chain signals are thin` | LLM saw low volume, bad price trend, or weak buy/sell ratio | Review the numbers it cited |

---

## Common questions

**"Do I need to keep my computer on for it to trade?"**  
Yes — in its current form, SolTinel only runs when you run it manually. Autonomous 24/7 trading requires setting up a server (a cloud VM like a $5/month DigitalOcean droplet works). The code supports it via `setInterval` or a cron job.

**"Can I run it on multiple tokens at once?"**  
Not yet out of the box, but it's easy to add — open an issue or see the `Extending` section in the README.

**"Is it guaranteed to make money?"**  
No. No trading bot is. SolTinel reduces the chance of getting rugged or buying on bad sentiment, but markets are unpredictable. Use `MAX_TRADE_USD` to cap your exposure.

**"Where does my private key go?"**  
It stays in your `.env` file on your own machine. It is never sent anywhere except to sign transactions directly on the Solana network. SolTinel has no server; you're running it locally.

---

## Getting help

- Open a GitHub issue for bugs or feature requests
- Twitter: (coming soon)
- Check `docs/langchain-architecture.md` if you want to understand the AI internals

---

*Built with LangGraph · DexScreener · RugCheck · Jupiter · Solana*
