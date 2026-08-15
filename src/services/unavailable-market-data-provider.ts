import type { Alert, AnalyticsSummary, Competition, FeedEvent, MarketActivityPoint, MarketPulseBucket, MarketRow, OverviewKpis } from "@/types";
import type { FilterOptions, MarketDataProvider, MarketTick } from "./market-data-provider";

/**
 * Selected whenever no real market data source is configured (production
 * without Betfair credentials, or Betfair's own session check failing).
 * Every method returns empty/zeroed results rather than mock data — pages
 * check `getStatus().available` and render an explicit
 * "Live market data unavailable" state instead of an empty table that could
 * be mistaken for "no markets right now."
 */
export class UnavailableMarketDataProvider implements MarketDataProvider {
  async getStatus() {
    return { available: false, providerName: "none" };
  }

  async getOverviewKpis(): Promise<OverviewKpis> {
    return {
      marketsMonitored: 0,
      marketsMonitoredDelta: 0,
      highActivity: 0,
      highActivityDelta: 0,
      majorMovements: 0,
      majorMovementsDelta: 0,
      volumeTracked: 0,
      volumeTrackedDelta: 0,
      signalsDetected: 0,
      signalsDetectedDelta: 0,
    };
  }

  async getMarketPulse(): Promise<MarketPulseBucket[]> {
    return [];
  }

  async getMarketActivity(): Promise<MarketActivityPoint[]> {
    return [];
  }

  async getTopMovements(): Promise<MarketRow[]> {
    return [];
  }

  async getLiveFeed(): Promise<FeedEvent[]> {
    return [];
  }

  async listMarkets(): Promise<MarketRow[]> {
    return [];
  }

  async listMoneyway(): Promise<MarketRow[]> {
    return [];
  }

  async getMarket(): Promise<MarketRow | undefined> {
    return undefined;
  }

  async getCompetitions(): Promise<Competition[]> {
    return [];
  }

  async getAlerts(): Promise<Alert[]> {
    return [];
  }

  async getAnalytics(): Promise<AnalyticsSummary> {
    return {
      marketsMonitored: 0,
      signalsGenerated: 0,
      extremeSignals: 0,
      averageMovement: 0,
      volumeMonitored: 0,
      signalsByDay: [],
      signalsBySeverity: [],
      signalsByCompetition: [],
      largestMovements: [],
      highestVolumeMarkets: [],
    };
  }

  async getFilterOptions(): Promise<FilterOptions> {
    return { sports: [], countries: [], competitions: [], marketNames: [] };
  }

  subscribeToTicks(_onTick: (ticks: MarketTick[]) => void): () => void {
    return () => {};
  }
}
