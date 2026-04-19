/**
 * Minimal structured logger. Uses ANSI colour codes — works in any modern
 * terminal. Set NO_COLOR=1 to disable colours (e.g. in CI).
 */

const NO_COLOR = process.env.NO_COLOR === "1";

export const c = {
  reset:       NO_COLOR ? "" : "\x1b[0m",
  bold:        NO_COLOR ? "" : "\x1b[1m",
  dim:         NO_COLOR ? "" : "\x1b[2m",
  cyan:        NO_COLOR ? "" : "\x1b[36m",
  yellow:      NO_COLOR ? "" : "\x1b[33m",
  green:       NO_COLOR ? "" : "\x1b[32m",
  brightGreen: NO_COLOR ? "" : "\x1b[92m",
  red:         NO_COLOR ? "" : "\x1b[31m",
  magenta:     NO_COLOR ? "" : "\x1b[35m",
  blue:        NO_COLOR ? "" : "\x1b[34m",
  white:       NO_COLOR ? "" : "\x1b[37m",
};

function ts(): string {
  return `${c.dim}${new Date().toISOString().slice(11, 23)}${c.reset}`;
}

function tag(label: string, colour: string): string {
  return `${colour}${c.bold}[${label}]${c.reset}`;
}

export const log = {
  graph: (msg: string) =>
    console.log(`${ts()} ${tag("GRAPH", c.white)}  ${c.white}${msg}${c.reset}`),

  analyst: (msg: string) =>
    console.log(`${ts()} ${tag("ANALYST", c.cyan)}   ${msg}`),

  sentiment: (msg: string) =>
    console.log(`${ts()} ${tag("SENTIMENT", c.magenta)} ${msg}`),

  risk: (msg: string) =>
    console.log(`${ts()} ${tag("RISK", c.yellow)}    ${msg}`),

  executor: (msg: string) =>
    console.log(`${ts()} ${tag("EXECUTOR", c.blue)}  ${msg}`),

  approve: (msg: string) =>
    console.log(`${ts()} ${tag("APPROVE", c.green)}   ${c.green}${c.bold}${msg}${c.reset}`),

  reject: (msg: string) =>
    console.log(`${ts()} ${tag("REJECT", c.red)}    ${c.red}${c.bold}${msg}${c.reset}`),

  warn: (msg: string) =>
    console.log(`${ts()} ${tag("WARN", c.yellow)}    ${c.yellow}${msg}${c.reset}`),

  divider: (label: string) => {
    const line = "─".repeat(Math.max(0, 60 - label.length - 2));
    console.log(`\n${c.dim}── ${label} ${line}${c.reset}`);
  },
};

/** Formats a number to a short human-readable string: 1234567 → "$1.23M" */
export function fmtUsd(n: number | null | undefined, prefix = "$"): string {
  if (n == null) return "?";
  if (Math.abs(n) >= 1e9) return `${prefix}${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${prefix}${(n / 1e3).toFixed(2)}K`;
  return `${prefix}${n.toFixed(4)}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "?%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export interface SwapSuccessDetails {
  symbol: string;
  outputMint: string;
  spent: string;          // e.g. "$25.00 USDC" or "0.15 SOL"
  priceImpactPct: number;
  slippageBpsUsed: number;
  slippageBpsConfig: number;
  signature: string;
}

export function printSwapSuccess(d: SwapSuccessDetails): void {
  const g  = c.brightGreen;
  const gb = `${c.brightGreen}${c.bold}`;
  const r  = c.reset;
  const border  = `${g}  ══════════════════════════════════════════════════════${r}`;
  const divider = `${g}  ──────────────────────────────────────────────────────${r}`;
  const row = (label: string, value: string) =>
    console.log(`${g}  ${c.bold}${label.padEnd(16)}${r}${gb}${value}${r}`);

  const slippageNote = d.slippageBpsUsed > d.slippageBpsConfig
    ? ` (auto-widened from ${d.slippageBpsConfig} bps)`
    : "";
  const shortSig = `${d.signature.slice(0, 8)}...${d.signature.slice(-8)}`;

  console.log("");
  console.log(border);
  console.log(`${gb}  ✓  SWAP EXECUTED SUCCESSFULLY${r}`);
  console.log(border);
  row("Token:",         `${d.symbol}  (${d.outputMint.slice(0, 8)}...${d.outputMint.slice(-6)})`);
  row("Spent:",         d.spent);
  row("Price impact:",  `${d.priceImpactPct.toFixed(2)}%`);
  row("Slippage used:", `${d.slippageBpsUsed} bps${slippageNote}`);
  console.log(divider);
  row("Signature:",     shortSig);
  row("Explorer:",      `https://solscan.io/tx/${d.signature}`);
  console.log(border);
  console.log("");
}
