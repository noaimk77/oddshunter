"use client";

import { motion } from "framer-motion";
import type { MarketPulseBucket } from "@/types";
import { SIGNAL_META } from "@/lib/signal";

/**
 * A segmented radial ring rather than a plain donut chart — each signal
 * band renders as its own rounded arc with a visible gap from its
 * neighbors, closer to a terminal dial than a generic SaaS pie chart.
 */
export function MarketPulse({ buckets }: { buckets: MarketPulseBucket[] }) {
  const dominant = [...buckets].sort((a, b) => b.percent - a.percent)[0];
  const size = 176;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapPx = (3 / 360) * circumference;

  const segments = buckets.reduce<{ list: (MarketPulseBucket & { len: number; offset: number })[]; cursor: number }>(
    (acc, b) => {
      const rawLen = (b.percent / 100) * circumference;
      const len = Math.max(0, rawLen - gapPx);
      return {
        list: [...acc.list, { ...b, len, offset: acc.cursor }],
        cursor: acc.cursor + rawLen,
      };
    },
    { list: [], cursor: 0 }
  ).list;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" className="stroke-border/50" />
          {segments.map((seg, i) => (
            <motion.circle
              key={seg.level}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={stroke}
              fill="none"
              stroke={SIGNAL_META[seg.level].hex}
              strokeLinecap="round"
              strokeDasharray={`${seg.len} ${circumference - seg.len}`}
              strokeDashoffset={-seg.offset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{dominant.percent}%</span>
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
