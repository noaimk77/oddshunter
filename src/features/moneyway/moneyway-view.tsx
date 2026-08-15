"use client";

import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sortMoneywayRows } from "@/lib/market";
import type { MoneywaySort } from "@/services";
import type { MarketRow } from "@/types";
import { MoneywayTable } from "./moneyway-table";

const SORT_OPTIONS: { value: MoneywaySort; label: string }[] = [
  { value: "highest-matched", label: "Highest Matched" },
  { value: "highest-market-share", label: "Highest Market Share" },
  { value: "biggest-drop", label: "Biggest Odds Drop" },
  { value: "fastest-volume", label: "Fastest Volume Increase" },
  { value: "most-concentrated", label: "Most Concentrated Market" },
];

export function MoneywayView({ rows }: { rows: MarketRow[] }) {
  const [sort, setSort] = useState<MoneywaySort>("highest-matched");
  const sorted = useMemo(() => sortMoneywayRows(rows, sort), [rows, sort]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{sorted.length}</span> selections
        </p>
        <Select value={sort} onValueChange={(v) => setSort(v as MoneywaySort)}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <MoneywayTable rows={sorted} />
    </div>
  );
}
