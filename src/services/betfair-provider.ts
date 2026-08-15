import type {
  Alert,
  AnalyticsSummary,
  Competition,
  FeedEvent,
  MarketActivityPoint,
  MarketPulseBucket,
  MarketRow,
  OverviewKpis,
} from "@/types";
import type {
  FilterOptions,
  MarketDataProvider,
  MarketFilters,
  MarketTick,
  MoneywaySort,
} from "./market-data-provider";

const IDENTITY_SSO_URL = "https://identitysso.betfair.com/api/login";
const EXCHANGE_API_URL = "https://api.betfair.com/exchange/betting/json-rpc/v1";

interface BetfairSession {
  token: string;
  expiresAt: number;
}

/**
 * Real Betfair Exchange integration, built against the documented
 * Sports API-NG (session auth + JSON-RPC betting endpoints).
 *
 * IMPORTANT — untested: this session has no Betfair credentials (see the
 * mission report), so the request/response mapping below has not been
 * exercised against the live API. `listMarkets`/`getMarket` implement the
 * documented auth + listMarketCatalogue/listMarketBook flow; the harder
 * surfaces (true real-time ticks, cross-market analytics) need the
 * separate Exchange Stream API and are left as explicit TODOs rather than
 * faked. Verify every mapping once real credentials are available.
 */
export class BetfairProvider implements MarketDataProvider {
  private session: BetfairSession | null = null;

  constructor(
    private readonly appKey: string,
    private readonly username: string,
    private readonly password: string
  ) {}

  private async getSessionToken(): Promise<string> {
    if (this.session && this.session.expiresAt > Date.now()) return this.session.token;

    const res = await fetch(IDENTITY_SSO_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Application": this.appKey,
      },
      body: new URLSearchParams({ username: this.username, password: this.password }),
    });

    if (!res.ok) throw new Error(`Betfair login failed: HTTP ${res.status}`);
    const data = (await res.json()) as { status: string; token?: string };
    if (data.status !== "SUCCESS" || !data.token) {
      throw new Error(`Betfair login rejected: ${data.status}`);
    }

    // Betfair session tokens are valid ~4-24h depending on account config;
    // re-authenticate conservatively every 20 minutes.
    this.session = { token: data.token, expiresAt: Date.now() + 20 * 60_000 };
    return this.session.token;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const token = await this.getSessionToken();
    const res = await fetch(EXCHANGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Application": this.appKey,
        "X-Authentication": token,
      },
      body: JSON.stringify([{ jsonrpc: "2.0", method: `SportsAPING/v1.0/${method}`, params, id: 1 }]),
    });
    if (!res.ok) throw new Error(`Betfair API error: HTTP ${res.status}`);
    const [payload] = (await res.json()) as [{ result?: T; error?: { message: string } }];
    if (payload.error) throw new Error(`Betfair API error: ${payload.error.message}`);
    if (!payload.result) throw new Error("Betfair API returned no result.");
    return payload.result;
  }

  async getStatus() {
    try {
      await this.getSessionToken();
      return { available: true as const, providerName: "betfair", hasVolumeData: true };
    } catch (err) {
      console.error("[betfair] session check failed", err);
      return { available: false as const, providerName: "betfair", hasVolumeData: true };
    }
  }

  async listMarkets(_filters?: MarketFilters): Promise<MarketRow[]> {
    // TODO: map listMarketCatalogue (event/competition/runner metadata) +
    // listMarketBook (live prices, matched volume) into MarketRow. Needs a
    // live account to validate field names and rate limits before wiring up.
    return [];
  }

  async getMarket(_id: string): Promise<MarketRow | undefined> {
    return undefined;
  }

  async getTopMovements(_limit?: number): Promise<MarketRow[]> {
    return [];
  }

  async getLiveFeed(_limit?: number): Promise<FeedEvent[]> {
    // Real-time deltas need the Exchange Stream API (a persistent TCP
    // connection, not REST) — not implemented yet.
    return [];
  }

  async listMoneyway(_sort?: MoneywaySort, _filters?: MarketFilters): Promise<MarketRow[]> {
    return [];
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

  async getFilterOptions(): Promise<FilterOptions> {
    return { sports: [], countries: [], competitions: [], marketNames: [] };
  }

  async getFixtures() {
    // Same TODO as listMarkets() above — no live account wired up yet.
    return [];
  }

  subscribeToTicks(_onTick: (ticks: MarketTick[]) => void): () => void {
    // Needs the Exchange Stream API — no-op until that's built.
    return () => {};
  }
}
