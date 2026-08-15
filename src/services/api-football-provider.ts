import { db } from "@/lib/db";
import { signalFromScore } from "@/lib/signal";
import { PROVIDER_NAME } from "./api-football-sync";
import type {
  Alert,
  AnalyticsSummary,
  Competition,
  Event,
  EventStatus,
  FeedEvent,
  Market,
  MarketPulseBucket,
  MarketRow,
  MarketTimelineEvent,
  OverviewKpis,
  Runner,
  RunnerPosition,
  SignalLevel,
} from "@/types";
import type { FilterOptions, MarketDataProvider, MarketFilters, MarketTick, MoneywaySort } from "./market-data-provider";

const round2 = (n: number) => Math.round(n * 100) / 100;

type DbEventWithMarkets = Awaited<ReturnType<typeof fetchEventsForProvider>>[number];

async function fetchEventsForProvider() {
  const provider = await db.provider.findUnique({ where: { name: PROVIDER_NAME } });
  if (!provider) return [];
  return db.event.findMany({
    where: { competition: { providerId: provider.id } },
    include: {
      competition: true,
      markets: { include: { selections: { include: { odds: { orderBy: { timestamp: "asc" } } } } } },
    },
    orderBy: { kickoff: "asc" },
  });
}

/**
 * Builds a MarketRow from one real synced event. Every field that has no
 * API-Football equivalent (matched volume, liquidity, money distribution)
 * is set to an honest zero/empty sentinel — never a fabricated number.
 * `hasVolumeData: false` on getStatus() is what tells the UI to hide these
 * instead of rendering them as if they meant something.
 */
function toMarketRow(dbEvent: DbEventWithMarkets): MarketRow | null {
  const dbMarket = dbEvent.markets[0];
  if (!dbMarket || dbMarket.selections.length === 0) return null;

  const runners: Runner[] = dbMarket.selections.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position as RunnerPosition,
  }));

  const openingOdds: Record<string, number> = {};
  const currentOdds: Record<string, number> = {};
  const peakOdds: Record<string, number> = {};
  const lowOdds: Record<string, number> = {};
  const oddsHistory: { timestamp: string; values: Record<string, number> }[] = [];
  const historyByTimestamp = new Map<string, Record<string, number>>();

  for (const selection of dbMarket.selections) {
    if (selection.odds.length === 0) continue;
    const first = selection.odds[0];
    const last = selection.odds[selection.odds.length - 1];
    openingOdds[selection.id] = first.price;
    currentOdds[selection.id] = last.price;
    peakOdds[selection.id] = Math.max(...selection.odds.map((o) => o.price));
    lowOdds[selection.id] = Math.min(...selection.odds.map((o) => o.price));
    for (const snapshot of selection.odds) {
      const key = snapshot.timestamp.toISOString();
      const bucket = historyByTimestamp.get(key) ?? {};
      bucket[selection.id] = snapshot.price;
      historyByTimestamp.set(key, bucket);
    }
  }
  for (const [timestamp, values] of [...historyByTimestamp.entries()].sort()) {
    oddsHistory.push({ timestamp, values });
  }

  // Movement is the only real signal input we have — the shortest-price
  // runner's opening-to-current change. No volume/liquidity dimension is
  // available, so the anomaly score is intentionally price-only and
  // conservative rather than a fabricated multi-factor number.
  let movementPercent = 0;
  for (const runner of runners) {
    const open = openingOdds[runner.id];
    const cur = currentOdds[runner.id];
    if (open == null || cur == null || open === 0) continue;
    const pct = ((cur - open) / open) * 100;
    if (Math.abs(pct) > Math.abs(movementPercent)) movementPercent = pct;
  }

  const priceAnomaly = Math.min(100, Math.round(Math.abs(movementPercent) * 4));
  const score = priceAnomaly;
  const level: SignalLevel = signalFromScore(score);
  const reasons =
    Math.abs(movementPercent) >= 3
      ? [
          {
            key: "price-movement",
            label: "Odds movement",
            value: `${movementPercent > 0 ? "+" : ""}${round2(movementPercent)}%`,
            severity: level,
            description: "Real movement between the opening and most recently fetched bookmaker price.",
          },
        ]
      : [];

  const timeline: MarketTimelineEvent[] = oddsHistory.slice(1).map((snap, idx) => ({
    id: `${dbMarket.id}-odds-${idx}`,
    timestamp: snap.timestamp,
    type: "odds-move" as const,
    label: "Bookmaker price updated",
    severity: level,
  }));

  const market: Market = {
    id: dbMarket.id,
    eventId: dbEvent.id,
    type: dbMarket.type as Market["type"],
    name: dbMarket.name,
    status: dbMarket.status as Market["status"],
    runners,
    openingOdds,
    currentOdds,
    peakOdds,
    lowOdds,
    // No API-Football equivalent — never invented. hasVolumeData: false on
    // getStatus() is what keeps the UI from displaying these as real.
    matchedVolume: 0,
    volumeDelta15m: 0,
    liquidity: "low",
    liquidityMetrics: { level: "low", matchedVolume: 0, volumeVelocity: 0, concentration: 0 },
    moneyDistribution: {},
    oddsHistory,
    volumeHistory: [],
    timeline,
    signal: {
      level,
      score,
      reasons,
      breakdown: { priceAnomaly, volumeAnomaly: 0, velocity: 0, concentration: 0, liquidityAnomaly: 0 },
    },
    lastUpdated: dbMarket.lastUpdated.toISOString(),
  };

  const event: Event = {
    id: dbEvent.id,
    sport: "football",
    country: dbEvent.competition.country,
    competitionId: dbEvent.competition.id,
    competition: dbEvent.competition.name,
    homeTeam: dbEvent.homeTeam,
    awayTeam: dbEvent.awayTeam,
    kickoff: dbEvent.kickoff.toISOString(),
    status: dbEvent.status as EventStatus,
    marketIds: dbEvent.markets.map((m) => m.id),
  };

  return { event, market, movementPercent: round2(movementPercent) };
}

