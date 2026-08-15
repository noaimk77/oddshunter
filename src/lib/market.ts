import type { FixtureRow, Market, MarketRow, Runner } from "@/types";
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

/** Derives a FixtureRow from a full MarketRow — used by providers (mock, Betfair) that always have a complete market for every event, unlike API-Football's provider which reads FixtureRow straight from the DB since odds may not exist yet. */
export function toFixtureRow(row: MarketRow): FixtureRow {
  const { event, market } = row;
  const runners = market.runners;
  const home = runners.find((r) => r.position === "home");
  const draw = runners.find((r) => r.position === "draw");
  const away = runners.find((r) => r.position === "away");
  const odds =
    home && draw && away && market.currentOdds[home.id] != null && market.currentOdds[draw.id] != null && market.currentOdds[away.id] != null
      ? { home: market.currentOdds[home.id], draw: market.currentOdds[draw.id], away: market.currentOdds[away.id], bookmaker: market.name }
      : null;

  return {
    id: event.id,
    sport: event.sport,
    country: event.country,
    competition: event.competition,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    kickoff: event.kickoff,
    status: event.status,
    homeScore: null,
    awayScore: null,
    marketId: market.id,
    odds,
    oddsUpdatedAt: odds ? market.lastUpdated : null,
  };
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
