import type {
  Alert,
  AnalyticsSummary,
  Competition,
  EventStatus,
  FeedEvent,
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
  competition?: string | "all";
  status?: EventStatus | "all";
  search?: string;
  minVolume?: number;
  oddsMin?: number;
  oddsMax?: number;
  signal?: SignalLevel | "all";
  movement?: "any" | "shortening" | "drifting";
  volumeAcceleration?: "any" | "accelerating";
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
  competitions: string[];
  marketNames: string[];
}

export type MoneywaySort =
  | "highest-matched"
  | "highest-market-share"
  | "biggest-drop"
  | "fastest-volume"
  | "most-concentrated";

export interface ProviderStatus {
  available: boolean;
  providerName: string;
}

/**
 * Every UI component is built against this interface, never against a
 * concrete data source. Selection happens once in `services/index.ts`:
 * `BetfairProvider` when credentials are configured, `MockMarketDataProvider`
 * only in local development, otherwise `UnavailableMarketDataProvider` — so
 * production never silently shows demo data as if it were real. Pages should
 * check `getStatus()` before trusting an empty result to mean "no markets"
 * rather than "no data source."
 */
export interface MarketDataProvider {
  getStatus(): Promise<ProviderStatus>;
  getOverviewKpis(): Promise<OverviewKpis>;
  getMarketPulse(): Promise<MarketPulseBucket[]>;
  getMarketActivity(): Promise<MarketActivityPoint[]>;
  getTopMovements(limit?: number): Promise<MarketRow[]>;
  getLiveFeed(limit?: number): Promise<FeedEvent[]>;
  listMarkets(filters?: MarketFilters): Promise<MarketRow[]>;
  listMoneyway(sort?: MoneywaySort, filters?: MarketFilters): Promise<MarketRow[]>;
  getMarket(id: string): Promise<MarketRow | undefined>;
  getCompetitions(): Promise<Competition[]>;
  getAlerts(): Promise<Alert[]>;
  getAnalytics(): Promise<AnalyticsSummary>;
  getFilterOptions(): Promise<FilterOptions>;
  /** Simulates (or, later, streams) live market updates. Returns an unsubscribe function. */
  subscribeToTicks(onTick: (ticks: MarketTick[]) => void, intervalMs?: number): () => void;
}
