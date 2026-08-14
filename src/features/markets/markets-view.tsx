"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ScannerTable } from "@/features/scanner/scanner-table";
import { SPORT_LABELS } from "@/features/scanner/filter-types";
import { cn } from "@/lib/utils";
import type { MarketRow, Sport } from "@/types";

export function MarketsView({ rows }: { rows: MarketRow[] }) {
  const sports = useMemo(() => [...new Set(rows.map((r) => r.event.sport))] as Sport[], [rows]);
  const [sport, setSport] = useState<Sport | "all">("all");

  const filtered = sport === "all" ? rows : rows.filter((r) => r.event.sport === sport);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...sports] as const).map((s) => {
          const active = s === sport;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSport(s)}
              className={cn(
                "relative rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-transparent text-foreground"
                  : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="markets-sport-active"
                  className="absolute inset-0 rounded-md bg-secondary"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative">{s === "all" ? "All sports" : SPORT_LABELS[s]}</span>
            </button>
          );
        })}
      </div>
      <ScannerTable rows={filtered} />
    </div>
  );
}
