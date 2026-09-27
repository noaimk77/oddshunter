import type { ParsedTip } from "../telegram/tipParser";

/** What the autobet router has to work with — a consensus pick that already
 *  cleared the VIP quality gates, plus what the VIP message itself shows. */
export interface AutobetCandidate extends ParsedTip {
  groupCount: number;
  oddsAtAlert?: number | null;
}

export type AutobetBroker = "PS3838" | "POLYMARKET";

export type AutobetStatus = "SIMULATED" | "PLACED" | "REJECTED" | "FAILED";

export interface AutobetResult {
  broker: AutobetBroker;
  status: AutobetStatus;
  stakeEur: number;
  oddsAtBet?: number | null;
  brokerRef?: string | null;
  reason?: string;
}
