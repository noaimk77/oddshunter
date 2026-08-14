"use client";

import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { AnomalyReason, SignalLevel } from "@/types";

const SEVERITY_SCORE: Record<SignalLevel, number> = {
  normal: 12,
  watch: 32,
  elevated: 55,
  high: 80,
  extreme: 98,
};

export function AnomalyRadar({ reasons }: { reasons: AnomalyReason[] }) {
  const data = reasons.map((r) => ({ subject: r.label, value: SEVERITY_SCORE[r.severity] }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
          <Radar
            dataKey="value"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.28}
            strokeWidth={2}
            animationDuration={700}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
