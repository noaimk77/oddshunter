import type { EventStatus, SignalLevel, Sport } from "@/types";

export interface ScannerFilterState {
  sport: Sport | "all";
  country: string;
  competition: string;
  marketType: string;
  oddsMin: string;
  oddsMax: string;
  minVolume: string;
  movement: "any" | "shortening" | "drifting";
  volumeAcceleration: "any" | "accelerating";
  timeWindow: "all" | "1h" | "3h" | "6h" | "12h" | "24h";
  status: EventStatus | "all";
  signal: SignalLevel | "all";
  search: string;
}

export const DEFAULT_FILTERS: ScannerFilterState = {
  sport: "all",
  country: "all",
  competition: "all",
  marketType: "all",
  oddsMin: "",
  oddsMax: "",
  minVolume: "",
  movement: "any",
  volumeAcceleration: "any",
  timeWindow: "all",
  status: "all",
  signal: "all",
  search: "",
};

export const SPORT_LABELS: Record<Sport, string> = {
  football: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  "table-tennis": "Table Tennis",
  esports: "Esports",
};

export const STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: "Upcoming",
  live: "Live",
  finished: "Finished",
};

export const TIME_WINDOW_MS: Record<Exclude<ScannerFilterState["timeWindow"], "all">, number> = {
  "1h": 60 * 60_000,
  "3h": 3 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};
