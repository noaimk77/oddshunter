"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SIGNAL_META } from "@/lib/signal";
import { Movement } from "@/components/shared/movement";
import { formatCurrency } from "@/lib/format";
import { getFavoriteRunner } from "@/lib/market";
import type { AnalyticsSummary } from "@/types";

const tooltipBox = "rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg";

export function SignalsByDayChart({ data }: { data: AnalyticsSummary["signalsByDay"] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-mono font-medium text-foreground">{payload[0].value} signals</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" fill="#f5b800" radius={[4, 4, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignalsByCompetitionChart({ data }: { data: AnalyticsSummary["signalsByCompetition"] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="competition"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-mono font-medium text-foreground">{payload[0].value} signals</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="count" fill="#38bdf8" radius={[0, 4, 4, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignalsBySeverityChart({ data }: { data: AnalyticsSummary["signalsBySeverity"] }) {
  const filtered = data.filter((d) => d.count > 0);
  return (
    <div className="flex items-center gap-6">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="count"
              nameKey="level"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={3}
              stroke="none"
              animationDuration={700}
            >
              {filtered.map((d) => (
                <Cell key={d.level} fill={SIGNAL_META[d.level].hex} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2.5">
        {filtered.map((d) => (
          <div key={d.level} className="flex items-center justify-between gap-6 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SIGNAL_META[d.level].hex }} />
              {SIGNAL_META[d.level].label}
            </span>
            <span className="font-mono tabular-nums text-foreground">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LargestMovementsList({ rows }: { rows: AnalyticsSummary["largestMovements"] }) {
  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => (
        <Link
          key={row.market.id}
          href={`/market/${row.market.id}`}
          className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-gold"
        >
          <span className="min-w-0 truncate text-foreground">
            {row.event.homeTeam} — {row.event.awayTeam}
          </span>
          <Movement percent={row.movementPercent} className="shrink-0" />
        </Link>
      ))}
    </div>
  );
}

export function HighestVolumeMarketsList({ rows }: { rows: AnalyticsSummary["highestVolumeMarkets"] }) {
  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => {
        const favorite = getFavoriteRunner(row.market);
        return (
          <Link
            key={row.market.id}
            href={`/market/${row.market.id}`}
            className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-gold"
          >
            <span className="min-w-0 truncate text-foreground">
              {row.event.homeTeam} — {row.event.awayTeam}
              <span className="ml-1.5 text-xs text-muted-foreground">{favorite.name}</span>
            </span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
              {formatCurrency(row.market.matchedVolume)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
