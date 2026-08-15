"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, CalendarX } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatClock, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FixtureRow } from "@/types";

type DayTab = "live" | "today" | "tomorrow" | "upcoming";

const DAY_TABS: { value: DayTab; label: string }[] = [
  { value: "live", label: "En direct" },
  { value: "today", label: "Aujourd'hui" },
  { value: "tomorrow", label: "Demain" },
  { value: "upcoming", label: "À venir" },
];

function dateKeyUTC(iso: string): string {
  return iso.slice(0, 10);
}

interface Group {
  label: string;
  rows: FixtureRow[];
}

export function FixturesView({ rows, isDemo }: { rows: FixtureRow[]; isDemo: boolean }) {
  const [dayTab, setDayTab] = useState<DayTab>("today");
  const [country, setCountry] = useState("all");
  const [competition, setCompetition] = useState("all");

  // Lazy initializers run once on first render only — the accepted escape
  // hatch for a one-time "today"/"tomorrow" snapshot without an effect.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [tomorrow] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  });

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country))].sort(), [rows]);
  const competitionsForCountry = useMemo(() => {
    const pool = country === "all" ? rows : rows.filter((r) => r.country === country);
    return [...new Set(pool.map((r) => r.competition))].sort();
  }, [rows, country]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (country !== "all" && r.country !== country) return false;
      if (competition !== "all" && r.competition !== competition) return false;
      if (dayTab === "live") return r.status === "live";
      if (dayTab === "upcoming") return r.status === "upcoming";
      if (dayTab === "today") return dateKeyUTC(r.kickoff) === today;
      return dateKeyUTC(r.kickoff) === tomorrow; // "tomorrow"
    });
  }, [rows, country, competition, dayTab, today, tomorrow]);

  const groups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const aLive = a.status === "live" ? 0 : 1;
      const bLive = b.status === "live" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });

    const map = new Map<string, Group>();
    for (const r of sorted) {
      const key = `${r.country} · ${r.competition}`;
      const existing = map.get(key);
      if (existing) existing.rows.push(r);
      else map.set(key, { label: key, rows: [r] });
    }

    return [...map.values()].sort((a, b) => {
      const aLive = a.rows[0].status === "live" ? 0 : 1;
      const bLive = b.rows[0].status === "live" ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return new Date(a.rows[0].kickoff).getTime() - new Date(b.rows[0].kickoff).getTime();
    });
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
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-transparent bg-secondary text-foreground"
                    : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Pays</Label>
            <Select
              value={country}
              onValueChange={(v) => {
                setCountry(v ?? "all");
                setCompetition("all");
              }}
            >
              <SelectTrigger className="h-8 w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les pays</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Compétition</Label>
            <Select value={competition} onValueChange={(v) => setCompetition(v ?? "all")}>
              <SelectTrigger className="h-8 w-[13rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les compétitions</SelectItem>
                {competitionsForCountry.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={CalendarX} title="Aucun match dans cette sélection" description="Essayez un autre onglet, pays ou compétition." />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label} className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {g.rows.length} match{g.rows.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-border/60">
                {g.rows.map((r) => {
                  const inner = (
                    <>
                      <div className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                        {r.status === "live" ? <LiveIndicator real={!isDemo} /> : formatClock(r.kickoff)}
                      </div>
                      <div className="min-w-0 flex-1 text-sm text-foreground">
                        {r.homeTeam} <span className="text-muted-foreground">—</span> {r.awayTeam}
                        {r.status === "finished" && r.homeScore != null && r.awayScore != null && (
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {r.homeScore} - {r.awayScore}
                          </span>
                        )}
                      </div>
                      <div className="hidden shrink-0 sm:block">
                        {r.odds ? (
                          <div className="flex items-center gap-3 font-mono text-xs tabular-nums text-foreground">
                            <span title="Domicile">{formatOdds(r.odds.home)}</span>
                            <span title="Nul" className="text-muted-foreground">
                              {formatOdds(r.odds.draw)}
                            </span>
                            <span title="Extérieur">{formatOdds(r.odds.away)}</span>
                            <span className="text-muted-foreground">{r.odds.bookmaker}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Cotes non récupérées</span>
                        )}
                      </div>
                      {r.marketId ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
                    </>
                  );

                  return r.marketId ? (
                    <Link
                      key={r.id}
                      href={`/market/${r.marketId}`}
                      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/30"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
