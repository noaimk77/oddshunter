import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Movement({ percent, className }: { percent: number; className?: string }) {
  if (Math.abs(percent) < 0.05) {
    return (
      <span className={cn("inline-flex items-center gap-1 font-mono text-sm tabular-nums text-muted-foreground", className)}>
        <Minus className="h-3 w-3" />
        {formatPercent(0)}
      </span>
    );
  }
  const shortening = percent < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-sm font-medium tabular-nums",
        shortening ? "text-emerald-400" : "text-orange-400",
        className
      )}
    >
      {shortening ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      {formatPercent(percent, { signed: true })}
    </span>
  );
}
