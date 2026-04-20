import { promises as fs } from "node:fs";
import path from "node:path";
import { ask, askPassword } from "./prompt.js";
import { c } from "./logger.js";
import { keystoreExists, encryptKey, decryptKey, KEYSTORE_PATH } from "./keystore.js";

const ENV_PATH = path.resolve(process.cwd(), ".env");

interface FieldSpec {
  key: string;
  label: string;
  required: boolean;
  default?: string;
}

const REQUIRED_CORE: FieldSpec[] = [
  { key: "SOLANA_RPC_URL", label: "Solana RPC endpoint URL", required: true, default: "https://api.mainnet-beta.solana.com" },
  // SOLANA_PRIVATE_KEY is handled exclusively by the keystore section below.
];

const LLM_KEYS: FieldSpec[] = [
  { key: "ANTHROPIC_API_KEY",  label: "Anthropic API key",  required: false },
  { key: "OPENAI_API_KEY",     label: "OpenAI API key",     required: false },
  { key: "OPENROUTER_API_KEY", label: "OpenRouter API key", required: false },
];

const OPTIONAL: FieldSpec[] = [
  { key: "BIRDEYE_API_KEY", label: "Birdeye API key (recommended for market data)",        required: false },
  { key: "X_BEARER_TOKEN",  label: "X (Twitter) bearer token (recommended for sentiment)", required: false },
  { key: "JUPITER_API_KEY", label: "Jupiter API key (higher rate limits)",                 required: false },
];

const VALID_TOKENS = ["USDC", "USDT", "SOL"] as const;
const TOKEN_NUM_ALIAS: Record<string, string> = { "1": "USDC", "2": "USDT", "3": "SOL" };

async function readEnvFile(): Promise<{ values: Record<string, string>; raw: string }> {
  let raw = "";
  try { raw = await fs.readFile(ENV_PATH, "utf8"); } catch { /* no .env yet */ }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    values[k] = v;
  }
  return { values, raw };
}

async function writeEnvFile(
  updates: Record<string, string>,
  originalRaw: string,
  remove: Set<string> = new Set(),
): Promise<void> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of originalRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) { out.push(line); continue; }
    const eq = trimmed.indexOf("=");
    if (eq < 1) { out.push(line); continue; }
    const k = trimmed.slice(0, eq).trim();
    if (remove.has(k)) continue; // strip this key from the file
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
  const def  = field.default ? ` ${c.dim}[${field.default}]${c.reset}` : "";
  const tail = optional ? ` ${c.dim}(press Enter to skip)${c.reset}` : "";
  const ans  = (await ask(`${c.yellow}? ${field.label}${def}${tail}: ${c.reset}`)).trim();
  const val  = ans || field.default || "";
  if (!val) {
    if (optional) return;
    throw new Error(`${field.key} is required to continue`);
  }
  setField(field.key, val, merged, updates);
}

// ── Keystore unlock / first-time setup ──────────────────────────────────────

async function unlockWallet(
  fileEnv: Record<string, string>,
  removes: Set<string>,
): Promise<void> {
  console.log(`\n${c.cyan}${c.bold}── Wallet unlock ──${c.reset}`);

  // CI / automation: key injected via environment — skip all prompts.
  if (process.env.SOLANA_PRIVATE_KEY) {
    console.log(`${c.dim}  Using SOLANA_PRIVATE_KEY from environment (CI mode)${c.reset}`);
    return;
  }

  // ── Existing keystore: prompt for master password ────────────────────────
  if (keystoreExists()) {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const password = await askPassword(`${c.yellow}🔐 Master password: ${c.reset}`);
      try {
        const key = decryptKey(password);
        process.env.SOLANA_PRIVATE_KEY = key;
        console.log(`${c.brightGreen}  ✓ Wallet unlocked${c.reset}`);
        return;
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          console.log(`${c.red}  ✗ Wrong password — ${MAX_ATTEMPTS - attempt} attempt(s) left${c.reset}`);
        } else {
          throw new Error("Too many failed attempts — aborting.");
        }
      }
    }
    return;
  }

  // ── No keystore yet: import key and create one ───────────────────────────
  let privateKey: string;

  if (fileEnv.SOLANA_PRIVATE_KEY) {
    // Key found in plain .env — offer to migrate to encrypted keystore.
    console.log(`${c.yellow}  ⚠  SOLANA_PRIVATE_KEY found in plain .env — this is insecure.${c.reset}`);
    const ans = (await ask(`${c.yellow}  Encrypt it in a keystore and remove from .env? ${c.dim}[Y/n]${c.reset}: `)).trim();
    if (ans.toLowerCase() === "n") {
      // User declined — use as-is (backward compatible).
      process.env.SOLANA_PRIVATE_KEY = fileEnv.SOLANA_PRIVATE_KEY;
      console.log(`${c.dim}  Using plain key. Re-run without declining to encrypt later.${c.reset}`);
      return;
    }
    privateKey = fileEnv.SOLANA_PRIVATE_KEY;
    removes.add("SOLANA_PRIVATE_KEY"); // strip from .env after encrypting
  } else {
    // Fresh install — ask for the key.
    privateKey = (await ask(`${c.yellow}? Wallet private key (base58): ${c.reset}`)).trim();
    if (!privateKey) throw new Error("SOLANA_PRIVATE_KEY is required to continue.");
  }

  // Choose and confirm master password.
  let password = "";
  while (true) {
    password = await askPassword(`${c.yellow}🔐 Set master password: ${c.reset}`);
    if (!password) {
      console.log(`${c.red}  Password cannot be empty.${c.reset}`);
      continue;
    }
    const confirm = await askPassword(`${c.yellow}🔐 Confirm master password: ${c.reset}`);
    if (password === confirm) break;
    console.log(`${c.red}  ✗ Passwords don't match — try again.${c.reset}`);
  }

  console.log(`${c.dim}  Encrypting… (this takes ~1 s)${c.reset}`);
  encryptKey(privateKey, password);
  process.env.SOLANA_PRIVATE_KEY = privateKey;

  console.log(`${c.brightGreen}  ✓ Key encrypted → ${KEYSTORE_PATH}${c.reset}`);
  console.log(`${c.dim}  Back up that file. Never share it or commit it to git.${c.reset}`);
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function runStartupSetup(): Promise<void> {
  const { values: fileEnv, raw: originalRaw } = await readEnvFile();
  const merged: Record<string, string> = { ...fileEnv };
  const updates: Record<string, string> = {};
  const removes = new Set<string>();

  // Wallet key first — must be in process.env before env.ts is imported.
  await unlockWallet(fileEnv, removes);

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
  const sel    = (await ask(`${c.yellow}? Select swap-from token ${c.dim}[current: ${current}]${c.reset}: `)).trim();
  const upper  = sel.toUpperCase();
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

  if (Object.keys(updates).length > 0 || removes.size > 0) {
    await writeEnvFile(updates, originalRaw, removes);
    const saved = Object.keys(updates).length;
    const removed = removes.size;
    const parts = [
      saved   > 0 ? `saved ${saved} value(s)` : "",
      removed > 0 ? `removed ${removed} plaintext key(s)` : "",
    ].filter(Boolean).join(", ");
    console.log(`${c.dim}  .env updated: ${parts}${c.reset}`);
  }
}
