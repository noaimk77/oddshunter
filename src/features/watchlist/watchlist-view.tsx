"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useWatchlist } from "@/hooks/use-watchlist";
import { ScannerTable } from "@/features/scanner/scanner-table";
import { OddsHunterMascot } from "@/components/shared/odds-hunter-mascot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarketRow } from "@/types";

export function WatchlistView({ allRows, hasVolumeData }: { allRows: MarketRow[]; hasVolumeData: boolean }) {
  const { ids, hydrated, error } = useWatchlist();

  const watchedRows = useMemo(() => allRows.filter((row) => ids.includes(row.market.id)), [allRows, ids]);

  if (!hydrated) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    );
  }

  const errorBanner = error && (
    <p role="alert" className="mb-3 rounded-md border border-signal-extreme/30 bg-signal-extreme/10 px-3 py-2 text-xs text-signal-extreme">
      {error}
    </p>
  );

  if (watchedRows.length === 0) {
    return (
      <div>
        {errorBanner}
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 px-6 py-16 text-center">
          <OddsHunterMascot variant="compact" parallax={false} className="mb-2" />
          <h3 className="text-sm font-medium text-foreground">No markets on your radar yet.</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Add markets from the Scanner or Overview by clicking the star icon to track them here.
          </p>
          <Button render={<Link href="/scanner" />} nativeButton={false} className="mt-5">
            Open Scanner
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {errorBanner}
      <ScannerTable rows={watchedRows} hasVolumeData={hasVolumeData} />
    </div>
  );
}
