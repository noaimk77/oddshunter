import { MOCK_DATASET } from "@/data/mock-generator";
import { sortMoneywayRows } from "@/lib/market";
import type { FeedEvent, MarketRow } from "@/types";
import type {
  FilterOptions,
  MarketDataProvider,
  MarketFilters,
  MarketTick,
  MoneywaySort,
} from "./market-data-provider";

const round2 = (n: number) => Math.round(n * 100) / 100;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function nudgeRow(row: MarketRow): MarketRow {
  const runners = row.market.runners;
  const currentOdds = { ...row.market.currentOdds };
  const target = runners.reduce((min, r) => (currentOdds[r.id] < currentOdds[min.id] ? r : min), runners[0]);
  const delta = (Math.random() - 0.48) * 0.028;
  currentOdds[target.id] = Math.max(1.01, round2(currentOdds[target.id] * (1 + delta)));

  const volumeBump = Math.round(row.market.matchedVolume * (0.0015 + Math.random() * 0.007));
  const matchedVolume = row.market.matchedVolume + volumeBump;
  const volumeDelta15m = row.market.volumeDelta15m + volumeBump;

  let movementPercent = 0;
  for (const runner of runners) {
    const open = row.market.openingOdds[runner.id];
    const cur = currentOdds[runner.id];
    const pct = ((cur - open) / open) * 100;
    if (Math.abs(pct) > Math.abs(movementPercent)) movementPercent = pct;
  }

  return {
    event: row.event,
    market: {
      ...row.market,
      currentOdds,
      matchedVolume,
      volumeDelta15m,
      lastUpdated: new Date().toISOString(),
    },
    movementPercent: round2(movementPercent),
  };
}

function matchesFilters(row: MarketRow, filters: MarketFilters): boolean {
  if (filters.sport && filters.sport !== "all" && row.event.sport !== filters.sport) return false;
  if (filters.country && filters.country !== "all" && row.event.country !== filters.country) return false;
  if (filters.competition && filters.competition !== "all" && row.event.competition !== filters.competition) return false;
  if (filters.status && filters.status !== "all" && row.event.status !== filters.status) return false;
  if (filters.signal && filters.signal !== "all" && row.market.signal.level !== filters.signal) return false;
  if (filters.minVolume && row.market.matchedVolume < filters.minVolume) return false;
  if (filters.oddsMin != null || filters.oddsMax != null) {
    const shortest = Math.min(...Object.values(row.market.currentOdds));
    if (filters.oddsMin != null && shortest < filters.oddsMin) return false;
    if (filters.oddsMax != null && shortest > filters.oddsMax) return false;
  }
  if (filters.movement === "shortening" && row.movementPercent >= 0) return false;
  if (filters.movement === "drifting" && row.movementPercent <= 0) return false;
  if (filters.volumeAcceleration === "accelerating") {
    const accelReason = row.market.signal.reasons.find((r) => r.key === "volume-acceleration");
    if (!accelReason || (accelReason.severity !== "high" && accelReason.severity !== "extreme")) return false;
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = `${row.event.homeTeam} ${row.event.awayTeam} ${row.event.competition} ${row.event.country} ${row.market.name}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export class MockMarketDataProvider implements MarketDataProvider {
  async getStatus() {
    return { available: true, providerName: "mock-dev" };
  }

  async getOverviewKpis() {
    await delay(80);
    return MOCK_DATASET.kpis;
  }

  async getMarketPulse() {
    await delay(80);
    return MOCK_DATASET.marketPulse;
  }

  async getMarketActivity() {
    await delay(80);
    return MOCK_DATASET.marketActivity;
  }

  async getTopMovements(limit = 12) {
    await delay(80);
    return [...MOCK_DATASET.rows]
      .sort((a, b) => Math.abs(b.movementPercent) - Math.abs(a.movementPercent))
      .slice(0, limit);
  }

  async getLiveFeed(limit = 14): Promise<FeedEvent[]> {
    await delay(80);
    const events: FeedEvent[] = [];
    for (const row of MOCK_DATASET.rows) {
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

  async listMarkets(filters: MarketFilters = {}) {
    await delay(60);
    return MOCK_DATASET.rows.filter((row) => matchesFilters(row, filters));
  }

  async listMoneyway(sort: MoneywaySort = "highest-matched", filters: MarketFilters = {}) {
    await delay(60);
    const rows = MOCK_DATASET.rows.filter((row) => matchesFilters(row, filters));
    return sortMoneywayRows(rows, sort);
  }

  async getMarket(id: string) {
    await delay(60);
    return MOCK_DATASET.rows.find((row) => row.market.id === id);
  }

  async getCompetitions() {
    await delay(40);
    return MOCK_DATASET.competitions;
  }

  async getAlerts() {
    await delay(80);
    return MOCK_DATASET.alerts;
  }

  async getAnalytics() {
    await delay(80);
    return MOCK_DATASET.analytics;
  }

  async getFilterOptions(): Promise<FilterOptions> {
    await delay(40);
    const sports = new Set<string>();
    const countries = new Set<string>();
    const competitions = new Set<string>();
    const marketNames = new Set<string>();
    for (const row of MOCK_DATASET.rows) {
      sports.add(row.event.sport);
      countries.add(row.event.country);
      competitions.add(row.event.competition);
      marketNames.add(row.market.name);
    }
    return {
      sports: [...sports] as FilterOptions["sports"],
      countries: [...countries].sort(),
      competitions: [...competitions].sort(),
      marketNames: [...marketNames].sort(),
    };
  }

  subscribeToTicks(onTick: (ticks: MarketTick[]) => void, intervalMs = 3200): () => void {
    if (typeof window === "undefined") return () => {};
    const id = window.setInterval(() => {
      const rows = MOCK_DATASET.rows;
      const count = 2 + Math.floor(Math.random() * 4);
      const usedIdx = new Set<number>();
      const ticks: MarketTick[] = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * rows.length);
        if (usedIdx.has(idx)) continue;
        usedIdx.add(idx);
        const previous = rows[idx];
        const updated = nudgeRow(previous);
        rows[idx] = updated;
        ticks.push({
          marketId: updated.market.id,
          row: updated,
          direction: updated.movementPercent <= previous.movementPercent ? "down" : "up",
        });
      }
      if (ticks.length) onTick(ticks);
    }, intervalMs);
    return () => window.clearInterval(id);
  }
}
