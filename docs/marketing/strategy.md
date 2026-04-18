# SolTinel — Marketing Strategy

**Model**: Open-source core, hosted SaaS (no-setup tier)  
**Audiences**: Crypto degens + Developers/builders  
**Launch**: Coordinated multi-channel drop

---

## Positioning

**Core message**: *"The only Solana trading bot that thinks before it trades."*

**Tagline**: *"Multi-agent AI that analyses, guards, and executes Solana trades."*

**Sub-tagline**: *"Sentiment. Rug risk. On-chain data. All before the swap."*

### Value propositions by audience

| Audience | Primary hook | Proof point |
|---|---|---|
| Crypto degens | "Never get rugged again" | Risk Guard + RugCheck pipeline with plain-English rejection reasons |
| Developers | "Production-ready multi-agent trading infra, fork it today" | LangGraph + Jupiter + typed state, MIT licensed |

---

## Business model

**Free forever**: The open-source repo. Everything in it. No feature limits.

**SolTinel Cloud** (hosted SaaS — future):
- No setup, no server, no private key handling on your machine
- Web dashboard with run history, rejection logs, portfolio tracking
- Watchlist monitoring — set tokens to watch, get notified when conditions align
- Pricing idea: $0 (3 runs/day) → $19/mo (unlimited runs) → $49/mo (autonomous mode + multi-wallet)

The open-source repo is the top-of-funnel for the hosted tier. Developers self-host; non-technical users upgrade to Cloud.

---

## Launch plan

### Pre-launch (2 weeks before)

- [ ] Polish the GitHub repo: clean README, GUIDE.md, CONTRIBUTING.md, good issues as "good first issue"
- [ ] Record a 60-second terminal demo video — show a real token run with the coloured logs
- [ ] Create a Product Hunt draft (do not submit yet)
- [ ] Identify a Product Hunt hunter with Solana/AI following — reach out for co-hunting
- [ ] Set up a Twitter/X account `@soltinel`
- [ ] Write the launch thread in draft (see template below)
- [ ] Join target communities (Solana Discord, LangChain Discord, r/solana) and become a participant — don't lurk until launch day

### Day 1 — GitHub + Twitter + Communities

**GitHub**:
- Make repo public
- Add topics: `solana` `ai-agent` `langgraph` `trading-bot` `defi` `typescript` `jupiter` `open-source` `rug-detection` `sentiment-analysis`
- Star the repo yourself and ask 5 developer friends to star it in the first hour (social proof for algo)

**Twitter/X launch thread** (template):
```
🧵 Introducing SolTinel — a Solana trading bot that thinks before it trades.

Most bots buy first, ask questions never.
SolTinel runs 4 AI agents before touching your wallet:

1/ Analyst — price, liquidity, volume, buy/sell ratio
2/ Sentiment — reads X posts, scores bullish/bearish
3/ Risk Guard — rug check + LLM decision with reasons
4/ Executor — only fires if everything passes

[attach: terminal screenshot showing the coloured agent logs]

It's fully open source. MIT license. No black box.

👇 Here's how it works...
```
Follow with one tweet per agent, ending with the GitHub link.

**Communities to post Day 1**:
- r/solana — "Show HN" style post, lead with the demo GIF
- r/LangChain — focus on the multi-agent architecture angle
- Solana Discord `#dev-tools` and `#trading`
- LangChain Discord `#show-and-tell`
- Solana Stack Exchange (post a "how does this compare to X" question to drive discovery)

### Day 3 — Product Hunt

Submit Tuesday–Thursday (highest traffic days). Avoid Monday and Friday.

**PH listing essentials**:
- Tagline: `Multi-agent AI that analyses, guards, and executes Solana trades`
- First comment: founder story — why you built it, what problem you had
- Gallery: terminal GIF (agent by agent), architecture diagram, rejection example screenshot
- Ask your network to upvote in the first 2 hours — PH algo weights early velocity

### Days 4–30 — Build in public

Weekly content rhythm on Twitter/X:

| Week | Content |
|---|---|
| 1 | Architecture deep-dive thread — one tweet per agent with diagram |
| 2 | "SolTinel caught a rug" — real token the Risk Guard rejected, show the reasons |
| 3 | Sentiment vs price thread — show 5 tokens where sentiment predicted price movement |
| 4 | "How to run your first analysis in 5 minutes" — tutorial thread targeting beginners |
| Ongoing | Reply to every Solana trading discussion with helpful context (not self-promo) |

---

## SEO / discoverability

Target keywords for README and any future landing page:
- "Solana trading bot open source"
- "AI trading bot Solana"
- "rug check trading bot"
- "LangGraph trading bot"
- "Jupiter swap bot"
- "Solana sentiment analysis"

GitHub topics are indexed by Google — keep them comprehensive.

---

## Metrics to track

| Metric | Target (30 days post-launch) |
|---|---|
| GitHub stars | 500+ |
| GitHub forks | 50+ |
| Twitter followers | 300+ |
| Product Hunt upvotes | 200+ |
| Discord/community members | 100+ |

---

## Future growth levers

**Integrations content**: Write short posts for every integration (RugCheck, Jupiter, DexScreener, LangGraph). Each one is a separate SEO target and earns backlinks from those communities.

**"Caught a rug" content series**: Every time the Risk Guard correctly blocks a rugged token, post about it. This is the strongest proof-of-value content and will spread organically in Solana communities.

**Developer tutorials**: "Build your own trading agent with LangGraph" — use SolTinel as the example. Post on Dev.to, Hashnode, and Medium for additional reach.

**Influencer collab**: Reach out to mid-size Solana Twitter accounts (5k–50k followers) for a "I tried SolTinel on my watchlist" post. Offer early cloud access in exchange.
