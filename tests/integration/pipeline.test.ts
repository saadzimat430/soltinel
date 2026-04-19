import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/tools/birdeye.js", () => ({ getOnchainData: vi.fn() }));
vi.mock("../../src/tools/rugcheck.js", () => ({ getRugRisk: vi.fn() }));
vi.mock("../../src/tools/xSentiment.js", () => ({ searchXPosts: vi.fn() }));
vi.mock("../../src/config/llm.js", () => ({ getLLM: vi.fn() }));
vi.mock("../../src/config/prompt.js", () => ({ ask: vi.fn().mockResolvedValue("n") }));
vi.mock("../../src/tools/solanaKit.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/tools/solanaKit.js")>();
  return {
    ...actual,
    getInputToken: vi.fn().mockReturnValue({
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
    }),
    executeSwap: vi.fn(),
  };
});

import { buildGraph } from "../../src/graph/build.js";
import { getOnchainData } from "../../src/tools/birdeye.js";
import { getRugRisk } from "../../src/tools/rugcheck.js";
import { searchXPosts } from "../../src/tools/xSentiment.js";
import { getLLM } from "../../src/config/llm.js";

const mockOnchainData = vi.mocked(getOnchainData);
const mockGetRugRisk = vi.mocked(getRugRisk);
const mockSearchXPosts = vi.mocked(searchXPosts);
const mockGetLLM = vi.mocked(getLLM);

// ---- Fixtures ---------------------------------------------------------------

const healthyOnchain = {
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
};

const healthyRug = {
  score: 10,
  label: "low",
  mintAuthority: false,
  freezeAuthority: false,
  topHolderPct: 0.05,
  risks: [] as string[],
};

const neutralPosts = [{ id: "1", text: "TEST token looks interesting" }];

// Returns an LLM mock that sequences: first call → sentiment result, second call → risk decision.
function makeLLM(
  sentimentPayload = { score: 0.65, label: "bullish", reasoning: "positive sentiment" },
  riskPayload = { decision: "approve", reason: "all clear", rejectConfidence: 0.1 },
) {
  const invokeOnce = vi.fn()
    .mockResolvedValueOnce(sentimentPayload)  // sentimentNode
    .mockResolvedValueOnce(riskPayload);       // riskGuardNode
  return { withStructuredOutput: () => ({ invoke: invokeOnce }) };
}

// ---- Tests ------------------------------------------------------------------

describe("Pipeline integration (mocked tools, DRY_RUN=true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnchainData.mockResolvedValue(healthyOnchain);
    mockGetRugRisk.mockResolvedValue(healthyRug);
    mockSearchXPosts.mockResolvedValue({ posts: neutralPosts, fromCache: false, creditsUsed: 1 });
    mockGetLLM.mockReturnValue(makeLLM() as any);
  });

  it("approve path: finalAction is set with dryRun=true", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "ApproveMint111" },
      { configurable: { thread_id: "test-approve" } },
    );
    expect(result.riskDecision?.decision).toBe("approve");
    expect(result.finalAction?.dryRun).toBe(true);
    expect(result.finalAction?.type).toBe("swap");
  });

  it("approve path: all four state fields are populated", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "ApproveMint112" },
      { configurable: { thread_id: "test-state-full" } },
    );
    expect(result.onchainData).not.toBeNull();
    expect(result.sentiment).not.toBeNull();
    expect(result.rugRisk).not.toBeNull();
    expect(result.riskDecision).not.toBeNull();
  });

  it("reject path: rug score too high — finalAction stays null", async () => {
    mockGetRugRisk.mockResolvedValue({ ...healthyRug, score: 99, label: "high" });
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "RuggyMint222" },
      { configurable: { thread_id: "test-rug" } },
    );
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.finalAction).toBeNull();
  });

  it("reject path: RugCheck unreachable (unknown label) — fails closed", async () => {
    mockGetRugRisk.mockResolvedValue({ ...healthyRug, score: 100, label: "unknown" });
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "DownMint333" },
      { configurable: { thread_id: "test-rugcheck-down" } },
    );
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.finalAction).toBeNull();
  });

  it("reject path: liquidity below floor — reason mentions liquidity", async () => {
    mockOnchainData.mockResolvedValue({ ...healthyOnchain, liquidity: 100 });
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "LowLiqMint444" },
      { configurable: { thread_id: "test-liq" } },
    );
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.riskDecision?.reason).toMatch(/liquidity/i);
    expect(result.finalAction).toBeNull();
  });

  it("reject path: LLM rejects with high confidence", async () => {
    mockGetLLM.mockReturnValue(
      makeLLM(
        { score: 0.6, label: "neutral", reasoning: "mixed" },
        { decision: "reject", reason: "suspicious pattern", rejectConfidence: 0.92 },
      ) as any,
    );
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "LLMRiskMint555" },
      { configurable: { thread_id: "test-llm-reject" } },
    );
    expect(result.riskDecision?.decision).toBe("reject");
    expect(result.finalAction).toBeNull();
  });

  it("logs array accumulates entries from multiple agents", async () => {
    const graph = buildGraph();
    const result = await graph.invoke(
      { tokenAddress: "LogMint666" },
      { configurable: { thread_id: "test-logs" } },
    );
    expect(result.logs.length).toBeGreaterThan(1);
    expect(result.logs.some((l: string) => l.includes("[risk]"))).toBe(true);
  });
});
