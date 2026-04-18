# Contributing to SolTinel

Thanks for your interest in contributing. SolTinel is an open-source project and community contributions are what make it better.

---

## Ways to contribute

- **Bug reports** — open a GitHub issue with steps to reproduce
- **Feature requests** — open an issue describing the use case (not just the feature)
- **Good first issues** — look for issues tagged `good first issue`
- **New data sources** — add a tool in `src/tools/` (e.g. Pump.fun trending, whale tracking)
- **New agents** — add a node in `src/agents/` and wire it into `src/graph/build.ts`
- **Documentation** — improve `GUIDE.md`, add examples, fix typos

---

## Development setup

```bash
git clone https://github.com/your-username/soltinel
cd soltinel
cp .env.example .env   # fill in at least one LLM API key
npm install
npm run dev            # confirm it runs
npm run typecheck      # confirm no TypeScript errors
```

---

## Making a change

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your change
3. Run `npm run typecheck` — PRs with type errors will not be merged
4. Open a pull request with a short description of what and why

---

## Code style

- TypeScript strict mode — no `any` casts without a comment explaining why
- No comments that describe what the code does — only comments explaining non-obvious *why*
- New agents follow the same signature: `async (state: TradingStateType) => Promise<Partial<TradingStateType>>`
- New tools go in `src/tools/`, new agents in `src/agents/`
- Use the shared `log.*` helpers from `src/config/logger.ts` for console output
