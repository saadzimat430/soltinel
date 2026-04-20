import { randomUUID } from "node:crypto";
import { closeReadline } from "./config/prompt.js";
import { runStartupSetup } from "./config/setup.js";
import { c, log } from "./config/logger.js";
import type { TradingStateType } from "./graph/state.js";

process.on("SIGINT", () => {
  console.log("");
  log.warn("Interrupted — shutting down cleanly");
  closeReadline();
  process.exit(0);
});

function printBanner() {
  if (process.env.NO_COLOR === "1") {
    console.log(`
  ███████╗ ██████╗ ██╗  ████████╗██╗███╗   ██╗███████╗██╗
  ██╔════╝██╔═══██╗██║  ╚══██╔══╝██║████╗  ██║██╔════╝██║
  ███████╗██║   ██║██║     ██║   ██║██╔██╗ ██║█████╗  ██║
  ╚════██║██║   ██║██║     ██║   ██║██║╚██╗██║██╔══╝  ██║
  ███████║╚██████╔╝███████╗██║   ██║██║ ╚████║███████╗███████╗
  ╚══════╝ ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝

  Think before you trade.
`);
    return;
  }
  console.log(`
${c.cyan}${c.bold}  ███████╗ ██████╗ ██╗  ████████╗██╗███╗   ██╗███████╗██╗     ${c.reset}
${c.cyan}${c.bold}  ██╔════╝██╔═══██╗██║  ╚══██╔══╝██║████╗  ██║██╔════╝██║     ${c.reset}
${c.cyan}${c.bold}  ███████╗██║   ██║██║     ██║   ██║██╔██╗ ██║█████╗  ██║     ${c.reset}
${c.cyan}${c.bold}  ╚════██║██║   ██║██║     ██║   ██║██║╚██╗██║██╔══╝  ██║     ${c.reset}
${c.cyan}${c.bold}  ███████║╚██████╔╝███████╗██║   ██║██║ ╚████║███████╗███████╗${c.reset}
${c.cyan}${c.bold}  ╚══════╝ ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝${c.reset}
${c.yellow}                        Think before you trade.${c.reset}
`);
}

async function main() {
  printBanner();

  await runStartupSetup();

  const [{ env }, { runSoltinelSession }, { printWalletDashboard }] = await Promise.all([
    import("./config/env.js"),
    import("./api.js"),
    import("./tools/walletDashboard.js"),
  ]);

  await printWalletDashboard();

  const tokenAddress =
    process.argv[2] ?? "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
  const threadId = randomUUID();

  log.divider("SOLANA TRADING BOT");
  log.graph(`Token:    ${tokenAddress}`);
  log.graph(`Thread:   ${threadId}`);
  log.graph(`Dry run:  ${env.DRY_RUN}`);
  log.graph(`Input:    ${env.SWAP_INPUT_TOKEN}  (max ${env.MAX_TRADE_AMOUNT} ${env.SWAP_INPUT_TOKEN})`);
  log.graph(`Rug max:  ${env.RUG_SCORE_MAX}/100`);
  log.graph(`Sent min: ${env.SENTIMENT_MIN}`);
  log.graph(`\nStarting graph — nodes will run in order:`);
  log.graph(`  analystAgent → sentimentAgent → riskGuardAgent → executorAgent (if approved)`);

  const result = await runSoltinelSession({
    tokenAddress,
    threadId,
    interactionMode: "cli",
    executionMode: "full",
  });

  printSummary(result.state, env.SWAP_INPUT_TOKEN);
}

function printSummary(
  state: TradingStateType,
  inputTokenSymbol: string,
) {
  log.divider("RUN SUMMARY");
  log.graph(`All agents completed. Final state:`);

  log.graph(`\n  On-chain`);
  log.graph(`    Symbol:    ${state.onchainData?.symbol ?? "?"}`);
  log.graph(`    Price:     $${state.onchainData?.price ?? "?"}`);
  log.graph(`    Liquidity: $${state.onchainData?.liquidity ?? "?"}`);

  log.graph(`\n  Sentiment`);
  log.graph(`    Label:     ${state.sentiment?.label ?? "?"}`);
  log.graph(`    Score:     ${state.sentiment?.score?.toFixed(3) ?? "?"}`);

  log.graph(`\n  Rug Risk`);
  log.graph(`    Score:     ${state.rugRisk?.score ?? "?"}/100`);
  log.graph(`    Label:     ${state.rugRisk?.label ?? "?"}`);

  log.graph(`\n  Decision`);
  const decision = state.riskDecision;
  if (decision?.decision === "approve") {
    log.approve(`    APPROVE  (reject_conf=${(decision.rejectConfidence * 100).toFixed(0)}%)`);
    log.approve(`    ${decision.reason}`);
  } else if (decision?.decision === "reject") {
    log.reject(`    REJECT  (reject_conf=${(decision.rejectConfidence * 100).toFixed(0)}%)`);
    log.reject(`    ${decision.reason}`);
  }

  log.graph(`\n  Action`);
  const action = state.finalAction;
  if (!action || action.type === "none") {
    log.graph(`    No trade executed${action?.note ? ` — ${action.note}` : ""}`);
  } else {
    const status = action.dryRun ? "DRY RUN" : "EXECUTED";
    log.graph(`    ${status}: swap ${action.amountUsd} ${inputTokenSymbol} → ${action.outputMint}`);
    if (action.txSignature) log.graph(`    Signature: ${action.txSignature}`);
  }

  log.divider("AGENT LOGS (chronological)");
  state.logs.forEach((line) => log.graph(`  ${line}`));
  console.log("");
}

main()
  .then(() => { closeReadline(); process.exit(0); })
  .catch((error) => { console.error(error); closeReadline(); process.exit(1); });
