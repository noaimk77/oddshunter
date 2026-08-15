"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Market } from "@/types";

const COLORS = ["#f5b800", "#38bdf8", "#ff8a00"];

export function MoneyDistribution({ market }: { market: Market }) {
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {market.runners.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ width: 0 }}
            animate={{ width: `${market.moneyDistribution[r.id]}%` }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: COLORS[i % COLORS.length] }}
          />
        ))}
      </div>
      <div className={cn("mt-4 grid gap-4", market.runners.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {market.runners.map((r, i) => (
          <div key={r.id}>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              {r.name}
            </div>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
              {market.moneyDistribution[r.id]}%
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
