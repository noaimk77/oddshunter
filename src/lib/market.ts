import type { Market, MarketRow, Runner } from "@/types";
import type { MoneywaySort } from "@/services/market-data-provider";

/** The runner currently showing the shortest price — the side money is leaning toward. */
export function getFavoriteRunner(market: Market): Runner {
  return market.runners.reduce((min, r) => (market.currentOdds[r.id] < market.currentOdds[min.id] ? r : min), market.runners[0]);
}

export function getLeadingMoneyRunner(market: Market): Runner {
  return market.runners.reduce(
    (max, r) => (market.moneyDistribution[r.id] > market.moneyDistribution[max.id] ? r : max),
    market.runners[0]
  );
}

/** Shared sort strategies for the Moneyway table — used both server-side (initial load) and client-side (re-sorting without a round trip). */
export function sortMoneywayRows(rows: MarketRow[], sort: MoneywaySort): MarketRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "highest-matched":
      return sorted.sort((a, b) => b.market.matchedVolume - a.market.matchedVolume);
    case "highest-market-share":
      return sorted.sort(
        (a, b) => Math.max(...Object.values(b.market.moneyDistribution)) - Math.max(...Object.values(a.market.moneyDistribution))
      );
    case "biggest-drop":
      return sorted.sort((a, b) => a.movementPercent - b.movementPercent);
    case "fastest-volume":
      return sorted.sort((a, b) => b.market.liquidityMetrics.volumeVelocity - a.market.liquidityMetrics.volumeVelocity);
    case "most-concentrated":
      return sorted.sort((a, b) => b.market.liquidityMetrics.concentration - a.market.liquidityMetrics.concentration);
  }
}
