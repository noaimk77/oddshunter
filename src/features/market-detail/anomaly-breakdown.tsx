"use client";

import { motion } from "framer-motion";
import type { AnomalyMetrics } from "@/types";

const ROWS: { key: keyof AnomalyMetrics; label: string }[] = [
  { key: "priceAnomaly", label: "Price anomaly" },
  { key: "volumeAnomaly", label: "Volume anomaly" },
  { key: "velocity", label: "Velocity" },
  { key: "concentration", label: "Concentration" },
  { key: "liquidityAnomaly", label: "Liquidity anomaly" },
];

export function AnomalyBreakdown({ breakdown }: { breakdown: AnomalyMetrics }) {
  return (
    <div className="space-y-3.5">
      {ROWS.map((row, i) => {
        const value = Math.min(100, Math.max(0, breakdown[row.key]));
        return (
          <div key={row.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-mono font-medium text-foreground">{Math.round(value)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-gold"
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 0.7, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
