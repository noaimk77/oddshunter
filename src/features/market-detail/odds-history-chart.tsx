"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Market } from "@/types";
import { formatClock, formatOdds } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIMEFRAMES = [
  { label: "1H", points: 4 },
  { label: "3H", points: 12 },
  { label: "6H", points: 24 },
  { label: "12H", points: 48 },
  { label: "24H", points: 96 },
  { label: "ALL", points: 96 },
] as const;

const RUNNER_COLORS: Record<string, string> = {
  home: "#f5b800",
  over: "#f5b800",
  draw: "#38bdf8",
  away: "#ff8a00",
  under: "#ff8a00",
};

export function OddsHistoryChart({ market }: { market: Market }) {
  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]["label"]>("6H");
  const points = TIMEFRAMES.find((t) => t.label === timeframe)!.points;

  const data = useMemo(() => {
    const slice = market.oddsHistory.slice(-points);
    return slice.map((snap) => {
      const row: Record<string, number | string> = { label: formatClock(snap.timestamp) };
      for (const runner of market.runners) row[runner.position] = snap.values[runner.id];
      return row;
    });
  }, [market, points]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs">
          {market.runners.map((r) => (
            <span key={r.id} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RUNNER_COLORS[r.position] }} />
              {r.name}
            </span>
          ))}
        </div>
        <div className="flex gap-0.5 rounded-md border border-border/70 p-0.5">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setTimeframe(t.label)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                timeframe === t.label ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(2)}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 text-muted-foreground">{label}</div>
                    {payload.map((p) => (
                      <div key={p.dataKey as string} className="flex items-center justify-between gap-4 font-mono">
                        <span className="mr-3 capitalize" style={{ color: p.color }}>
                          {p.dataKey as string}
                        </span>
                        <span className="text-foreground">{formatOdds(p.value as number)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {market.runners.map((r) => (
              <Line
                key={r.id}
                type="monotone"
                dataKey={r.position}
                stroke={RUNNER_COLORS[r.position]}
                strokeWidth={2}
                dot={false}
                isAnimationActive
                animationDuration={500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
