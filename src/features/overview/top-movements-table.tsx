import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/shared/clickable-row";
import { Movement } from "@/components/shared/movement";
import { SignalBadge } from "@/components/shared/signal-badge";
import { WatchlistButton } from "@/components/shared/watchlist-button";
import { SPORT_LABELS } from "@/features/scanner/filter-types";
import { formatCurrency, formatOdds, formatTime } from "@/lib/format";
import { getFavoriteRunner } from "@/lib/market";
import type { MarketRow } from "@/types";

export function TopMovementsTable({ rows, hasVolumeData = true }: { rows: MarketRow[]; hasVolumeData?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs text-muted-foreground">Time</TableHead>
          <TableHead className="text-xs text-muted-foreground">Sport</TableHead>
          <TableHead className="text-xs text-muted-foreground">Competition</TableHead>
          <TableHead className="text-xs text-muted-foreground">Match</TableHead>
          <TableHead className="text-xs text-muted-foreground">Market</TableHead>
          <TableHead className="text-right text-xs text-muted-foreground">Opening</TableHead>
          <TableHead className="text-right text-xs text-muted-foreground">Current</TableHead>
          <TableHead className="text-right text-xs text-muted-foreground">Movement</TableHead>
          {hasVolumeData && (
            <>
              <TableHead className="text-right text-xs text-muted-foreground">Volume</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Vol. Δ</TableHead>
            </>
          )}
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
            <ClickableRow key={row.market.id} href={`/market/${row.market.id}`} className={urgent ? "bg-signal-high/[0.03]" : undefined}>
              <TableCell className="font-mono text-xs text-muted-foreground">{formatTime(row.event.kickoff)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{SPORT_LABELS[row.event.sport]}</TableCell>
              <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                {row.event.country} · {row.event.competition}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {row.event.homeTeam} <span className="text-muted-foreground">—</span> {row.event.awayTeam}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{row.market.name}</TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                {formatOdds(row.market.openingOdds[favorite.id])}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-medium tabular-nums text-foreground">
                {formatOdds(row.market.currentOdds[favorite.id])}
              </TableCell>
              <TableCell className="text-right">
                <Movement percent={row.movementPercent} className="justify-end" />
              </TableCell>
              {hasVolumeData && (
                <>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                    {formatCurrency(row.market.matchedVolume)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-gold/90">
                    +{formatCurrency(row.market.volumeDelta15m)}
                  </TableCell>
                </>
              )}
              <TableCell>
                <SignalBadge level={row.market.signal.level} />
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-foreground">
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
  );
}
