import Link from "next/link";
import { Activity, ArrowLeftRight, TrendingDown, Zap } from "lucide-react";
import { FadeIn } from "@/components/shared/fade-in";
import { SignalBadge } from "@/components/shared/signal-badge";
import { SIGNAL_META } from "@/lib/signal";
import { formatRelativeTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Alert } from "@/types";
import { MOCK_NOW } from "@/data/mock-generator";

const TYPE_ICON: Record<Alert["type"], typeof Zap> = {
  "odds-drop": TrendingDown,
  "volume-spike": Zap,
  "money-shift": ArrowLeftRight,
  "high-activity": Activity,
};

export function AlertFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="divide-y divide-border/70">
      {alerts.map((alert, i) => {
        const Icon = TYPE_ICON[alert.type];
        const meta = SIGNAL_META[alert.level];
        return (
          <FadeIn key={alert.id} delay={Math.min(i * 0.03, 0.4)}>
            <Link
              href={`/market/${alert.marketId}`}
              className="flex items-center gap-4 px-1 py-3.5 transition-colors hover:bg-secondary/30 sm:px-2"
            >
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", meta.soft)}>
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SignalBadge level={alert.level} size="sm" showDot={false} />
                  <span className="text-sm font-medium text-foreground">{alert.title}</span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{alert.description}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                  {alert.eventLabel} · {alert.league}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-xs text-muted-foreground" title={formatTime(alert.timestamp)}>
                  {formatRelativeTime(alert.timestamp, MOCK_NOW)}
                </p>
                <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                  {alert.score}
                </p>
              </div>
            </Link>
          </FadeIn>
        );
      })}
    </div>
  );
}
