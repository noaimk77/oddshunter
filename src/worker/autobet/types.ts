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
  /** True when the triggering tip came from a TRUSTED_SINGLE_SOURCE_CHAT_IDS
   *  channel that is exclusively esports (currently "Vip ESPORTS"). Real
   *  esports team names ("Forsaken", "Bushido Wildcats") almost never
   *  contain an esports keyword, so `looksLikeEsports`'s keyword scan alone
   *  routinely misses them and misroutes to the football broker (PS3838,
   *  permanently rejected — see AUTOBET.md incident 2026-09-27/28). A pick
   *  from this source is esports by construction, independent of the
   *  keyword check. */
  isTrustedEsportsSource?: boolean;
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
