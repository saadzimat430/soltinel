import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { getLLM } from "../config/llm.js";
import { getRugRisk } from "../tools/rugcheck.js";
import { env } from "../config/env.js";
import { log, fmtUsd, fmtPct } from "../config/logger.js";
import { ask } from "../config/prompt.js";
import type { TradingStateType, RiskDecision } from "../graph/state.js";

const DecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
});

export async function riskGuardNode(
  state: TradingStateType,
): Promise<Partial<TradingStateType>> {
  log.divider("RISK GUARD AGENT");
  log.risk(`Fetching rug risk report from RugCheck.xyz`);
  log.risk(`Token: ${state.tokenAddress}`);

  const rug = await getRugRisk(state.tokenAddress);

  log.risk(`Rug score:         ${rug.score}/100  (threshold: ≤${env.RUG_SCORE_MAX})`);
  log.risk(`Rug label:         ${rug.label.toUpperCase()}`);
  log.risk(`Mint authority:    ${rug.mintAuthority === null ? "unknown" : rug.mintAuthority ? "ENABLED ⚠" : "disabled ✓"}`);
  log.risk(`Freeze authority:  ${rug.freezeAuthority === null ? "unknown" : rug.freezeAuthority ? "ENABLED ⚠" : "disabled ✓"}`);
  if (rug.topHolderPct != null) {
    log.risk(`Top holder:        ${(rug.topHolderPct * 100).toFixed(1)}% of supply`);
  }
  if (rug.risks.length > 0) {
    log.risk(`Flagged issues (${rug.risks.length}):`);
    rug.risks.forEach((r) => log.risk(`  • ${r}`));
  } else {
    log.risk(`Flagged issues:    none`);
  }

  // ---- Hard rules (evaluated in order, all checked before rejecting) --------
  log.risk(`\nEvaluating hard rules...`);

  const onchain = state.onchainData;
  const liquidity = onchain?.liquidity ?? 0;
  const volume24h = onchain?.volume24h ?? 0;
  const priceChange24h = onchain?.priceChange24h ?? 0;
  const volLiqRatio = liquidity > 0 ? volume24h / liquidity : 0;
  const sentimentScore = state.sentiment?.score ?? 0;

  const checks: Array<{ label: string; pass: boolean; reason: string }> = [
    {
      label: `Rug score ${rug.score} ≤ ${env.RUG_SCORE_MAX}`,
      pass: rug.score <= env.RUG_SCORE_MAX,
      reason: `rug score ${rug.score} > ${env.RUG_SCORE_MAX}`,
    },
    {
      label: `RugCheck reachable`,
      pass: rug.label !== "unknown",
      reason: `rug risk unknown — failing closed`,
    },
    {
      label: `Sentiment ${sentimentScore.toFixed(3)} ≥ ${env.SENTIMENT_MIN}`,
      pass: sentimentScore >= env.SENTIMENT_MIN,
      reason: `sentiment ${sentimentScore.toFixed(3)} < ${env.SENTIMENT_MIN}`,
    },
    {
      label: `Liquidity ${fmtUsd(liquidity)} ≥ ${fmtUsd(env.MIN_LIQUIDITY_USD)}`,
      pass: liquidity >= env.MIN_LIQUIDITY_USD,
      reason: `liquidity ${fmtUsd(liquidity)} below floor ${fmtUsd(env.MIN_LIQUIDITY_USD)}`,
    },
    {
      label: `Volume 24h ${fmtUsd(volume24h)} ≥ ${fmtUsd(env.MIN_VOLUME_24H_USD)}`,
      pass: volume24h >= env.MIN_VOLUME_24H_USD,
      reason: `24h volume ${fmtUsd(volume24h)} below minimum ${fmtUsd(env.MIN_VOLUME_24H_USD)}`,
    },
    {
      label: `Vol/Liq ratio ${(volLiqRatio * 100).toFixed(2)}% ≥ ${(env.MIN_VOL_LIQ_RATIO * 100).toFixed(2)}%`,
      pass: volLiqRatio >= env.MIN_VOL_LIQ_RATIO,
      reason: `volume/liquidity turnover ${(volLiqRatio * 100).toFixed(2)}% below minimum ${(env.MIN_VOL_LIQ_RATIO * 100).toFixed(2)}% — thin trading activity`,
    },
    {
      label: `Price Δ 24h ${fmtPct(priceChange24h)} ≥ ${fmtPct(env.MAX_PRICE_CHANGE_24H)}`,
      pass: priceChange24h >= env.MAX_PRICE_CHANGE_24H,
      reason: `price dropped ${fmtPct(priceChange24h)} in 24h, exceeds max allowed drop of ${fmtPct(env.MAX_PRICE_CHANGE_24H)}`,
    },
  ];

  const hardReasons: string[] = [];
  for (const check of checks) {
    log.risk(`  [${check.pass ? "PASS" : "FAIL"}] ${check.label}`);
    if (!check.pass) hardReasons.push(check.reason);
  }

  if (hardReasons.length > 0) {
    const rejectionReason = `Hard rules tripped: ${hardReasons.join("; ")}`;
    log.reject(`Decision: REJECT (hard rules)`);
    log.reject(`Reason:   ${rejectionReason}`);

    const override = await promptOverride(rejectionReason, "hard-rule");
    if (override) {
      const decision: RiskDecision = {
        decision: "approve",
        reason: `[USER OVERRIDE] Original rejection: ${rejectionReason}`,
        confidence: 0,
      };
      log.warn(`User overrode hard-rule rejection — proceeding to executor`);
      return {
        rugRisk: rug,
        riskDecision: decision,
        logs: [`[risk] OVERRIDE — user bypassed hard rules: ${rejectionReason}`],
      };
    }

    log.reject(`→ Routing to END — executor will not run`);
    return {
      rugRisk: rug,
      riskDecision: { decision: "reject", reason: rejectionReason, confidence: 0.95 },
      logs: [`[risk] REJECT (hard rules) — ${rejectionReason}`],
    };
  }

  // ---- LLM arbitration for borderline cases --------------------------------
  log.risk(`\nAll hard rules passed — escalating to LLM for grey-zone arbitration`);
  log.risk(`LLM input: on-chain data + sentiment + rug flags + all thresholds`);

  const payload = {
    token: onchain?.symbol ?? state.tokenAddress,
    onchain: {
      price: onchain?.price,
      liquidity,
      volume24h,
      priceChange24h,
      priceChange1h: onchain?.priceChange1h,
      marketCap: onchain?.marketCap,
      fdv: onchain?.fdv,
      buys24h: onchain?.buys24h,
      sells24h: onchain?.sells24h,
      volLiqRatio: parseFloat((volLiqRatio * 100).toFixed(4)) + "%",
    },
    sentiment: state.sentiment,
    rug: { score: rug.score, label: rug.label, risks: rug.risks },
    thresholds: {
      rugMax:            env.RUG_SCORE_MAX,
      sentimentMin:      env.SENTIMENT_MIN,
      minLiquidityUsd:   env.MIN_LIQUIDITY_USD,
      minVolume24hUsd:   env.MIN_VOLUME_24H_USD,
      minVolLiqRatio:    (env.MIN_VOL_LIQ_RATIO * 100).toFixed(2) + "%",
      maxPriceChange24h: env.MAX_PRICE_CHANGE_24H + "%",
      maxTradeAmount:    env.MAX_TRADE_AMOUNT,
      swapInputToken:    env.SWAP_INPUT_TOKEN,
      maxSlippageBps:    env.MAX_SLIPPAGE_BPS,
    },
  };

  const llm = getLLM().withStructuredOutput(DecisionSchema);
  const res = await llm.invoke([
    new SystemMessage(
      "You are a conservative crypto Risk Guard. The inputs already passed all " +
        "hard rule checks. Decide approve/reject for a small speculative swap. " +
        "The thresholds object shows the user's configured risk tolerance — respect it. " +
        "Pay attention to volLiqRatio (turnover), buy/sell pressure, and price momentum. " +
        "Reject if signals are borderline even when sentiment is bullish. Reason in one sentence.",
    ),
    new HumanMessage(JSON.stringify(payload, null, 2)),
  ]);

  log.risk(`LLM decision:   ${res.decision.toUpperCase()}`);
  log.risk(`LLM confidence: ${(res.confidence * 100).toFixed(0)}%`);
  log.risk(`LLM reason:     ${res.reason}`);

  if (res.decision === "approve") {
    log.approve(`Decision: APPROVE`);
    log.approve(`→ Routing to Executor Agent`);
    return {
      rugRisk: rug,
      riskDecision: res as RiskDecision,
      logs: [`[risk] APPROVE (LLM ${(res.confidence * 100).toFixed(0)}% conf) — ${res.reason}`],
    };
  }

  log.reject(`Decision: REJECT (LLM)`);
  log.reject(`Reason:   ${res.reason}`);

  const override = await promptOverride(res.reason, "llm");
  if (override) {
    const decision: RiskDecision = {
      decision: "approve",
      reason: `[USER OVERRIDE] LLM rejected: ${res.reason}`,
      confidence: 0,
    };
    log.warn(`User overrode LLM rejection — proceeding to executor`);
    return {
      rugRisk: rug,
      riskDecision: decision,
      logs: [`[risk] OVERRIDE — user bypassed LLM rejection: ${res.reason}`],
    };
  }

  log.reject(`→ Routing to END — executor will not run`);
  return {
    rugRisk: rug,
    riskDecision: res as RiskDecision,
    logs: [`[risk] REJECT (LLM ${(res.confidence * 100).toFixed(0)}% conf) — ${res.reason}`],
  };
}

// ---------------------------------------------------------------------------

async function promptOverride(reason: string, source: "hard-rule" | "llm"): Promise<boolean> {
  if (!env.ALLOW_OVERRIDE) return false;

  console.log("");
  log.warn(`══════════════════════════════════════════════════════`);
  log.warn(`  TRADE REJECTED — OVERRIDE AVAILABLE`);
  log.warn(`══════════════════════════════════════════════════════`);
  log.warn(`  Source:  ${source === "hard-rule" ? "Hard rule violation" : "LLM risk assessment"}`);
  log.warn(`  Reason:  ${reason}`);
  log.warn(`──────────────────────────────────────────────────────`);
  log.warn(`  ⚠  WARNING: Overriding means you accept full risk.`);
  log.warn(`  ⚠  This token may be a scam, rug, or highly risky.`);
  log.warn(`  ⚠  You could lose the entire trade amount.`);
  log.warn(`══════════════════════════════════════════════════════`);
  console.log("");

  const answer = await ask(`  Proceed anyway? [y/N]: `);
  return answer.trim().toLowerCase() === "y";
}
