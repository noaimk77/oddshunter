import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClickableRow } from "@/components/shared/clickable-row";
import { Movement } from "@/components/shared/movement";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatOdds } from "@/lib/format";
import { getLeadingMoneyRunner } from "@/lib/market";
import type { MarketRow } from "@/types";
import { Wallet } from "lucide-react";

export function MoneywayTable({ rows }: { rows: MarketRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={Wallet} title="No matching markets" description="Try widening your filters." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs text-muted-foreground">Selection</TableHead>
            <TableHead className="text-xs text-muted-foreground">Match</TableHead>
            <TableHead className="text-xs text-muted-foreground">Competition</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Odds</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Matched</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Market %</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Recent Volume</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Vol. Velocity</TableHead>
            <TableHead className="text-right text-xs text-muted-foreground">Movement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const leading = getLeadingMoneyRunner(row.market);
            return (
              <ClickableRow key={row.market.id} href={`/market/${row.market.id}`}>
                <TableCell className="font-medium text-foreground">
                  {leading.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{row.market.name}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {row.event.homeTeam} — {row.event.awayTeam}
                </TableCell>
                <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                  {row.event.country} · {row.event.competition}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                  {formatOdds(row.market.currentOdds[leading.id])}
                </TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                  {formatCurrency(row.market.matchedVolume)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-gold">
                  {row.market.moneyDistribution[leading.id]}%
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  +{formatCurrency(row.market.volumeDelta15m)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(row.market.liquidityMetrics.volumeVelocity)}/min
                </TableCell>
                <TableCell className="text-right">
                  <Movement percent={row.movementPercent} className="justify-end" />
                </TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
