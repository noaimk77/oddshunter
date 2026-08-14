"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "./animated-number";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A plain string discriminator, not a function — Server Components can pass
 * this across the RSC boundary safely, unlike a callback reference.
 */
export type KpiFormatKind = "number" | "compact-currency" | "percent";

const FORMATTERS: Record<KpiFormatKind, (value: number) => string> = {
  number: (v) => Math.round(v).toLocaleString("en-US"),
  "compact-currency": (v) => `€${formatCompactNumber(v)}`,
  percent: (v) => formatPercent(v),
};

interface KpiCardProps {
  label: string;
  value: number;
  formatKind?: KpiFormatKind;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
  index?: number;
}

export function KpiCard({ label, value, formatKind = "number", delta, deltaLabel, icon, index = 0 }: KpiCardProps) {
  const format = FORMATTERS[formatKind];
  const positive = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-border/70 bg-card/50 p-5 transition-colors hover:border-border hover:bg-card/80"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon}
      </div>
      <div className="mt-3 font-mono text-[28px] leading-none font-semibold tabular-nums text-foreground">
        <AnimatedNumber value={value} format={format} animateOnMount />
      </div>
      {delta !== undefined && (
        <div
          className={cn(
            "mt-2.5 inline-flex items-center gap-1 text-xs font-medium",
            positive ? "text-emerald-400" : "text-red-400"
          )}
        >
          {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          <span className="tabular-nums">{Math.abs(delta).toFixed(1)}%</span>
          {deltaLabel && <span className="font-normal text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
    </motion.div>
  );
}
