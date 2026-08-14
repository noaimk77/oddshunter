"use client";

import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { MarketPulseBucket } from "@/types";
import { SIGNAL_META } from "@/lib/signal";

export function MarketPulse({ buckets }: { buckets: MarketPulseBucket[] }) {
  const dominant = [...buckets].sort((a, b) => b.percent - a.percent)[0];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-44 w-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={buckets}
              dataKey="percent"
              nameKey="label"
              innerRadius={62}
              outerRadius={82}
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              animationDuration={900}
              animationEasing="ease-out"
            >
              {buckets.map((b) => (
                <Cell key={b.level} fill={SIGNAL_META[b.level].hex} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
            {dominant.percent}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{dominant.label}</span>
        </div>
      </div>

      <div className="mt-6 w-full space-y-3">
        {buckets.map((b, i) => (
          <motion.div
            key={b.level}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-between text-sm"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SIGNAL_META[b.level].hex }} />
              {b.label}
            </span>
            <span className="font-mono tabular-nums text-foreground">{b.percent}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
