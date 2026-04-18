import { env } from "../config/env.js";
import { jupiterSwap, ClassifiedSwapError, PriceImpactError, getInputToken } from "../tools/solanaKit.js";
import { log, fmtUsd } from "../config/logger.js";
import { ask } from "../config/prompt.js";
import type { TradingStateType, FinalAction } from "../graph/state.js";

export async function executorNode(
  state: TradingStateType,
): Promise<Partial<TradingStateType>> {
  log.divider("EXECUTOR AGENT");

  if (state.riskDecision?.decision !== "approve") {
    log.executor(`Risk Guard did not approve — no trade will be executed`);
    log.executor(`Decision received: ${state.riskDecision?.decision ?? "none"}`);
    return {
      finalAction: { type: "none", dryRun: env.DRY_RUN, note: "risk guard did not approve" },
      logs: [`[executor] skipped — not approved`],
    };
  }

  const inputToken = getInputToken();
  const tradeAmount = env.MAX_TRADE_AMOUNT;
  const outputMint = state.tokenAddress;
  const symbol = state.onchainData?.symbol ?? outputMint;
  const fmtInput = (n: number) =>
    inputToken.symbol === "SOL" ? `${n} SOL` : `${fmtUsd(n)} ${inputToken.symbol}`;

  log.executor(`Risk Guard approved — preparing swap`);
  log.executor(`Input:  ${fmtInput(tradeAmount)}`);
  log.executor(`Output: ${symbol} (${outputMint})`);
  log.executor(`Route:  Jupiter v6 /quote → /swap`);
  log.executor(`DRY_RUN: ${env.DRY_RUN}`);

  if (env.DRY_RUN) {
    log.executor(`DRY_RUN=true — transaction will NOT be signed or submitted`);
    log.executor(`Would swap: ${fmtInput(tradeAmount)} → ${symbol}`);
    log.executor(`Set DRY_RUN=false in .env to execute real trades`);
    return {
      finalAction: {
        type: "swap",
        inputMint: inputToken.mint,
        outputMint,
        amountUsd: tradeAmount,
        txSignature: null,
        dryRun: true,
        note: "DRY_RUN=true — not signing",
      },
      logs: [`[executor] DRY RUN — would swap ${fmtInput(tradeAmount)} → ${symbol}`],
    };
  }

  // ---- User confirmation gate (skipped only in headless/autonomous mode) ---
  let finalAmount = tradeAmount;
  if (env.REQUIRE_CONFIRMATION) {
    const { confirmed, amountUsd: chosenAmount } = await promptConfirmation(state, symbol, tradeAmount, fmtInput);
    if (!confirmed) {
      log.warn(`Trade cancelled by user`);
      return {
        finalAction: { type: "none", dryRun: false, note: "cancelled by user at confirmation prompt" },
        logs: [`[executor] cancelled by user`],
      };
    }
    finalAmount = chosenAmount;
    if (finalAmount !== tradeAmount) {
      log.executor(`Amount adjusted by user: ${fmtInput(tradeAmount)} → ${fmtInput(finalAmount)}`);
    }
  } else {
    log.warn(`REQUIRE_CONFIRMATION=false — skipping user approval (autonomous mode)`);
  }

  // ---- Execute ---------------------------------------------------------------
  const jupEndpoint = env.JUPITER_API_KEY ? "api.jup.ag (paid)" : "lite-api.jup.ag (free)";
  log.executor(`Requesting quote from Jupiter... (${jupEndpoint})`);

  let bypassImpactCheck = false;

  while (true) {
    try {
      const { signature, slippageBpsUsed, priceImpactPct } = await jupiterSwap(
        outputMint, finalAmount, env.MAX_SLIPPAGE_BPS, bypassImpactCheck,
      );

      log.approve(`Swap executed successfully`);
      log.approve(`Price impact:  ${priceImpactPct.toFixed(2)}%`);
      log.approve(`Slippage used: ${slippageBpsUsed} bps${slippageBpsUsed > env.MAX_SLIPPAGE_BPS ? " (auto-widened from retry)" : ""}`);
      log.approve(`Signature: ${signature}`);
      log.approve(`Explorer:  https://solscan.io/tx/${signature}`);

      return {
        finalAction: {
          type: "swap",
          inputMint: inputToken.mint,
          outputMint,
          amountUsd: finalAmount,
          txSignature: signature,
          dryRun: false,
        },
        logs: [`[executor] swap executed ${fmtInput(finalAmount)} → ${symbol} — impact=${priceImpactPct.toFixed(2)}% sig=${signature}`],
      };
    } catch (e) {
      if (e instanceof PriceImpactError) {
        const proceed = await promptPriceImpact(e.impactPct, e.thresholdPct);
        if (proceed) {
          bypassImpactCheck = true;
          continue;
        }
        log.warn(`Trade cancelled — price impact too high`);
        return {
          finalAction: { type: "none", dryRun: false, note: `cancelled: price impact ${e.impactPct.toFixed(2)}% > ${e.thresholdPct}%` },
          logs: [`[executor] cancelled — price impact ${e.impactPct.toFixed(2)}% exceeded threshold`],
        };
      }

      const info = e instanceof ClassifiedSwapError
        ? e.info
        : { type: "unknown" as const, title: "Unexpected Error", detail: (e as Error).message, suggestion: "Check the output above for more context." };

      console.log("");
      log.reject(`══════════════════════════════════════════════════════`);
      log.reject(`  SWAP FAILED — ${info.title.toUpperCase()}`);
      log.reject(`══════════════════════════════════════════════════════`);
      log.reject(`  Reason:  ${info.detail}`);
      log.reject(`  Fix:     ${info.suggestion}`);
      log.reject(`══════════════════════════════════════════════════════`);
      console.log("");

      return {
        finalAction: { type: "none", dryRun: false, note: `swap failed: ${info.title} — ${info.detail}` },
        logs: [`[executor] ERROR (${info.type}) — ${info.title}: ${info.detail}`],
      };
    }
  }
}

