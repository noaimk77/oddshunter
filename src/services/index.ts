import { MockMarketDataProvider } from "./mock-market-data-provider";
import type { MarketDataProvider } from "./market-data-provider";

export type { MarketDataProvider, MarketFilters, MarketTick, FilterOptions } from "./market-data-provider";

/**
 * Single swap point for the data layer. Replace with
 * `new BetfairMarketDataProvider(...)` once the real integration lands —
 * nothing outside this file needs to change.
 */
export const marketDataProvider: MarketDataProvider = new MockMarketDataProvider();
