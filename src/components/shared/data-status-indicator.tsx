import { cn } from "@/lib/utils";

/**
 * Sidebar footer status. Odds Hunter isn't connected to Betfair yet, so this
 * always reads DEMO DATA today — flip to "live" once a real provider lands
 * and nothing else about this component needs to change.
 */
export function DataStatusIndicator({ status = "demo" }: { status?: "demo" | "live" }) {
  const isLive = status === "live";
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-surface-2/60 px-3 py-2">
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            isLive ? "bg-positive" : "bg-signal-watch"
          )}
        />
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", isLive ? "bg-positive" : "bg-signal-watch")} />
      </span>
      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {isLive ? "Live Data" : "Demo Data"}
      </span>
    </div>
  );
}
