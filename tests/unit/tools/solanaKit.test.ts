import { describe, it, expect } from "vitest";
import { classifySwapError } from "../../../src/tools/solanaKit.js";

describe("classifySwapError", () => {
  it("classifies slippage error 0x1789", () => {
    const err = new Error("Transaction simulation failed: Error Code: 0x1789");
    expect(classifySwapError(err).type).toBe("slippage");
  });

  it("classifies insufficient SOL — 'insufficient lamports'", () => {
    expect(classifySwapError(new Error("insufficient lamports for fee")).type).toBe("insufficient_sol");
  });

  it("classifies insufficient SOL — 'insufficient funds for fee'", () => {
    expect(classifySwapError(new Error("insufficient funds for fee")).type).toBe("insufficient_sol");
  });

  it("classifies blockhash expiry — 'Blockhash not found'", () => {
    expect(classifySwapError(new Error("Blockhash not found")).type).toBe("blockhash_expired");
  });

  it("classifies blockhash expiry — 'block height exceeded'", () => {
    expect(classifySwapError(new Error("block height exceeded")).type).toBe("blockhash_expired");
  });

  it("classifies no route found", () => {
    expect(classifySwapError(new Error("No route found for the given tokens")).type).toBe("no_route");
  });

  it("classifies rate limiting — HTTP 429", () => {
    expect(classifySwapError(new Error("HTTP 429 Too Many Requests")).type).toBe("rate_limited");
  });

  it("classifies rate limiting — 'too many requests'", () => {
    expect(classifySwapError(new Error("too many requests")).type).toBe("rate_limited");
  });

  it("classifies network errors — fetch failed", () => {
    expect(classifySwapError(new Error("fetch failed")).type).toBe("network");
  });

  it("classifies network errors — ECONNREFUSED", () => {
    expect(classifySwapError(new Error("ECONNREFUSED")).type).toBe("network");
  });

  it("falls back to unknown for unrecognised errors", () => {
    expect(classifySwapError(new Error("completely unexpected")).type).toBe("unknown");
  });

  it("every result has non-empty title, detail, suggestion", () => {
    const errors = [
      new Error("insufficient lamports"),
      new Error("Blockhash not found"),
      new Error("No route found"),
      new Error("fetch failed"),
      new Error("something unknown"),
    ];
    for (const err of errors) {
      const info = classifySwapError(err);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.detail.length).toBeGreaterThan(0);
      expect(info.suggestion.length).toBeGreaterThan(0);
    }
  });
});
