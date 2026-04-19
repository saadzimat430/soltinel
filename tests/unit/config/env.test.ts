import { describe, it, expect } from "vitest";
import { envSchema } from "../../../src/config/env.js";

const base = {
  SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
  RUGCHECK_BASE_URL: "https://api.rugcheck.xyz/v1",
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
};

describe("envSchema", () => {
  it("applies all defaults when only URL fields are present", () => {
    const result = envSchema.parse(base);
    expect(result.DRY_RUN).toBe(true);
    expect(result.REQUIRE_CONFIRMATION).toBe(true);
    expect(result.ALLOW_OVERRIDE).toBe(false);
    expect(result.RUG_SCORE_MAX).toBe(40);
    expect(result.SENTIMENT_MIN).toBe(0.35);
    expect(result.SWAP_INPUT_TOKEN).toBe("USDC");
    expect(result.X_ENABLED).toBe(true);
    expect(result.X_MAX_RESULTS).toBe(10);
    expect(result.X_CACHE_TTL_MINUTES).toBe(15);
    expect(result.MAX_TRADE_AMOUNT).toBe(25);
    expect(result.MAX_SLIPPAGE_BPS).toBe(100);
  });

  it('parses DRY_RUN="false" as boolean false', () => {
    expect(envSchema.parse({ ...base, DRY_RUN: "false" }).DRY_RUN).toBe(false);
  });

  it('parses DRY_RUN="FALSE" case-insensitively', () => {
    expect(envSchema.parse({ ...base, DRY_RUN: "FALSE" }).DRY_RUN).toBe(false);
  });

  it('parses ALLOW_OVERRIDE="true" as boolean true', () => {
    expect(envSchema.parse({ ...base, ALLOW_OVERRIDE: "true" }).ALLOW_OVERRIDE).toBe(true);
  });

  it("coerces X_MAX_RESULTS string to number", () => {
    expect(envSchema.parse({ ...base, X_MAX_RESULTS: "50" }).X_MAX_RESULTS).toBe(50);
  });

  it("coerces risk threshold strings to numbers", () => {
    const result = envSchema.parse({ ...base, RUG_SCORE_MAX: "60", SENTIMENT_MIN: "0.5" });
    expect(result.RUG_SCORE_MAX).toBe(60);
    expect(result.SENTIMENT_MIN).toBe(0.5);
  });

  it("rejects SWAP_INPUT_TOKEN outside the enum", () => {
    expect(() => envSchema.parse({ ...base, SWAP_INPUT_TOKEN: "BTC" })).toThrow();
  });

  it("rejects invalid SOLANA_RPC_URL", () => {
    expect(() => envSchema.parse({ ...base, SOLANA_RPC_URL: "not-a-url" })).toThrow();
  });

  it("accepts all three swap input tokens", () => {
    for (const token of ["USDC", "USDT", "SOL"]) {
      expect(envSchema.parse({ ...base, SWAP_INPUT_TOKEN: token }).SWAP_INPUT_TOKEN).toBe(token);
    }
  });

  it("X_ENABLED=false disables X globally", () => {
    expect(envSchema.parse({ ...base, X_ENABLED: "false" }).X_ENABLED).toBe(false);
  });
});
