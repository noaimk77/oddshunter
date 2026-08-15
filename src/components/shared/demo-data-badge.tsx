import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown wherever data on screen is synthetic rather than a live feed.
 * Odds Hunter never presents mocked matches, scores, or volume as real —
 * this badge is the explicit signal that the data underneath is demo-only.
 */
export function DemoDataBadge({ className, size = "default" }: { className?: string; size?: "default" | "sm" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-signal-watch/25 bg-signal-watch/10 font-medium uppercase tracking-wider text-signal-watch",
        size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
        className
      )}
    >
      <FlaskConical className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      Demo Data
    </span>
  );
}
