import type {
  Alert,
  AnalyticsSummary,
  Competition,
  EventStatus,
  FeedEvent,
  FixtureRow,
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
  /** Real timestamp of the last successful sync from the underlying source, when known — never fabricated. */
  lastUpdated?: string;
  /**
   * Whether this provider has real matched-volume/liquidity/money-flow
   * data. Betfair Exchange (peer-to-peer) has this; bookmaker-odds
   * aggregators like API-Football don't — there's no invented substitute
   * when this is false, pages must show an explicit "not available" state
   * instead of a chart of zeros.
   */
  hasVolumeData: boolean;
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
  /**
   * Every real fixture for a fixtures-first view, independent of odds
   * availability — unlike listMarkets(), a fixture with no odds yet still
   * appears here (with `odds: null`), never silently dropped.
   */
  getFixtures(): Promise<FixtureRow[]>;
  /** Simulates (or, later, streams) live market updates. Returns an unsubscribe function. */
  subscribeToTicks(onTick: (ticks: MarketTick[]) => void, intervalMs?: number): () => void;
}