function matchesFilters(row: MarketRow, filters: MarketFilters): boolean {
  if (filters.sport && filters.sport !== "all" && row.event.sport !== filters.sport) return false;
  if (filters.country && filters.country !== "all" && row.event.country !== filters.country) return false;
  if (filters.competition && filters.competition !== "all" && row.event.competition !== filters.competition) return false;
  if (filters.status && filters.status !== "all" && row.event.status !== filters.status) return false;
  if (filters.signal && filters.signal !== "all" && row.market.signal.level !== filters.signal) return false;
  // minVolume/volumeAcceleration filters are meaningless without real
  // volume data — never applied here, rather than silently excluding
  // everything or including everything arbitrarily.
  if (filters.oddsMin != null || filters.oddsMax != null) {
    const values = Object.values(row.market.currentOdds);
    if (values.length === 0) return false;
    const shortest = Math.min(...values);
    if (filters.oddsMin != null && shortest < filters.oddsMin) return false;
    if (filters.oddsMax != null && shortest > filters.oddsMax) return false;
  }
  if (filters.movement === "shortening" && row.movementPercent >= 0) return false;
  if (filters.movement === "drifting" && row.movementPercent <= 0) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${row.event.homeTeam} ${row.event.awayTeam} ${row.event.competition} ${row.event.country} ${row.market.name}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export class ApiFootballProvider implements MarketDataProvider {
  private async rows(): Promise<MarketRow[]> {
    const events = await fetchEventsForProvider();
    const rows: MarketRow[] = [];
    for (const event of events) {
      const row = toMarketRow(event);
      if (row) rows.push(row);
    }
    return rows;
  }

  async getStatus() {
    const provider = await db.provider.findUnique({ where: { name: PROVIDER_NAME } });
    return {
      available: Boolean(provider?.lastSyncedAt),
      providerName: "api-football",
      lastUpdated: provider?.lastSyncedAt?.toISOString(),
      hasVolumeData: false,
    };
  }

  async getOverviewKpis(): Promise<OverviewKpis> {
    const rows = await this.rows();
    const highActivity = rows.filter((r) => r.market.signal.level === "high" || r.market.signal.level === "extreme").length;
    const majorMovements = rows.filter((r) => Math.abs(r.movementPercent) >= 10).length;
    const signalsDetected = rows.filter((r) => r.market.signal.level !== "normal").length;
    return {
      marketsMonitored: rows.length,
      highActivity,
      majorMovements,
      volumeTracked: 0,
      signalsDetected,
      // No deltas — a fresh sync has no honest "vs yesterday" comparison yet.
    };
  }

  async getMarketPulse(): Promise<MarketPulseBucket[]> {
    const rows = await this.rows();
    const total = rows.length || 1;
    const counts: Record<SignalLevel, number> = { normal: 0, watch: 0, elevated: 0, high: 0, extreme: 0 };
    for (const row of rows) counts[row.market.signal.level] += 1;
    const labels: Record<SignalLevel, string> = {
      normal: "Normal",
      watch: "Watch",
      elevated: "Elevated",
      high: "High",
      extreme: "Extreme",
    };
    return (Object.keys(counts) as SignalLevel[]).map((level) => ({
      level,
      label: labels[level],
      percent: Math.round((counts[level] / total) * 100),
    }));
  }

  /** No real volume series exists — an honest empty chart, not a fabricated one. */
  async getMarketActivity() {
    return [];
  }

  async getTopMovements(limit = 12): Promise<MarketRow[]> {
    const rows = await this.rows();
    return [...rows].sort((a, b) => Math.abs(b.movementPercent) - Math.abs(a.movementPercent)).slice(0, limit);
  }

  /** Built from real odds snapshots only — empty until a market has more than one real fetch behind it. */
  async getLiveFeed(limit = 14): Promise<FeedEvent[]> {
    const rows = await this.rows();
    const events: FeedEvent[] = [];
    for (const row of rows) {
      for (const tl of row.market.timeline) {
        events.push({
          id: `${row.market.id}-${tl.id}`,
          timestamp: tl.timestamp,
          marketId: row.market.id,
          eventLabel: `${row.event.homeTeam} vs ${row.event.awayTeam}`,
          type: tl.type,
          label: tl.label,
          severity: tl.severity ?? "watch",
        });
      }
    }
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }

  async listMarkets(filters: MarketFilters = {}): Promise<MarketRow[]> {
    const rows = await this.rows();
    return rows.filter((row) => matchesFilters(row, filters));
  }

  /** No matched-volume data with this provider — always empty, never faked. */
  async listMoneyway(_sort: MoneywaySort = "highest-matched", _filters: MarketFilters = {}): Promise<MarketRow[]> {
    return [];
  }

  async getMarket(id: string): Promise<MarketRow | undefined> {
    const rows = await this.rows();
    return rows.find((row) => row.market.id === id);
  }

  async getCompetitions(): Promise<Competition[]> {
    const provider = await db.provider.findUnique({ where: { name: PROVIDER_NAME }, include: { competitions: true } });
    return (provider?.competitions ?? []).map((c) => ({ id: c.id, sport: "football", country: c.country, name: c.name }));
  }

  /** Alerts derived from real, significant price movements only — no invented triggers. */
  async getAlerts(): Promise<Alert[]> {
    const rows = await this.rows();
    return rows
      .filter((row) => Math.abs(row.movementPercent) >= 5)
      .map((row) => ({
        id: `${row.market.id}-alert`,
        timestamp: row.market.lastUpdated,
        sport: row.event.sport,
        competition: row.event.competition,
        match: `${row.event.homeTeam} vs ${row.event.awayTeam}`,
        market: row.market.name,
        trigger: "odds-drop" as const,
        title: "Sharp price movement",
        description: `Odds moved ${row.movementPercent > 0 ? "+" : ""}${row.movementPercent}% from the opening bookmaker price.`,
        value: `${row.movementPercent > 0 ? "+" : ""}${row.movementPercent}%`,
        score: row.market.signal.score,
        severity: row.market.signal.level,
        eventId: row.event.id,
        marketId: row.market.id,
      }));
  }

  async getAnalytics(): Promise<AnalyticsSummary> {
    const rows = await this.rows();
    const bySeverity: Record<SignalLevel, number> = { normal: 0, watch: 0, elevated: 0, high: 0, extreme: 0 };
    const byCompetition = new Map<string, number>();
    for (const row of rows) {
      bySeverity[row.market.signal.level] += 1;
      if (row.market.signal.level !== "normal") {
        byCompetition.set(row.event.competition, (byCompetition.get(row.event.competition) ?? 0) + 1);
      }
    }
    const avgMovement = rows.length
      ? round2(rows.reduce((sum, r) => sum + Math.abs(r.movementPercent), 0) / rows.length)
      : 0;
    return {
      marketsMonitored: rows.length,
      signalsGenerated: rows.filter((r) => r.market.signal.level !== "normal").length,
      extremeSignals: bySeverity.extreme,
      averageMovement: avgMovement,
      volumeMonitored: 0,
      signalsByDay: [], // needs multi-day real history — not fabricated from one day of sync
      signalsBySeverity: (Object.keys(bySeverity) as SignalLevel[]).map((level) => ({ level, count: bySeverity[level] })),
      signalsByCompetition: [...byCompetition.entries()].map(([competition, count]) => ({ competition, count })),
      largestMovements: [...rows].sort((a, b) => Math.abs(b.movementPercent) - Math.abs(a.movementPercent)).slice(0, 8),
      highestVolumeMarkets: [], // no volume data with this provider
    };
  }

  async getFilterOptions(): Promise<FilterOptions> {
    const rows = await this.rows();
    const countries = new Set<string>();
    const competitions = new Set<string>();
    const marketNames = new Set<string>();
    for (const row of rows) {
      countries.add(row.event.country);
      competitions.add(row.event.competition);
      marketNames.add(row.market.name);
    }
    return { sports: ["football"], countries: [...countries].sort(), competitions: [...competitions].sort(), marketNames: [...marketNames].sort() };
  }

  /**
   * No client-side tick simulation — real data only changes when the
   * server-side sync job runs (see api-football-sync.ts), which is
   * manually triggered, not a constant stream. Faking a tick here would
   * mean animating numbers that haven't actually changed.
   */
  subscribeToTicks(_onTick: (ticks: MarketTick[]) => void): () => void {
    return () => {};
  }
}
