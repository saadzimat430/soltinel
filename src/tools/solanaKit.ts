/**
 * Solana wallet + Jupiter swap helpers.
 *
 * We call Jupiter's REST API directly instead of wrapping solana-agent-kit,
 * because solana-agent-kit v2 is a workspace monorepo whose sub-packages are
 * not correctly resolvable when installed via npm. The Jupiter API is what the
 * kit used internally anyway.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { env } from "../config/env.js";

export { PublicKey };

// Jupiter deprecated quote-api.jup.ag/v6. Current endpoints:
//   free (rate-limited): https://lite-api.jup.ag/swap/v1
//   paid (JUPITER_API_KEY): https://api.jup.ag/swap/v6
function getJupiterBase(): string {
  return env.JUPITER_API_KEY
    ? "https://api.jup.ag/swap/v6"
    : "https://lite-api.jup.ag/swap/v1";
}

// Jupiter program error code for SlippageToleranceExceeded (0x1789 = 6025)
const SLIPPAGE_ERROR_CODE = 0x1789;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class PriceImpactError extends Error {
  constructor(
    public readonly impactPct: number,
    public readonly thresholdPct: number,
  ) {
    super(`Price impact ${impactPct.toFixed(2)}% exceeds threshold ${thresholdPct}%`);
    this.name = "PriceImpactError";
  }
}

export type SwapErrorType =
  | "slippage"
  | "insufficient_usdc"
  | "insufficient_sol"
  | "blockhash_expired"
  | "no_route"
  | "rate_limited"
  | "network"
  | "simulation"
  | "unknown";

export interface SwapErrorInfo {
  type: SwapErrorType;
  title: string;
  detail: string;
  suggestion: string;
}

export class ClassifiedSwapError extends Error {
  constructor(
    public readonly info: SwapErrorInfo,
    public readonly cause?: unknown,
  ) {
    super(info.title);
    this.name = "ClassifiedSwapError";
  }
}

export function classifySwapError(e: unknown): SwapErrorInfo {
  const msg = e instanceof Error ? e.message : String(e);
  const txLogs: string[] = e instanceof SendTransactionError ? (e.logs ?? []) : [];
  const combined = [msg, ...txLogs].join("\n");
  const low = combined.toLowerCase();

  // Slippage (reached here means retry at 2× also failed)
  if (combined.includes(`0x${SLIPPAGE_ERROR_CODE.toString(16)}`)) {
    const retryBps = Math.min(env.MAX_SLIPPAGE_BPS * 2, 500);
    return {
      type: "slippage",
      title: "Slippage Tolerance Exceeded",
      detail: `Price moved more than ${env.MAX_SLIPPAGE_BPS / 100}% during submission. Auto-retry at ${retryBps / 100}% also failed — market is too volatile right now.`,
      suggestion: `Raise MAX_SLIPPAGE_BPS in .env (currently ${env.MAX_SLIPPAGE_BPS} bps) or try again when trading activity settles.`,
    };
  }

  // Insufficient input token balance: Token program error 0x1 = insufficient funds
  const inputSymbol = getInputToken().symbol;
  const tokenFailed = txLogs.some(
    (l) => l.includes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") && l.includes("failed"),
  );
  if ((tokenFailed && combined.includes("0x1")) || low.includes("insufficient tokens")) {
    return {
      type: "insufficient_usdc",
      title: `Insufficient ${inputSymbol} Balance`,
      detail: `Wallet does not hold enough ${inputSymbol} to cover the ${env.MAX_TRADE_AMOUNT} ${inputSymbol} trade.`,
      suggestion: `Fund your wallet with ${inputSymbol}, or lower MAX_TRADE_AMOUNT in .env.`,
    };
  }

  // Insufficient SOL for fees
  if (
    low.includes("insufficient lamports") ||
    low.includes("insufficient funds for fee") ||
    low.includes("not enough sol")
  ) {
    return {
      type: "insufficient_sol",
      title: "Insufficient SOL for Transaction Fees",
      detail: "Wallet does not have enough SOL to pay for network gas fees.",
      suggestion: "Deposit at least 0.01 SOL into your trading wallet to cover fees.",
    };
  }

  // Blockhash / transaction expired
  if (
    low.includes("blockhash not found") ||
    low.includes("block height exceeded") ||
    low.includes("blockhashnotfound")
  ) {
    return {
      type: "blockhash_expired",
      title: "Transaction Expired (Blockhash Stale)",
      detail: "The transaction was not submitted quickly enough and the blockhash expired.",
      suggestion: "Try again — usually a brief RPC latency spike. If it repeats, switch to a faster RPC endpoint via SOLANA_RPC_URL in .env.",
    };
  }

  // No route found
  if (
    low.includes("no route") ||
    low.includes("route not found") ||
    (msg.includes("quote failed (400)") && low.includes("no route"))
  ) {
    return {
      type: "no_route",
      title: "No Swap Route Found",
      detail: `Jupiter could not find any route to swap ${getInputToken().symbol} into this token.`,
      suggestion: "The token may have no liquidity pool on any supported DEX, or the amount is too large for the available liquidity. Try a smaller MAX_TRADE_AMOUNT in .env.",
    };
  }

  // Rate limited by Jupiter
  if (
    msg.includes("429") ||
    low.includes("rate limit") ||
    low.includes("too many requests")
  ) {
    return {
      type: "rate_limited",
      title: "Jupiter API Rate Limited",
      detail: "Too many requests were sent to the Jupiter API in a short window.",
      suggestion: "Wait 30–60 seconds and try again. For higher limits, set JUPITER_API_KEY in .env.",
    };
  }

  // Network / connectivity
  if (
    low.includes("network error") ||
    low.includes("fetch failed") ||
    low.includes("econnrefused") ||
    low.includes("enotfound") ||
    low.includes("etimedout")
  ) {
    const target = msg.toLowerCase().includes("jupiter") ? "Jupiter API" : "Solana RPC";
    return {
      type: "network",
      title: `Network Error (${target} unreachable)`,
      detail: msg.split("\n")[0],
      suggestion: "Check your internet connection. If the RPC is down, change SOLANA_RPC_URL in .env to a different endpoint (e.g. Helius, QuickNode).",
    };
  }

  // Generic simulation failure — pull the most informative log line
  if (low.includes("simulation failed") || low.includes("transaction simulation failed")) {
    const failLog = txLogs.find(
      (l) => l.toLowerCase().includes("failed") && !l.toLowerCase().includes("invoke"),
    );
    return {
      type: "simulation",
      title: "Transaction Simulation Failed",
      detail: failLog ?? msg.split("\n")[0],
      suggestion: "This can be caused by stale on-chain state or a token with transfer restrictions. Try again in a few seconds. If it persists, the token contract may block programmatic buys.",
    };
  }

  return {
    type: "unknown",
    title: "Unexpected Swap Error",
    detail: msg.split("\n")[0],
    suggestion: "Check the full output above for more context. If this persists, open an issue on GitHub with the error details.",
  };
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input token registry
// ---------------------------------------------------------------------------

export interface InputToken {
  symbol: "USDC" | "USDT" | "SOL";
  mint: string;
  decimals: number;
}

export const INPUT_TOKENS: Record<string, InputToken> = {
  USDC: { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", decimals: 6 },
  USDT: { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", decimals: 6 },
  SOL:  { symbol: "SOL",  mint: "So11111111111111111111111111111111111111112",  decimals: 9 },
};

export function getInputToken(): InputToken {
  return INPUT_TOKENS[env.SWAP_INPUT_TOKEN];
}

/** @deprecated use getInputToken().mint — kept for compatibility with FinalAction logs */
export const USDC_MINT = INPUT_TOKENS.USDC.mint;

