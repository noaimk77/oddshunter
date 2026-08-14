"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SIGNAL_META } from "@/lib/signal";
import { SPORT_LABELS } from "@/features/scanner/filter-types";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
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
          <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SignalsByLeagueChart({ data }: { data: AnalyticsSummary["signalsByLeague"] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="league"
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
          <Bar dataKey="count" fill="#22d3ee" radius={[0, 4, 4, 0]} animationDuration={600} />
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

export function VolumeDistributionChart({ data }: { data: AnalyticsSummary["volumeDistribution"] }) {
  const chartData = data.map((d) => ({ ...d, label: SPORT_LABELS[d.sport] }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `€${formatCompactNumber(v)}`}
            width={50}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="text-muted-foreground">{label}</div>
                  <div className="font-mono font-medium text-foreground">
                    {formatCurrency(payload[0].value as number)}
                  </div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="volume" fill="#a78bfa" radius={[4, 4, 0, 0]} animationDuration={600} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
