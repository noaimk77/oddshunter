import { formatClock } from "@/lib/format";
import { SIGNAL_META } from "@/lib/signal";
import { cn } from "@/lib/utils";
import type { MarketTimelineEvent } from "@/types";
import { EmptyState } from "@/components/shared/empty-state";
import { History } from "lucide-react";

export function MarketTimeline({ events }: { events: MarketTimelineEvent[] }) {
  if (events.length === 0) {
    return <EmptyState icon={History} title="No timeline events yet" description="Notable moves will appear here as they happen." />;
  }

  return (
    <ol className="relative space-y-5 pl-5">
      <div className="absolute top-1 bottom-1 left-[3px] w-px bg-border" />
      {events.map((event) => {
        const meta = SIGNAL_META[event.severity ?? "normal"];
        const urgent = event.type === "signal" || event.severity === "high" || event.severity === "extreme";
        return (
          <li key={event.id} className="relative">
            <span
              className={cn(
                "absolute top-1 -left-5 h-1.5 w-1.5 rounded-full",
                meta.dot,
                urgent && "signal-pulse"
              )}
            />
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-muted-foreground">{formatClock(event.timestamp)}</span>
              <span className={cn("text-sm", urgent ? "font-medium text-foreground" : "text-foreground/90")}>
                {event.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
