import { SIGNAL_META } from "@/lib/signal";
import { cn } from "@/lib/utils";
import type { AnomalyReason } from "@/types";

export function AnomalyAnalysis({ reasons }: { reasons: AnomalyReason[] }) {
  return (
    <div className="divide-y divide-border/70">
      {reasons.map((reason) => {
        const meta = SIGNAL_META[reason.severity];
        return (
          <div key={reason.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div>
              <p className="text-sm text-foreground">{reason.label}</p>
              <p className={cn("mt-0.5 text-xs font-medium", meta.text)}>{reason.description}</p>
            </div>
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
              {reason.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
