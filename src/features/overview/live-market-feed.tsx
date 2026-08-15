"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, TrendingDown, Zap } from "lucide-react";
// Deliberately NOT importing from "@/services" (the barrel) here — that
// module also constructs ApiFootballProvider/BetfairProvider, which pull in
// the Postgres driver (Node-only: fs/net/tls/dns). Any Client Component
// that imports the barrel drags that whole graph into the browser bundle
// and fails to compile. Ticking is a demo-only, client-only animation, so
// it imports the mock provider directly instead — safe to bundle, and the
// only implementation that does real client-side tick work anyway.
import { MockMarketDataProvider } from "@/services/mock-market-data-provider";
import type { MarketTick } from "@/services/market-data-provider";
import { getFavoriteRunner, getLeadingMoneyRunner } from "@/lib/market";
import { formatCurrency, formatOdds, formatRelativeTime } from "@/lib/format";
import { SIGNAL_META } from "@/lib/signal";
import { cn } from "@/lib/utils";
import type { FeedEvent } from "@/types";

const TYPE_ICON = {
  "odds-move": TrendingDown,
  volume: Zap,
  "volume-spike": Zap,
  signal: ArrowLeftRight,
} as const;

function synthesizeFeedEvent(tick: MarketTick): FeedEvent {
  const { row } = tick;
  const favorite = getFavoriteRunner(row.market);
  const leadingMoney = getLeadingMoneyRunner(row.market);
  const eventLabel = `${row.event.homeTeam} vs ${row.event.awayTeam}`;
  const concentration = row.market.moneyDistribution[leadingMoney.id];

  if (Math.abs(row.movementPercent) > 6) {
    return {
      id: `live-${row.market.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      marketId: row.market.id,
      eventLabel,
      type: "odds-move",
      label: `Odds moved ${formatOdds(row.market.openingOdds[favorite.id])} → ${formatOdds(row.market.currentOdds[favorite.id])}`,
      severity: row.market.signal.level,
    };
  }

  if (concentration >= 65) {
    return {
      id: `live-${row.market.id}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      marketId: row.market.id,
      eventLabel,
      type: "signal",
      label: `Market concentration ${concentration}% ${leadingMoney.name}`,
      severity: row.market.signal.level,
    };
  }

  return {
    id: `live-${row.market.id}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    marketId: row.market.id,
    eventLabel,
    type: "volume",
    label: `Volume spike +${formatCurrency(row.market.volumeDelta15m)} / 15 min`,
    severity: row.market.signal.level,
  };
}

export function LiveMarketFeed({ initialFeed, isDemo }: { initialFeed: FeedEvent[]; isDemo: boolean }) {
  const [feed, setFeed] = useState(initialFeed);
  const tickCounter = useRef(0);

  useEffect(() => {
    // Real providers have no client-side tick simulation to subscribe to —
    // their data only changes when the server-side sync job runs. Only the
    // mock provider animates here, and only when it's actually the active
    // source (never fabricate movement on top of real data).
    if (!isDemo) return;
    const unsubscribe = new MockMarketDataProvider().subscribeToTicks((ticks) => {
      tickCounter.current += 1;
      // One feed entry per tick cycle keeps the feed legible instead of
      // flooding it with every simultaneous market nudge.
      const featured = [...ticks].sort((a, b) => Math.abs(b.row.movementPercent) - Math.abs(a.row.movementPercent))[0];
      if (!featured) return;
      setFeed((prev) => [synthesizeFeedEvent(featured), ...prev].slice(0, 18));
    });
    return unsubscribe;
  }, [isDemo]);

  return (
    <div className="max-h-[22rem] space-y-1 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {feed.map((item) => {
          const Icon = TYPE_ICON[item.type];
          const meta = SIGNAL_META[item.severity];
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-secondary/40"
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md border", meta.soft)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">{item.label}</p>
                <p className="truncate text-xs text-muted-foreground">{item.eventLabel}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatRelativeTime(item.timestamp)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
