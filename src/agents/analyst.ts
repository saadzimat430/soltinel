import { getOnchainData } from "../tools/birdeye.js";
import { log, fmtUsd, fmtPct } from "../config/logger.js";
import type { TradingStateType } from "../graph/state.js";

export async function analystNode(
  state: TradingStateType,
): Promise<Partial<TradingStateType>> {
  log.divider("ANALYST AGENT");
  log.analyst(`Fetching on-chain data for ${state.tokenAddress}`);
  log.analyst(`Primary source: DexScreener (free, no key needed)`);
  if (process.env.BIRDEYE_API_KEY) {
    log.analyst(`Enrichment:     Birdeye token_overview (holder count)`);
  }

  const data = await getOnchainData(state.tokenAddress);

  const label = data.name ? `${data.name} (${data.symbol})` : state.tokenAddress;

  log.analyst(`Token:           ${label}`);
  log.analyst(`Source:          ${data.source}${data.dex ? ` / ${data.dex}` : ""}`);
  if (data.pairAddress) log.analyst(`Pair:            ${data.pairAddress}`);
  log.analyst(`Price:           ${fmtUsd(data.price)}`);
  log.analyst(`Liquidity:       ${fmtUsd(data.liquidity)}`);
  log.analyst(`Volume 24h:      ${fmtUsd(data.volume24h)}`);
  log.analyst(`Price Δ 24h:     ${fmtPct(data.priceChange24h)}`);
  log.analyst(`Price Δ 1h:      ${fmtPct(data.priceChange1h)}`);
  log.analyst(`Market cap:      ${fmtUsd(data.marketCap)}`);
  log.analyst(`FDV:             ${fmtUsd(data.fdv)}`);
  if (data.buys24h != null && data.sells24h != null) {
    const total = data.buys24h + data.sells24h;
    const buyPct = total > 0 ? ((data.buys24h / total) * 100).toFixed(1) : "?";
    log.analyst(`Txns 24h:        ${total.toLocaleString()} (${buyPct}% buys)`);
  }
  log.analyst(`Holders:         ${data.holders?.toLocaleString() ?? "? (set BIRDEYE_API_KEY)"}`);

  const missing = (["price", "liquidity", "volume24h", "priceChange24h"] as const).filter(
    (k) => data[k] == null,
  );
  if (missing.length > 0) {
    log.warn(`Fields not available: ${missing.join(", ")}`);
  }

  if (data.source === "none") {
    log.warn(`DexScreener returned no pairs for this mint — token may be unlisted or invalid`);
  }

  log.analyst(`→ Passing on-chain data to Sentiment Agent`);

  return {
    onchainData: data,
    logs: [
      `[analyst] ${label}: price=${fmtUsd(data.price)} liq=${fmtUsd(data.liquidity)} ` +
      `vol24=${fmtUsd(data.volume24h)} Δ24h=${fmtPct(data.priceChange24h)} ` +
      `mcap=${fmtUsd(data.marketCap)} buys/sells=${data.buys24h ?? "?"}/${data.sells24h ?? "?"} ` +
      `src=${data.source}`,
    ],
  };
}
