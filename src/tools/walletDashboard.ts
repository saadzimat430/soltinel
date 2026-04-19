import type { Connection, Keypair } from "@solana/web3.js";
import { env } from "../config/env.js";
import { c } from "../config/logger.js";
import { INPUT_TOKENS, PublicKey, getKeypair, getConnection, type InputToken } from "./solanaKit.js";

interface BalanceResult {
  amount: number | null;
  message?: string;
}

function detectCluster(rpcUrl: string): string {
  const u = rpcUrl.toLowerCase();
  if (u.includes("devnet"))  return "devnet";
  if (u.includes("testnet")) return "testnet";
  if (u.includes("mainnet")) return "mainnet-beta";
  return "custom";
}

async function fetchSol(conn: Connection, owner: PublicKey): Promise<BalanceResult> {
  try {
    return { amount: (await conn.getBalance(owner)) / 1e9 };
  } catch (e) {
    return { amount: null, message: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchSpl(conn: Connection, owner: PublicKey, token: InputToken): Promise<BalanceResult> {
  try {
    const res = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(token.mint) });
    if (res.value.length === 0) return { amount: null, message: "no token account" };
    let total = 0;
    for (const acc of res.value) {
      const info = acc.account.data.parsed?.info as { tokenAmount?: { uiAmount?: number | null } } | undefined;
      const ui = info?.tokenAmount?.uiAmount;
      if (typeof ui === "number") total += ui;
    }
    return { amount: total };
  } catch (e) {
    return { amount: null, message: e instanceof Error ? e.message : String(e) };
  }
}

function formatBalance(symbol: string, b: BalanceResult): string {
  if (b.amount === null) return `${c.yellow}— (${b.message ?? "unavailable"})${c.reset}`;
  const decimals = b.amount === 0 ? 2 : b.amount < 1 ? 6 : 4;
  return `${b.amount.toFixed(decimals)} ${symbol}`;
}

export async function printWalletDashboard(): Promise<void> {
  if (!env.SOLANA_PRIVATE_KEY) {
    console.log(`${c.red}Wallet not configured — SOLANA_PRIVATE_KEY missing.${c.reset}`);
    return;
  }

  let kp: Keypair;
  try {
    kp = getKeypair();
  } catch {
    console.log(`${c.red}SOLANA_PRIVATE_KEY is not valid base58 — cannot derive wallet.${c.reset}`);
    return;
  }

  const conn = getConnection();
  const owner = kp.publicKey;
  const cluster = detectCluster(env.SOLANA_RPC_URL);

  const [sol, usdc, usdt] = await Promise.all([
    fetchSol(conn, owner),
    fetchSpl(conn, owner, INPUT_TOKENS.USDC),
    fetchSpl(conn, owner, INPUT_TOKENS.USDT),
  ]);

  const selected = env.SWAP_INPUT_TOKEN;
  const border  = `${c.cyan}  ══════════════════════════════════════════════════════${c.reset}`;
  const divider = `${c.cyan}  ──────────────────────────────────────────────────────${c.reset}`;
  const row = (label: string, value: string, highlight = false): void => {
    const valColor = highlight ? `${c.brightGreen}${c.bold}` : c.bold;
    console.log(`  ${c.dim}${label.padEnd(12)}${c.reset}${valColor}${value}${c.reset}`);
  };

  console.log("");
  console.log(border);
  console.log(`${c.cyan}${c.bold}  WALLET SUMMARY${c.reset}`);
  console.log(border);
  row("Address:", owner.toBase58());
  row("Cluster:", cluster);
  row("RPC:",     env.SOLANA_RPC_URL);
  console.log(divider);
  row("SOL:",  formatBalance("SOL",  sol),  selected === "SOL");
  row("USDC:", formatBalance("USDC", usdc), selected === "USDC");
  row("USDT:", formatBalance("USDT", usdt), selected === "USDT");
  console.log(divider);
  row("Swap from:", `${selected}  ${c.brightGreen}← active${c.reset}`, true);
  console.log(border);
  console.log("");
}
