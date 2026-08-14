import { FadeIn } from "@/components/shared/fade-in";
import { Movement } from "@/components/shared/movement";
import { formatCurrency, formatOdds } from "@/lib/format";
import { getFavoriteRunner } from "@/lib/market";
import { cn } from "@/lib/utils";
import type { Market } from "@/types";

const LIQUIDITY_COPY: Record<Market["liquidity"], { color: string; note: string }> = {
  low: { color: "text-orange-400", note: "Thin order book — larger impact per bet." },
  medium: { color: "text-cyan-400", note: "Moderate order book depth." },
  high: { color: "text-emerald-400", note: "Deep, well-supplied order book." },
};

export function StatBlocks({ market, movementPercent }: { market: Market; movementPercent: number }) {
  const favorite = getFavoriteRunner(market);
  const liquidity = LIQUIDITY_COPY[market.liquidity];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <FadeIn className="rounded-lg border border-border/70 bg-card/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Odds Movement</p>
        <div className="mt-2.5 flex items-baseline gap-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatOdds(market.openingOdds[favorite.id])}
          <span className="text-base text-muted-foreground">→</span>
          {formatOdds(market.currentOdds[favorite.id])}
        </div>
        <Movement percent={movementPercent} className="mt-2.5" />
      </FadeIn>

      <FadeIn delay={0.06} className="rounded-lg border border-border/70 bg-card/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Matched Volume</p>
        <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatCurrency(market.matchedVolume)}
        </p>
        <p className="mt-2.5 text-xs font-medium text-emerald-400">
          +{formatCurrency(market.volumeDelta15m)} last 15m
        </p>
      </FadeIn>

      <FadeIn delay={0.12} className="rounded-lg border border-border/70 bg-card/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Market Liquidity</p>
        <p className={cn("mt-2.5 font-mono text-2xl font-semibold uppercase tabular-nums", liquidity.color)}>
          {market.liquidity}
        </p>
        <p className="mt-2.5 text-xs text-muted-foreground">{liquidity.note}</p>
      </FadeIn>
    </div>
  );
}
