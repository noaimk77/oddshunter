import { cn } from "@/lib/utils";

/**
 * Marks a fixture as in its live/in-play phase. The pulsing dot + "Live"
 * label are reserved for `real` — a genuine live data connection — because
 * that combination reads as "this is happening right now for real." Every
 * call site in this app currently runs on the demo dataset, so the default
 * is the neutral, non-pulsing "In-play" treatment: true about match phase
 * within the dataset, without implying a live feed that doesn't exist yet.
 * Flip to `real` once a live provider (e.g. Betfair) is actually connected.
 */
export function LiveIndicator({ className, label, real = false }: { className?: string; label?: string; real?: boolean }) {
  const text = label ?? (real ? "Live" : "In-play");
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {real && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", real ? "bg-positive" : "bg-signal-watch")} />
      </span>
      <span
        className={cn(
          "text-[11px] font-semibold tracking-wide uppercase",
          real ? "text-positive" : "text-signal-watch"
        )}
      >
        {text}
      </span>
    </span>
  );
}
