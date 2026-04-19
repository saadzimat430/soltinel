import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/tools/rugcheck.js", () => ({ getRugRisk: vi.fn() }));
vi.mock("../../../src/config/llm.js", () => ({ getLLM: vi.fn() }));
vi.mock("../../../src/config/prompt.js", () => ({ ask: vi.fn().mockResolvedValue("n") }));

import { riskGuardNode } from "../../../src/agents/riskGuard.js";
import { getRugRisk } from "../../../src/tools/rugcheck.js";
import { getLLM } from "../../../src/config/llm.js";
import type { TradingStateType } from "../../../src/graph/state.js";

const mockGetRugRisk = vi.mocked(getRugRisk);
const mockGetLLM = vi.mocked(getLLM);

const goodRug = {
  score: 10,
  label: "low",
  mintAuthority: false,
  freezeAuthority: false,
  topHolderPct: 0.05,
  risks: [] as string[],
};

const goodState: TradingStateType = {
  tokenAddress: "TestMint111",
  onchainData: {
    symbol: "TEST",
    price: 0.001,
    liquidity: 50_000,
    volume24h: 10_000,
    priceChange24h: 2,
    priceChange1h: 0.5,
    marketCap: 500_000,
    fdv: 600_000,
    buys24h: 200,
    sells24h: 100,
    holders: null,
  },
  sentiment: { score: 0.7, label: "bullish", reasoning: "looks good", sampleSize: 10 },
  rugRisk: null,
  riskDecision: null,
  finalAction: null,
  logs: [],
};

const approvingLLM = {
  withStructuredOutput: () => ({
    invoke: vi.fn().mockResolvedValue({
      decision: "approve",
      reason: "all signals positive",
      rejectConfidence: 0.1,
    }),
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetLLM.mockReturnValue(approvingLLM as any);
});

describe("RiskGuard — hard rules", () => {
  it("approves when all signals are healthy", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const result = await riskGuardNode(goodState);
    expect(result.riskDecision?.decision).toBe("approve");
  });

  it("rejects when rug score exceeds RUG_SCORE_MAX (40)", async () => {
    mockGetRugRisk.mockResolvedValue({ ...goodRug, score: 99, label: "high" });
    const result = await riskGuardNode(goodState);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/rug score/i);
  });

  it("rejects when RugCheck returns unknown label (service down)", async () => {
    mockGetRugRisk.mockResolvedValue({ ...goodRug, score: 100, label: "unknown" });
    const result = await riskGuardNode(goodState);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/unknown/i);
  });

  it("rejects when sentiment is below SENTIMENT_MIN (0.35)", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const state = { ...goodState, sentiment: { ...goodState.sentiment!, score: 0.1 } };
    const result = await riskGuardNode(state);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/sentiment/i);
  });

  it("rejects when liquidity is below MIN_LIQUIDITY_USD (5000)", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const state = { ...goodState, onchainData: { ...goodState.onchainData!, liquidity: 100 } };
    const result = await riskGuardNode(state);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/liquidity/i);
  });

  it("rejects when 24h volume is below MIN_VOLUME_24H_USD (1000)", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const state = { ...goodState, onchainData: { ...goodState.onchainData!, volume24h: 50 } };
    const result = await riskGuardNode(state);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/volume/i);
  });

  it("rejects when 24h price drop exceeds MAX_PRICE_CHANGE_24H (-25%)", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const state = { ...goodState, onchainData: { ...goodState.onchainData!, priceChange24h: -60 } };
    const result = await riskGuardNode(state);
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/price/i);
  });

  it("populates rugRisk in returned state", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const result = await riskGuardNode(goodState);
    expect(result.rugRisk).toMatchObject({ score: 10, label: "low" });
  });
});

describe("RiskGuard — LLM arbitration", () => {
  it("rejects when LLM rejectConfidence >= 0.80", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    mockGetLLM.mockReturnValue({
      withStructuredOutput: () => ({
        invoke: vi.fn().mockResolvedValue({
          decision: "reject",
          reason: "suspicious turnover pattern",
          rejectConfidence: 0.9,
        }),
      }),
    } as any);
    const result = await riskGuardNode(goodState);
    expect(result.riskDecision?.decision).toBe("reject");
  });

  it("approves when LLM rejectConfidence < 0.80", async () => {
    mockGetRugRisk.mockResolvedValue(goodRug);
    const result = await riskGuardNode(goodState);
    expect(result.riskDecision?.decision).toBe("approve");
    expect(result.riskDecision?.rejectConfidence).toBeLessThan(0.8);
  });
});
