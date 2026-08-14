"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Market } from "@/types";
import { formatClock, formatCurrency } from "@/lib/format";

export function VolumeHistoryChart({ market }: { market: Market }) {
  const data = useMemo(() => {
    const slice = market.volumeHistory.slice(-48);
    return slice.map((snap) => ({ label: formatClock(snap.timestamp), volume: snap.volume }));
  }, [market]);

  const avg = data.reduce((sum, d) => sum + d.volume, 0) / (data.length || 1);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={50}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}K`}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="mt-0.5 font-mono font-medium text-foreground">
                    {formatCurrency(payload[0].value as number)}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="volume" radius={[3, 3, 0, 0]} animationDuration={600}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.volume > avg * 2.2 ? "#f87171" : d.volume > avg * 1.5 ? "#fb923c" : "#10b981"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