let _keypair: Keypair | null = null;
let _connection: Connection | null = null;

export function getKeypair(): Keypair {
  if (_keypair) return _keypair;
  if (!env.SOLANA_PRIVATE_KEY) {
    throw new Error("SOLANA_PRIVATE_KEY not set — cannot execute trades");
  }
  try {
    _keypair = Keypair.fromSecretKey(bs58.decode(env.SOLANA_PRIVATE_KEY));
  } catch {
    throw new Error("SOLANA_PRIVATE_KEY is not valid base58");
  }
  return _keypair;
}

export function getConnection(): Connection {
  if (!_connection) _connection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  return _connection;
}

function isSlippageError(e: unknown): boolean {
  const hex = `0x${SLIPPAGE_ERROR_CODE.toString(16)}`;
  if (e instanceof SendTransactionError) {
    return (
      (e.message ?? "").includes(hex) ||
      (e.logs ?? []).some((l) => l.includes(hex))
    );
  }
  return e instanceof Error && e.message.includes(hex);
}

export interface SwapResult {
  signature: string;
  slippageBpsUsed: number;
  priceImpactPct: number;
}

/**
 * Executes a Jupiter swap: sells `amount` of the configured SWAP_INPUT_TOKEN for `outputMint`.
 *
 * - On SlippageToleranceExceeded, retries once with 2× slippage before failing.
 * - All other errors are classified and thrown as ClassifiedSwapError so the
 *   executor can display a human-readable explanation.
 *
 * @param outputMint        - Solana mint address of the token to buy
 * @param amount            - Amount of input token to spend (human units, e.g. 25 USDC or 0.15 SOL)
 * @param slippageBps       - Slippage tolerance in basis points (default 100 = 1%)
 * @param bypassImpactCheck - Skip MAX_PRICE_IMPACT_PCT gate (user already confirmed)
 */
