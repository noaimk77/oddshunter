import type {
  Alert,
  AnalyticsSummary,
  MarketActivityPoint,
  MarketPulseBucket,
  MarketRow,
  OverviewKpis,
  SignalLevel,
  Sport,
} from "@/types";

export interface MarketFilters {
  sport?: Sport | "all";
  country?: string | "all";
  league?: string | "all";
  search?: string;
  minVolume?: number;
  oddsMin?: number;
  oddsMax?: number;
  signal?: SignalLevel | "all";
  movement?: "any" | "shortening" | "drifting";
  timeWindow?: "all" | "1h" | "3h" | "6h" | "12h" | "24h";
}

export interface MarketTick {
  marketId: string;
  row: MarketRow;
  direction: "up" | "down";
}

export interface FilterOptions {
  sports: Sport[];
  countries: string[];
  leagues: string[];
}

/**
 * Every UI component is built against this interface, never against a
 * concrete data source. `MockMarketDataProvider` backs it today; a future
 * `BetfairMarketDataProvider` (real Betfair Exchange API + streaming) can
 * be swapped in without touching a single component.
 */
export interface MarketDataProvider {
  getOverviewKpis(): Promise<OverviewKpis>;
  getMarketPulse(): Promise<MarketPulseBucket[]>;
  getMarketActivity(): Promise<MarketActivityPoint[]>;
  getTopMovements(limit?: number): Promise<MarketRow[]>;
  listMarkets(filters?: MarketFilters): Promise<MarketRow[]>;
  getMarket(id: string): Promise<MarketRow | undefined>;
  getAlerts(): Promise<Alert[]>;
  getAnalytics(): Promise<AnalyticsSummary>;
  getFilterOptions(): Promise<FilterOptions>;
  /** Simulates (or, later, streams) live market updates. Returns an unsubscribe function. */
  subscribeToTicks(onTick: (ticks: MarketTick[]) => void, intervalMs?: number): () => void;
}
