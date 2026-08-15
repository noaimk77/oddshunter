"use client";

import { useEffect, useMemo, useState } from "react";
// Not importing the "@/services" barrel here — it also constructs
// ApiFootballProvider/BetfairProvider, which pull in the Postgres driver
// (Node-only: fs/net/tls/dns) and can't be bundled for the browser. Ticking
// is a demo-only, client-only animation, so it imports the mock provider
// directly instead of the shared singleton.
import { MockMarketDataProvider } from "@/services/mock-market-data-provider";
import type { FilterOptions } from "@/services/market-data-provider";
import type { MarketRow } from "@/types";
import { FiltersBar } from "./filters-bar";
import { SignalTabs } from "./signal-tabs";
import { ScannerTable } from "./scanner-table";
import { DEFAULT_FILTERS, TIME_WINDOW_MS, type ScannerFilterState } from "./filter-types";

export function ScannerView({
  initialRows,
  filterOptions,
  isDemo,
  hasVolumeData,
}: {
  initialRows: MarketRow[];
  filterOptions: FilterOptions;
  isDemo: boolean;
  hasVolumeData: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [filters, setFiltersState] = useState<ScannerFilterState>(DEFAULT_FILTERS);

  const setFilters = (patch: Partial<ScannerFilterState>) => setFiltersState((prev) => ({ ...prev, ...patch }));

  // Lazy initializer runs once on first render only — the accepted escape
  // hatch for a one-time "now" snapshot (setState-in-effect is flagged by
  // the hooks linter as an extra render for no reason).
  const [now] = useState<number>(() => Date.now());

  useEffect(() => {
    // Real providers only change when the server-side sync job runs — no
    // client-side ticking to subscribe to, and simulating one would mean
    // animating numbers that haven't actually moved.
    if (!isDemo) return;
    const unsubscribe = new MockMarketDataProvider().subscribeToTicks((ticks) => {
      setRows((prev) => {
        const next = [...prev];
        for (const tick of ticks) {
          const idx = next.findIndex((r) => r.market.id === tick.marketId);
          if (idx !== -1) next[idx] = tick.row;
        }
        return next;
      });
    });
    return unsubscribe;
  }, [isDemo]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filters.sport !== "all" && row.event.sport !== filters.sport) return false;
      if (filters.country !== "all" && row.event.country !== filters.country) return false;
      if (filters.competition !== "all" && row.event.competition !== filters.competition) return false;
      if (filters.marketType !== "all" && row.market.name !== filters.marketType) return false;
      if (filters.status !== "all" && row.event.status !== filters.status) return false;
      if (filters.signal !== "all" && row.market.signal.level !== filters.signal) return false;
      if (filters.movement === "shortening" && row.movementPercent >= 0) return false;
      if (filters.movement === "drifting" && row.movementPercent <= 0) return false;
      if (filters.volumeAcceleration === "accelerating") {
        const accel = row.market.signal.reasons.find((r) => r.key === "volume-acceleration");
        if (!accel || (accel.severity !== "high" && accel.severity !== "extreme")) return false;
      }
      if (filters.minVolume && row.market.matchedVolume < Number(filters.minVolume)) return false;
      if (filters.oddsMin || filters.oddsMax) {
        const shortest = Math.min(...Object.values(row.market.currentOdds));
        if (filters.oddsMin && shortest < Number(filters.oddsMin)) return false;
        if (filters.oddsMax && shortest > Number(filters.oddsMax)) return false;
      }
      if (filters.timeWindow !== "all") {
        const startMs = new Date(row.event.kickoff).getTime();
        const windowMs = TIME_WINDOW_MS[filters.timeWindow];
        if (row.event.status !== "live" && (startMs < now || startMs - now > windowMs)) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${row.event.homeTeam} ${row.event.awayTeam} ${row.event.competition} ${row.event.country} ${row.market.name}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters, now]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, watch: 0, elevated: 0, high: 0, extreme: 0, normal: 0 };
    for (const row of rows) c[row.market.signal.level] = (c[row.market.signal.level] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      <FiltersBar filters={filters} onChange={setFilters} options={filterOptions} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SignalTabs value={filters.signal} onChange={(v) => setFilters({ signal: v })} counts={counts} />
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{filteredRows.length}</span> markets
        </p>
      </div>
      <ScannerTable rows={filteredRows} hasVolumeData={hasVolumeData} />
    </div>
  );
}
