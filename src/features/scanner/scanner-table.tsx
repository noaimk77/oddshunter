"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/shared/clickable-row";
import { Movement } from "@/components/shared/movement";
import { SignalBadge } from "@/components/shared/signal-badge";
import { WatchlistButton } from "@/components/shared/watchlist-button";
import { FlashCell } from "@/components/shared/flash-cell";
import { EmptyState } from "@/components/shared/empty-state";
import { formatClock, formatCurrency, formatOdds } from "@/lib/format";
import { getFavoriteRunner } from "@/lib/market";
import { cn } from "@/lib/utils";
import type { MarketRow } from "@/types";
import { SearchX } from "lucide-react";

const LIQUIDITY_LABEL: Record<MarketRow["market"]["liquidity"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function ScannerTable({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No markets match these filters"
        description="Try widening your filters or clearing the search to see more markets."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs text-muted-foreground">Match</TableHead>
            <TableHead className="text-xs text-muted-foreground">League</TableHead>
            <TableHead className="text-xs text-muted-foreground">Start</TableHead>
            <TableHead className="text-xs text-muted-foreground">Market</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Open</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Current</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Movement</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Volume</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Vol. Δ</TableHead>
            <TableHead className="text-xs text-muted-foreground">Liquidity</TableHead>
            <TableHead className="text-xs text-muted-foreground">Signal</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Score</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
              const favorite = getFavoriteRunner(row.market);
              const urgent = row.market.signal.level === "high" || row.market.signal.level === "extreme";
              return (
                <ClickableRow key={row.market.id} href={`/market/${row.market.id}`}>
                  <TableCell className="font-medium text-foreground">
                    {row.event.homeTeam} <span className="text-muted-foreground">—</span> {row.event.awayTeam}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                    {row.event.country} · {row.event.league}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.event.status === "live" ? (
                      <span className="text-emerald-400">LIVE</span>
                    ) : (
                      formatClock(row.event.startTime)
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.market.name}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {formatOdds(row.market.openingOdds[favorite.id])}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium tabular-nums text-foreground">
                    <FlashCell watchValue={row.market.currentOdds[favorite.id]}>
                      {formatOdds(row.market.currentOdds[favorite.id])}
                    </FlashCell>
                  </TableCell>
                  <TableCell className="text-right">
                    <FlashCell watchValue={row.movementPercent} direction={row.movementPercent < 0 ? "up" : "down"}>
                      <Movement percent={row.movementPercent} className="justify-end" />
                    </FlashCell>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                    <FlashCell watchValue={row.market.matchedVolume}>{formatCurrency(row.market.matchedVolume)}</FlashCell>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-emerald-400/90">
                    <FlashCell watchValue={row.market.volumeDelta15m}>
                      +{formatCurrency(row.market.volumeDelta15m)}
                    </FlashCell>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-xs",
                        row.market.liquidity === "low" ? "text-orange-400" : "text-muted-foreground"
                      )}
                    >
                      {LIQUIDITY_LABEL[row.market.liquidity]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <SignalBadge level={row.market.signal.level} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm font-semibold tabular-nums",
                      urgent ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {row.market.signal.score}
                  </TableCell>
                  <TableCell>
                    <WatchlistButton marketId={row.market.id} size="sm" />
                  </TableCell>
                </ClickableRow>
              );
            })}
        </TableBody>
      </Table>
    </div>
  );
}
