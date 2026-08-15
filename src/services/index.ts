import { MockMarketDataProvider } from "./mock-market-data-provider";
import { BetfairProvider } from "./betfair-provider";
import { UnavailableMarketDataProvider } from "./unavailable-market-data-provider";
import type { MarketDataProvider } from "./market-data-provider";

export type {
  MarketDataProvider,
  MarketFilters,
  MarketTick,
  FilterOptions,
  MoneywaySort,
  ProviderStatus,
} from "./market-data-provider";

/**
 * Single swap point for the data layer — nothing outside this file picks a
 * concrete provider.
 *
 * Priority: a real Betfair session (when BETFAIR_APP_KEY/USERNAME/PASSWORD
 * are set) > mock data, but ONLY in local development, clearly labeled as
 * demo data > an explicit "unavailable" provider everywhere else, so
 * production never silently shows fabricated markets as if they were real.
 */
export function buildProvider(): MarketDataProvider {
  const { BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD } = process.env;
  if (BETFAIR_APP_KEY && BETFAIR_USERNAME && BETFAIR_PASSWORD) {
    return new BetfairProvider(BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD);
  }
  if (process.env.NODE_ENV === "development") {
    return new MockMarketDataProvider();
  }
  return new UnavailableMarketDataProvider();
}

export const marketDataProvider: MarketDataProvider = buildProvider();
