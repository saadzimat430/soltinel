import { promises as fs } from "node:fs";
import path from "node:path";
import { ask } from "./prompt.js";
import { c } from "./logger.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");

interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  default?: string;
}

const REQUIRED_CORE: FieldSpec[] = [
  { key: "SOLANA_RPC_URL",     label: "Solana RPC endpoint URL", required: true,  default: "https://api.mainnet-beta.solana.com" },
  { key: "SOLANA_PRIVATE_KEY", label: "Wallet private key (base58)",  required: true  },
];

const LLM_KEYS: FieldSpec[] = [
  { key: "ANTHROPIC_API_KEY",  label: "Anthropic API key",  required: false },
  { key: "OPENAI_API_KEY",     label: "OpenAI API key",     required: false },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API key", required: false },
];

const OPTIONAL: FieldSpec[] = [
  { key: "BIRDEYE_API_KEY", label: "Birdeye API key (recommended for market data)",          required: false },
  { key: "X_BEARER_TOKEN",  label: "X (Twitter) bearer token (recommended for sentiment)",   required: false },
  { key: "JUPITER_API_KEY", label: "Jupiter API key (higher rate limits)",                   required: false },
];

const VALID_TOKENS = ["USDC", "USDT", "SOL"] as const;
const TOKEN_NUM_ALIAS: Record<string, string> = { "1": "USDC", "2": "USDT", "3": "SOL" };

async function readEnvFile(): Promise<{ values: Record<string, string>; raw: string }> {
  let raw = "";
  try {
    raw = await fs.readFile(ENV_PATH, "utf8");
  } catch {
    return { values: {}, raw: "" };
  }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    values[k] = v;
  }
  return { values, raw };
}

async function writeEnvFile(updates: Record<string, string>, originalRaw: string): Promise<void> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of originalRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) { out.push(line); continue; }
    const eq = trimmed.indexOf("=");
    if (eq < 1) { out.push(line); continue; }
    const k = trimmed.slice(0, eq).trim();
    if (Object.prototype.hasOwnProperty.call(updates, k)) {
      out.push(`${k}=${updates[k]}`);
      seen.add(k);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  await fs.writeFile(ENV_PATH, out.join("\n").replace(/\n+$/, "") + "\n", "utf8");
}

function existing(merged: Record<string, string>, key: string): string | undefined {
  return merged[key] || process.env[key];
}

function setField(key: string, val: string, merged: Record<string, string>, updates: Record<string, string>): void {
  merged[key] = val;
  updates[key] = val;
  process.env[key] = val;
}

async function promptField(
  field: FieldSpec,
  merged: Record<string, string>,
  updates: Record<string, string>,
): Promise<void> {
  const optional = !field.required;
  const def = field.default ? ` ${c.dim}[${field.default}]${c.reset}` : "";
  const tail = optional ? ` ${c.dim}(press Enter to skip)${c.reset}` : "";
  const ans = (await ask(`${c.yellow}? ${field.label}${def}${tail}: ${c.reset}`)).trim();
  const val = ans || field.default || "";
  if (!val) {
    if (optional) return;
    throw new Error(`${field.key} is required to continue`);
  }
  setField(field.key, val, merged, updates);
}

export async function runStartupSetup(): Promise<void> {
  const { values: fileEnv, raw: originalRaw } = await readEnvFile();
  const merged: Record<string, string> = { ...fileEnv };
  const updates: Record<string, string> = {};

  console.log(`\n${c.cyan}${c.bold}── Configuration check ──${c.reset}`);

  for (const f of REQUIRED_CORE) {
    if (existing(merged, f.key)) continue;
    await promptField(f, merged, updates);
  }

  const hasLlm = LLM_KEYS.some((f) => existing(merged, f.key));
  if (!hasLlm) {
    console.log(`${c.yellow}? At least one LLM API key is required (Anthropic, OpenAI, or OpenRouter).${c.reset}`);
    for (const f of LLM_KEYS) {
      const ans = (await ask(`  ${f.label} ${c.dim}(Enter to skip)${c.reset}: `)).trim();
      if (ans) { setField(f.key, ans, merged, updates); break; }
    }
    if (!LLM_KEYS.some((f) => existing(merged, f.key))) {
      throw new Error("At least one LLM API key is required to continue");
    }
  }

  for (const f of OPTIONAL) {
    if (existing(merged, f.key)) continue;
    await promptField(f, merged, updates);
  }

  console.log(`\n${c.cyan}${c.bold}── Swap-from token ──${c.reset}`);
  const current = existing(merged, "SWAP_INPUT_TOKEN") ?? "USDC";
  console.log(`  ${c.bold}1)${c.reset} USDC    ${c.bold}2)${c.reset} USDT    ${c.bold}3)${c.reset} SOL`);
  const sel = (await ask(`${c.yellow}? Select swap-from token ${c.dim}[current: ${current}]${c.reset}: `)).trim();
  const upper = sel.toUpperCase();
  const chosen = !sel
    ? current
    : TOKEN_NUM_ALIAS[sel] ?? (VALID_TOKENS.includes(upper as typeof VALID_TOKENS[number]) ? upper : null);
  if (!chosen) throw new Error(`Invalid token selection: "${sel}"`);

  if (chosen !== current || !merged.SWAP_INPUT_TOKEN) {
    setField("SWAP_INPUT_TOKEN", chosen, merged, updates);
  } else {
    process.env.SWAP_INPUT_TOKEN = chosen;
  }
  console.log(`${c.brightGreen}  ✓ Selected: ${chosen}${c.reset}`);

  if (Object.keys(updates).length > 0) {
    await writeEnvFile(updates, originalRaw);
    console.log(`${c.dim}  Saved ${Object.keys(updates).length} value(s) to .env${c.reset}`);
  }
}
