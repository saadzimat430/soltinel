import { randomUUID } from "node:crypto";
import { buildGraph } from "./graph/build.js";
import { log } from "./config/logger.js";
import { env } from "./config/env.js";
import { closeReadline } from "./config/prompt.js";

process.on("SIGINT", () => {
  console.log("");
  log.warn("Interrupted — shutting down cleanly");
  closeReadline();
  process.exit(0);
});

function printBanner() {
  const c = {
    cyan:   "\x1b[36m",
    yellow: "\x1b[33m",
    dim:    "\x1b[2m",
    bold:   "\x1b[1m",
    reset:  "\x1b[0m",
  };
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
  const tokenAddress =
    process.argv[2] ?? "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK

  const threadId = randomUUID();

  printBanner();
  log.divider("SOLANA TRADING BOT");
  log.graph(`Token:    ${tokenAddress}`);
  log.graph(`Thread:   ${threadId}`);
  log.graph(`Dry run:  ${env.DRY_RUN}`);
  log.graph(`Input:    ${env.SWAP_INPUT_TOKEN}  (max ${env.MAX_TRADE_AMOUNT} ${env.SWAP_INPUT_TOKEN})`);
  log.graph(`Rug max:  ${env.RUG_SCORE_MAX}/100`);
  log.graph(`Sent min: ${env.SENTIMENT_MIN}`);
  log.graph(`\nStarting graph — nodes will run in order:`);
  log.graph(`  analystAgent → sentimentAgent → riskGuardAgent → executorAgent (if approved)`);

  const graph = buildGraph();
  const result = await graph.invoke(
    { tokenAddress },
    { configurable: { thread_id: threadId } },
  );

  // ---- Final summary -------------------------------------------------------
  log.divider("RUN SUMMARY");
  log.graph(`All agents completed. Final state:`);

  log.graph(`\n  On-chain`);
  log.graph(`    Symbol:    ${result.onchainData?.symbol ?? "?"}`);
  log.graph(`    Price:     $${result.onchainData?.price ?? "?"}`);
  log.graph(`    Liquidity: $${result.onchainData?.liquidity ?? "?"}`);

  log.graph(`\n  Sentiment`);
  log.graph(`    Label:     ${result.sentiment?.label ?? "?"}`);
  log.graph(`    Score:     ${result.sentiment?.score?.toFixed(3) ?? "?"}`);

  log.graph(`\n  Rug Risk`);
  log.graph(`    Score:     ${result.rugRisk?.score ?? "?"}/100`);
  log.graph(`    Label:     ${result.rugRisk?.label ?? "?"}`);

  log.graph(`\n  Decision`);
  const d = result.riskDecision;
  if (d?.decision === "approve") {
    log.approve(`    APPROVE (${(d.confidence * 100).toFixed(0)}% confidence)`);
    log.approve(`    ${d.reason}`);
  } else if (d?.decision === "reject") {
    log.reject(`    REJECT (${(d?.confidence * 100).toFixed(0)}% confidence)`);
    log.reject(`    ${d?.reason}`);
  }

  log.graph(`\n  Action`);
  const a = result.finalAction;
  if (!a || a.type === "none") {
    log.graph(`    No trade executed${a?.note ? ` — ${a.note}` : ""}`);
  } else {
    const status = a.dryRun ? "DRY RUN" : "EXECUTED";
    log.graph(`    ${status}: swap ${a.amountUsd} ${env.SWAP_INPUT_TOKEN} → ${a.outputMint}`);
    if (a.txSignature) log.graph(`    Signature: ${a.txSignature}`);
  }

  log.divider("AGENT LOGS (chronological)");
  result.logs.forEach((line: string) => log.graph(`  ${line}`));
  console.log("");
}

main()
  .then(() => {
    closeReadline();
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    closeReadline();
    process.exit(1);
  });
