"use client";

import { motion } from "framer-motion";
import { SIGNAL_META } from "@/lib/signal";
import { cn } from "@/lib/utils";
import type { SignalLevel } from "@/types";

const TABS: { value: SignalLevel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watch", label: "Watch" },
  { value: "elevated", label: "Elevated" },
  { value: "high", label: "High" },
  { value: "extreme", label: "Extreme" },
];

export function SignalTabs({
  value,
  onChange,
  counts,
}: {
  value: SignalLevel | "all";
  onChange: (v: SignalLevel | "all") => void;
  counts: Record<string, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TABS.map((tab) => {
        const active = value === tab.value;
        const dotColor = tab.value === "all" ? undefined : SIGNAL_META[tab.value].hex;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-transparent text-foreground"
                : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId="signal-tab-active"
                className="absolute inset-0 rounded-md bg-secondary"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
              {tab.label}
              <span className="text-muted-foreground/70 tabular-nums">{counts[tab.value] ?? 0}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