export async function jupiterSwap(
  outputMint: string,
  amount: number,
  slippageBps = 100,
  bypassImpactCheck = false,
): Promise<SwapResult> {
  try {
    try {
      return await attemptSwap(outputMint, amount, slippageBps, bypassImpactCheck);
    } catch (e) {
      if (e instanceof PriceImpactError) throw e;
      if (!isSlippageError(e)) throw e;

      // Retry once with 2× slippage (capped at 500 bps = 5%)
      const retryBps = Math.min(slippageBps * 2, 500);
      console.warn(`[executor] Slippage exceeded at ${slippageBps} bps — retrying with ${retryBps} bps`);
      return await attemptSwap(outputMint, amount, retryBps, bypassImpactCheck);
    }
  } catch (e) {
    // Pass through typed errors as-is
    if (e instanceof PriceImpactError) throw e;
    if (e instanceof ClassifiedSwapError) throw e;
    // Classify everything else
    throw new ClassifiedSwapError(classifySwapError(e), e);
  }
}

async function attemptSwap(
  outputMint: string,
  amount: number,
  slippageBps: number,
  bypassImpactCheck: boolean,
): Promise<SwapResult> {
  const keypair = getKeypair();
  const connection = getConnection();
  const inputToken = getInputToken();
  const amountAtomic = Math.floor(amount * Math.pow(10, inputToken.decimals));
  const jupBase = getJupiterBase();
  const authHeader: Record<string, string> = env.JUPITER_API_KEY
    ? { Authorization: `Bearer ${env.JUPITER_API_KEY}` }
    : {};

  // 1. Get quote
  const quoteUrl =
    `${jupBase}/quote` +
    `?inputMint=${inputToken.mint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amountAtomic}` +
    `&slippageBps=${slippageBps}` +
    `&onlyDirectRoutes=false`;

  let quoteRes: Response;
  try {
    quoteRes = await fetch(quoteUrl, { headers: authHeader });
  } catch (cause) {
    throw new Error(`Jupiter quote network error (${jupBase}): ${(cause as Error).message}`);
  }
  if (!quoteRes.ok) {
    const text = await quoteRes.text();
    throw new Error(`Jupiter quote failed (${quoteRes.status}): ${text}`);
  }
  const quoteData = await quoteRes.json() as Record<string, unknown>;

  // Price impact check — throw before signing so the executor can prompt the user
  const priceImpactPct = parseFloat((quoteData.priceImpactPct as string) ?? "0");
  if (!bypassImpactCheck && priceImpactPct > env.MAX_PRICE_IMPACT_PCT) {
    throw new PriceImpactError(priceImpactPct, env.MAX_PRICE_IMPACT_PCT);
  }

  // 2. Get swap transaction
  let swapRes: Response;
  try {
    swapRes = await fetch(`${jupBase}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });
  } catch (cause) {
    throw new Error(`Jupiter swap network error: ${(cause as Error).message}`);
  }
  if (!swapRes.ok) {
    const text = await swapRes.text();
    throw new Error(`Jupiter swap build failed (${swapRes.status}): ${text}`);
  }
  const { swapTransaction } = (await swapRes.json()) as { swapTransaction: string };

  // 3. Deserialize, sign, and send
  const txBuf = Buffer.from(swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);

  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(signature, "confirmed");
  return { signature, slippageBpsUsed: slippageBps, priceImpactPct };
}
