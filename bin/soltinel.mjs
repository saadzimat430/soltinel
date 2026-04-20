#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const { version } = createRequire(import.meta.url)("../package.json");

const args = process.argv.slice(2);
const flag = args[0];

const NO_COLOR = process.env.NO_COLOR != null && process.env.NO_COLOR !== "0";
const b  = (s) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`;
const cy = (s) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`;
const ye = (s) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`;
const di = (s) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`;

if (flag === "--help" || flag === "-h") {
  console.log(`
${cy(b("soltinel"))} ${di(`v${version}`)}  —  Multi-agent Solana trading bot

${b("USAGE")}
  soltinel [OPTIONS] [TOKEN_MINT]

${b("ARGUMENTS")}
  TOKEN_MINT   Solana token mint address to analyze
               ${di("Default: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 (BONK)")}

${b("OPTIONS")}
  ${ye("-h, --help")}       Show this help message
  ${ye("-v, --version")}    Print version number

${b("ENVIRONMENT")}
  Copy ${di(".env.example")} → ${di(".env")} in your working directory and fill in the keys.

  ${b("Required")}
    SOLANA_PRIVATE_KEY      Base58-encoded hot wallet private key (It is recommended not to use your main wallet)
    OPENROUTER_API_KEY      LLM provider (or ANTHROPIC_API_KEY / OPENAI_API_KEY)

  ${b("Execution")}
    DRY_RUN=true            Never sign transactions ${di("(default: true)")}
    SWAP_INPUT_TOKEN=USDC   Input token: USDC | USDT | SOL
    MAX_TRADE_AMOUNT=25     Cap per trade in input token units
    REQUIRE_CONFIRMATION    Prompt before each live trade

  ${b("Risk thresholds")}
    RUG_SCORE_MAX=40        Reject if rug score exceeds this ${di("(0–100)")}
    SENTIMENT_MIN=0.35      Reject if sentiment score below this ${di("(0–1)")}
    MIN_LIQUIDITY_USD=5000  Minimum pool liquidity in USD
    MIN_VOLUME_24H_USD=1000 Minimum 24 h volume in USD
    MAX_PRICE_CHANGE_24H=-25  Reject if 24 h price drop exceeds 25 %

  ${b("X / Twitter")}
    X_ENABLED=true          Set false to skip X sentiment entirely
    X_BEARER_TOKEN          Required for live X sentiment data
    X_CACHE_TTL_MINUTES=15  Reuse cached results within this window
    X_MAX_RESULTS=10        Tweets fetched per search ${di("(= API credits used)")}

${b("EXAMPLES")}
  ${di("# Analyze BONK (default token)")}
  npx soltinel

  ${di("# Analyze a specific token")}
  npx soltinel EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

  ${di("# Live mode (disable dry-run)")}
  DRY_RUN=false npx soltinel <TOKEN_MINT>

${b("PIPELINE")}
  analystAgent → sentimentAgent → riskGuardAgent → executorAgent
  Hard rules checked first (fail-closed). LLM arbitration only if all pass.

${b("MORE")}
  https://github.com/saadzimat430/soltinel#readme
`);
  process.exit(0);
}

if (flag === "--version" || flag === "-v") {
  console.log(`soltinel v${version}`);
  process.exit(0);
}

const entry = path.resolve(root, "dist", "index.js");

const child = spawn(process.execPath, [entry, ...args], {
  stdio: "inherit",
  cwd: process.cwd(),
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      `dist/index.js not found.\n` +
      `  If you cloned the repo, run: npm run build\n` +
      `  If you installed via npm/npx, please file a bug.`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