interface ConfirmationResult {
  confirmed: boolean;
  amountUsd: number;
}

async function promptConfirmation(
  state: TradingStateType,
  symbol: string,
  defaultAmount: number,
  fmtInput: (n: number) => string,
): Promise<ConfirmationResult> {
  const printBox = (amount: number) => {
    console.log("");
    log.warn(`══════════════════════════════════════════════════════`);
    log.warn(`  TRADE CONFIRMATION REQUIRED`);
    log.warn(`══════════════════════════════════════════════════════`);
    log.warn(`  Action:    BUY ${symbol}`);
    log.warn(`  Spending:  ${fmtInput(amount)} from your wallet`);
    log.warn(`  Token:     ${state.tokenAddress}`);
    log.warn(`  Rug score: ${state.rugRisk?.score ?? "?"}/100 (${state.rugRisk?.label ?? "?"})`);
    log.warn(`  Sentiment: ${state.sentiment?.score?.toFixed(3) ?? "?"} (${state.sentiment?.label ?? "?"})`);
    log.warn(`  Reason:    ${state.riskDecision?.reason ?? "approved"}`);
    log.warn(`══════════════════════════════════════════════════════`);
    log.warn(`  Options:`);
    log.warn(`    y          — confirm and execute`);
    log.warn(`    a <amount> — adjust amount (e.g. "a 10" to buy with $10)`);
    log.warn(`    n          — cancel`);
    log.warn(`══════════════════════════════════════════════════════`);
    console.log("");
  };

  let currentAmount = defaultAmount;

  while (true) {
    printBox(currentAmount);
    const raw = (await ask(`  > `)).trim().toLowerCase();

    if (raw === "y") {
      return { confirmed: true, amountUsd: currentAmount };
    }

    if (raw === "n" || raw === "") {
      return { confirmed: false, amountUsd: currentAmount };
    }

    if (raw.startsWith("a ")) {
      const parsed = parseFloat(raw.slice(2));
      if (!isFinite(parsed) || parsed <= 0) {
        log.warn(`  Invalid amount — enter a positive number (e.g. "a 10")`);
        continue;
      }
      if (parsed > env.MAX_TRADE_AMOUNT) {
        log.warn(`  Amount ${fmtInput(parsed)} exceeds MAX_TRADE_AMOUNT (${fmtInput(env.MAX_TRADE_AMOUNT)}) set in .env — capped for safety`);
        currentAmount = env.MAX_TRADE_AMOUNT;
      } else {
        currentAmount = parsed;
        log.executor(`  Amount updated to ${fmtUsd(currentAmount)}`);
      }
      continue;
    }

    log.warn(`  Unknown input — type "y" to confirm, "a <amount>" to adjust, "n" to cancel`);
  }
}

async function promptPriceImpact(impactPct: number, thresholdPct: number): Promise<boolean> {
  console.log("");
  log.warn(`══════════════════════════════════════════════════════`);
  log.warn(`  HIGH PRICE IMPACT WARNING`);
  log.warn(`══════════════════════════════════════════════════════`);
  log.warn(`  Impact:    ${impactPct.toFixed(2)}%  (your limit: ${thresholdPct}%)`);
  log.warn(`  Meaning:   You will receive ~${impactPct.toFixed(2)}% fewer tokens`);
  log.warn(`             than the mid-market rate due to low liquidity.`);
  log.warn(`  Tip:       Lower MAX_TRADE_AMOUNT or raise MAX_PRICE_IMPACT_PCT`);
  log.warn(`             in .env to suppress this warning.`);
  log.warn(`══════════════════════════════════════════════════════`);
  console.log("");
  const answer = await ask(`  Proceed anyway? [y/N]: `);
  return answer.trim().toLowerCase() === "y";
}
