"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { AnomalyMetrics } from "@/types";

const LABELS: Record<keyof AnomalyMetrics, string> = {
  priceAnomaly: "Price",
  volumeAnomaly: "Volume",
  velocity: "Velocity",
  concentration: "Concentration",
  liquidityAnomaly: "Liquidity",
};

export function AnomalyRadar({ breakdown }: { breakdown: AnomalyMetrics }) {
  const data = (Object.keys(LABELS) as (keyof AnomalyMetrics)[]).map((key) => ({
    subject: LABELS[key],
    value: breakdown[key],
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <Radar dataKey="value" stroke="#f5b800" fill="#f5b800" fillOpacity={0.28} strokeWidth={2} animationDuration={700} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
