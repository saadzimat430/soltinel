import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-opus-4"),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),

  SOLANA_PRIVATE_KEY: z.string().optional(),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),

  BIRDEYE_API_KEY: z.string().optional(),
  RUGCHECK_BASE_URL: z.string().url().default("https://api.rugcheck.xyz/v1"),
  // Jupiter API key unlocks higher rate limits (api.jup.ag). Without it the
  // free lite endpoint (lite-api.jup.ag) is used automatically.
  JUPITER_API_KEY: z.string().optional(),

  X_BEARER_TOKEN: z.string().optional(),

  // Input token for swaps. Amount unit matches the token:
  //   USDC / USDT → MAX_TRADE_AMOUNT is in USD (e.g. 25 = $25)
  //   SOL         → MAX_TRADE_AMOUNT is in SOL (e.g. 0.15 = 0.15 SOL)
  SWAP_INPUT_TOKEN: z.enum(["USDC", "USDT", "SOL"]).default("USDC"),
  MAX_TRADE_AMOUNT: z.coerce.number().default(25),
  MAX_SLIPPAGE_BPS: z.coerce.number().default(100),      // 100 = 1%
  MAX_PRICE_IMPACT_PCT: z.coerce.number().default(3),    // warn + prompt if Jupiter route costs >X%

  // --- Risk thresholds (hard rules, fail-closed) ---
  RUG_SCORE_MAX: z.coerce.number().default(40),        // 0-100, lower = stricter
  SENTIMENT_MIN: z.coerce.number().default(0.45),      // 0-1,   higher = stricter
  MIN_LIQUIDITY_USD: z.coerce.number().default(5_000), // absolute pool liquidity floor
  MIN_VOLUME_24H_USD: z.coerce.number().default(1_000),// minimum 24h trading volume
  MIN_VOL_LIQ_RATIO: z.coerce.number().default(0.01),  // volume/liquidity turnover (1% = low activity)
  MAX_PRICE_CHANGE_24H: z.coerce.number().default(-25),// reject if 24h drop exceeds this % (negative = drop)
  DRY_RUN: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  // When true (default), prints a confirmation prompt and waits for "y" before
  // signing. Set to false only in fully autonomous/headless deployments.
  REQUIRE_CONFIRMATION: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  // When true, shows an override prompt after any rejection so the user can
  // proceed at their own risk. Defaults to false — opt-in only.
  ALLOW_OVERRIDE: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
});

export const env = schema.parse(process.env);

if (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY && !env.OPENROUTER_API_KEY) {
  throw new Error(
    "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY in .env",
  );
}
