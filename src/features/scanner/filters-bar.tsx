"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FilterOptions } from "@/services";
import { DEFAULT_FILTERS, SPORT_LABELS, type ScannerFilterState } from "./filter-types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-[9.5rem] flex-1 flex-col gap-1.5">
      <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function FiltersBar({
  filters,
  onChange,
  options,
  marketTypes,
}: {
  filters: ScannerFilterState;
  onChange: (next: Partial<ScannerFilterState>) => void;
  options: FilterOptions;
  marketTypes: string[];
}) {
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="rounded-lg border border-border/70 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
        </div>
        {dirty && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </Button>
        )}
      </div>

      <div className="mb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search market, team or league…"
            className="h-9 bg-transparent pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Field label="Sport">
          <Select value={filters.sport} onValueChange={(v) => onChange({ sport: v as ScannerFilterState["sport"] })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sports</SelectItem>
              {options.sports.map((s) => (
                <SelectItem key={s} value={s}>{SPORT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Country">
          <Select value={filters.country} onValueChange={(v) => onChange({ country: v ?? "all" })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {options.countries.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="League">
          <Select value={filters.league} onValueChange={(v) => onChange({ league: v ?? "all" })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All leagues</SelectItem>
              {options.leagues.map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Market">
          <Select value={filters.marketType} onValueChange={(v) => onChange({ marketType: v ?? "all" })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All markets</SelectItem>
              {marketTypes.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Odds range">
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Min"
              value={filters.oddsMin}
              onChange={(e) => onChange({ oddsMin: e.target.value })}
              className="h-9"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Max"
              value={filters.oddsMax}
              onChange={(e) => onChange({ oddsMax: e.target.value })}
              className="h-9"
            />
          </div>
        </Field>

        <Field label="Min. volume (€)">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 5000"
            value={filters.minVolume}
            onChange={(e) => onChange({ minVolume: e.target.value })}
            className="h-9"
          />
        </Field>

        <Field label="Odds movement">
          <Select value={filters.movement} onValueChange={(v) => onChange({ movement: v as ScannerFilterState["movement"] })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="shortening">Shortening</SelectItem>
              <SelectItem value="drifting">Drifting</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Time window">
          <Select value={filters.timeWindow} onValueChange={(v) => onChange({ timeWindow: v as ScannerFilterState["timeWindow"] })}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="1h">Next 1H</SelectItem>
              <SelectItem value="3h">Next 3H</SelectItem>
              <SelectItem value="6h">Next 6H</SelectItem>
              <SelectItem value="12h">Next 12H</SelectItem>
              <SelectItem value="24h">Next 24H</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}
