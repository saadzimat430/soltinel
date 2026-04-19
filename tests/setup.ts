// Minimum env vars so src/config/env.ts Zod schema parses cleanly on import.
// Tests that need different values should vi.mock("../src/config/env.js") directly.
process.env.SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
process.env.RUGCHECK_BASE_URL = "https://api.rugcheck.xyz/v1";
process.env.OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
process.env.DRY_RUN = "true";
process.env.REQUIRE_CONFIRMATION = "false";
process.env.ALLOW_OVERRIDE = "false";
process.env.X_ENABLED = "false";
process.env.X_CACHE_TTL_MINUTES = "15";
process.env.X_MAX_RESULTS = "10";
process.env.SWAP_INPUT_TOKEN = "USDC";
process.env.MAX_TRADE_AMOUNT = "25";
process.env.MAX_SLIPPAGE_BPS = "100";
process.env.MAX_PRICE_IMPACT_PCT = "3";
process.env.RUG_SCORE_MAX = "40";
process.env.SENTIMENT_MIN = "0.35";
process.env.MIN_LIQUIDITY_USD = "5000";
process.env.MIN_VOLUME_24H_USD = "1000";
process.env.MIN_VOL_LIQ_RATIO = "0.01";
process.env.MAX_PRICE_CHANGE_24H = "-25";
