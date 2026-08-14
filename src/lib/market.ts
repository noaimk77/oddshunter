import type { Market, Runner } from "@/types";

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
