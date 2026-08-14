import { SIGNAL_META } from "@/lib/signal";
import { cn } from "@/lib/utils";
import type { SignalLevel } from "@/types";

export function SignalBadge({
  level,
  className,
  showDot = true,
  size = "default",
}: {
  level: SignalLevel;
  className?: string;
  showDot?: boolean;
  size?: "default" | "sm";
}) {
  const meta = SIGNAL_META[level];
  const urgent = level === "high" || level === "extreme";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border font-medium uppercase tracking-wide",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        meta.soft,
        className
      )}
    >
      {showDot && (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot, urgent && "signal-pulse")} />
      )}
      {meta.label}
    </span>
  );
}
