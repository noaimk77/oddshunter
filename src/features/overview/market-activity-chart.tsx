"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketActivityPoint } from "@/types";
import { formatCompactNumber, formatTime } from "@/lib/format";

export function MarketActivityChart({ data }: { data: MarketActivityPoint[] }) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.timestamp) }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="marketActivityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5b800" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#f5b800" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 6" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={3}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `€${formatCompactNumber(v)}`}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                  <div className="text-muted-foreground">{label}</div>
                  <div className="mt-0.5 font-mono font-medium text-foreground">
                    €{formatCompactNumber(payload[0]?.value as number)} matched
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="#f5b800"
            strokeWidth={2}
            fill="url(#marketActivityFill)"
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
