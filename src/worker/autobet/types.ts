import type { ParsedTip } from "../telegram/tipParser";
import type { ConfidenceTier } from "./confidenceTier";

/** What the autobet router has to work with — a consensus pick that already
 *  cleared the VIP quality gates, plus what the VIP message itself shows. */
export interface AutobetCandidate extends ParsedTip {
  groupCount: number;
  oddsAtAlert?: number | null;
  /** Confidence tier parsed from the trusted channel's caption, when the
   *  triggering tip came from it — drives the stake %. null for consensus
   *  picks with no tier (uses the default %). */
  confidenceTier?: ConfidenceTier | null;
}

export type AutobetBroker = "PS3838" | "POLYMARKET";

export type AutobetStatus = "SIMULATED" | "PLACED" | "REJECTED" | "FAILED" | "CLOSED";

export interface AutobetResult {
  broker: AutobetBroker;
  status: AutobetStatus;
  stakeEur: number;
  oddsAtBet?: number | null;
  brokerRef?: string | null;
  reason?: string;
  /** Polymarket only, set on a real PLACED buy — the exact position bought,
   *  so a later cash-out/flip signal knows exactly what to sell. */
  polyTokenId?: string | null;
  polyConditionId?: string | null;
  sizeShares?: number | null;
}
