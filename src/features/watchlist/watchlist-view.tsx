"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
import { useWatchlist } from "@/hooks/use-watchlist";
import { EmptyState } from "@/components/shared/empty-state";
import { ScannerTable } from "@/features/scanner/scanner-table";
import { Skeleton } from "@/components/ui/skeleton";
import type { MarketRow } from "@/types";

export function WatchlistView({ allRows }: { allRows: MarketRow[] }) {
  const { ids, hydrated } = useWatchlist();

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

  if (watchedRows.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Your watchlist is empty"
        description="Add markets from the Live Scanner or Overview by clicking the star icon to track them here."
      />
    );
  }

  return <ScannerTable rows={watchedRows} />;
}
