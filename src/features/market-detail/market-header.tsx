import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Countdown } from "@/components/shared/countdown";
import { ScoreGauge } from "@/components/shared/score-gauge";
import { SignalBadge } from "@/components/shared/signal-badge";
import { WatchlistButton } from "@/components/shared/watchlist-button";
import { LiveIndicator } from "@/components/shared/live-indicator";
import { DemoDataBadge } from "@/components/shared/demo-data-badge";
import { Badge } from "@/components/ui/badge";
import type { Event, Market } from "@/types";

export function MarketHeader({ event, market }: { event: Event; market: Market }) {
  return (
    <div>
      <Link
        href="/scanner"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to scanner
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {event.country} · {event.competition}
            </p>
            <DemoDataBadge size="sm" />
          </div>
          <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
            {event.homeTeam}
            <span className="text-base font-normal text-muted-foreground">vs</span>
            {event.awayTeam}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {event.status === "live" ? (
              <LiveIndicator />
            ) : event.status === "finished" ? (
              <span>Match finished</span>
            ) : (
              <span>
                Match starts in{" "}
                <Countdown targetIso={event.kickoff} className="font-mono tabular-nums text-foreground" />
              </span>
            )}
            {market.status !== "open" && (
              <Badge variant="outline" className="border-signal-high/30 text-signal-high">
                {market.status === "suspended" ? "Suspended" : "Closed"}
              </Badge>
            )}
            <WatchlistButton marketId={market.id} className="ml-1" />
          </div>
        </div>

        <div className="flex items-center gap-5 rounded-lg border border-border/70 bg-card/50 p-4">
          <ScoreGauge score={market.signal.score} level={market.signal.level} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Market Signal</p>
            <SignalBadge level={market.signal.level} className="mt-1.5" />
            <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Anomaly Score
            </p>
            <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {market.signal.score} <span className="text-sm font-normal text-muted-foreground">/ 100</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
