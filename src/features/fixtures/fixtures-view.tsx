"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { SPORT_LABELS } from "@/features/scanner/filter-types";
import { formatClock, formatCurrency } from "@/lib/format";
import { MOCK_NOW } from "@/data/mock-generator";
import { cn } from "@/lib/utils";
import type { Event, MarketRow, Sport } from "@/types";
import { CalendarX } from "lucide-react";

type DayTab = "today" | "live" | "upcoming" | "finished";

const DAY_TABS: { value: DayTab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "live", label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "finished", label: "Finished" },
];

interface EventGroup {
  event: Event;
  markets: MarketRow["market"][];
  totalVolume: number;
}

function groupByEvent(rows: MarketRow[]): EventGroup[] {
  const map = new Map<string, EventGroup>();
  for (const row of rows) {
    const existing = map.get(row.event.id);
    if (existing) {
      existing.markets.push(row.market);
      existing.totalVolume += row.market.matchedVolume;
    } else {
      map.set(row.event.id, { event: row.event, markets: [row.market], totalVolume: row.market.matchedVolume });
    }
  }
  return [...map.values()];
}

const DAY_MS = 24 * 60 * 60_000;

export function FixturesView({ rows }: { rows: MarketRow[] }) {
  const sports = useMemo(() => [...new Set(rows.map((r) => r.event.sport))] as Sport[], [rows]);
  const [dayTab, setDayTab] = useState<DayTab>("today");
  const [sport, setSport] = useState<Sport | "all">("all");

  const groups = useMemo(() => groupByEvent(rows), [rows]);

  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (sport !== "all" && g.event.sport !== sport) return false;
      const kickoffMs = new Date(g.event.kickoff).getTime();
      if (dayTab === "live") return g.event.status === "live";
      if (dayTab === "upcoming") return g.event.status === "upcoming";
      if (dayTab === "finished") return g.event.status === "finished";
      return Math.abs(kickoffMs - MOCK_NOW) <= DAY_MS;
    });
  }, [groups, sport, dayTab]);

  const byCompetition = useMemo(() => {
    const map = new Map<string, EventGroup[]>();
    for (const g of filtered) {
      const key = `${g.event.country} · ${g.event.competition}`;
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {DAY_TABS.map((tab) => {
            const active = tab.value === dayTab;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setDayTab(tab.value)}
                className={cn(
                  "relative rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="fixtures-day-active"
                    className="absolute inset-0 rounded-md bg-secondary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["all", ...sports] as const).map((s) => {
            const active = s === sport;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={cn(
                  "relative rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-transparent text-foreground" : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="fixtures-sport-active"
                    className="absolute inset-0 rounded-md bg-secondary"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{s === "all" ? "All sports" : SPORT_LABELS[s]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {byCompetition.length === 0 ? (
        <EmptyState icon={CalendarX} title="No fixtures in this window" description="Try another tab or sport filter." />
      ) : (
        <div className="space-y-4">
          {byCompetition.map(([label, events]) => (
            <div key={label} className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
                <span className="font-mono text-xs text-muted-foreground">{events.length} fixtures</span>
              </div>
              <div className="divide-y divide-border/60">
                {events.map((g) => (
                  <Link
                    key={g.event.id}
                    href={`/market/${g.markets[0].id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/30"
                  >
                    <div className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                      {g.event.status === "live" ? <LiveIndicator label="Live" /> : formatClock(g.event.kickoff)}
                    </div>
                    <div className="min-w-0 flex-1 text-sm text-foreground">
                      {g.event.homeTeam} <span className="text-muted-foreground">—</span> {g.event.awayTeam}
                    </div>
                    <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {g.markets.length} market{g.markets.length > 1 ? "s" : ""}
                    </div>
                    <div className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                      {formatCurrency(g.totalVolume)}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
