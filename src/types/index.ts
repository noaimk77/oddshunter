/**
 * Core domain types for Odds Hunter.
 *
 * These types are provider-agnostic on purpose: the UI is built against them,
 * not against any specific data source. `MockMarketDataProvider` implements
 * this shape today; a future `BetfairMarketDataProvider` implements the same
 * shape without any component changes.
 */

export type Sport =
  | "football"
  | "basketball"
  | "tennis"
  | "table-tennis"
  | "esports";

export type EventStatus = "upcoming" | "live" | "finished";

export type MarketStatus = "open" | "suspended" | "closed";

export type SignalLevel = "normal" | "watch" | "elevated" | "high" | "extreme";

export type MarketType = "match-odds" | "over-under" | "handicap" | "correct-score";

export type Liquidity = "low" | "medium" | "high";

export type RunnerPosition = "home" | "draw" | "away" | "over" | "under";

export interface Competition {
  id: string;
  sport: Sport;
  country: string;
  name: string;
}

export interface Event {
  id: string;
  sport: Sport;
  country: string;
  competitionId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string; // ISO 8601
  status: EventStatus;
  marketIds: string[];
}

export interface Runner {
  id: string;
  name: string;
  position: RunnerPosition;
}

export interface OddsSnapshot {
  timestamp: string; // ISO 8601
  values: Record<string, number>; // runnerId -> odds
}

export interface VolumeSnapshot {
  timestamp: string; // ISO 8601
  volume: number; // matched volume in this bucket
  cumulative: number; // running total matched volume
}

export interface LiquidityMetrics {
  level: Liquidity;
  matchedVolume: number;
  volumeVelocity: number; // EUR/minute over the trailing window
  concentration: number; // % of matched money on the leading runner
}

/** The five dimensions the anomaly score is built from — never a single "odds dropped" heuristic. */
export interface AnomalyMetrics {
  priceAnomaly: number; // 0-100
  volumeAnomaly: number;
  velocity: number;
  concentration: number;
  liquidityAnomaly: number;
}

/** One statistically-flagged criterion contributing to a market's suspicion score. */
export interface AnomalyReason {
  key: string;
  label: string;
  value: string;
  severity: SignalLevel;
  description: string;
}

/** Computed anomaly signal for a market — never a claim of match manipulation. */
export interface MarketSignal {
  level: SignalLevel;
  score: number; // 0-100 suspicion score (statistical anomaly, not proof)
  reasons: AnomalyReason[];
  breakdown: AnomalyMetrics;
}

export type MarketTimelineEventType = "volume" | "odds-move" | "volume-spike" | "signal";

export interface MarketTimelineEvent {
  id: string;
  timestamp: string; // ISO 8601
  type: MarketTimelineEventType;
  label: string;
  severity?: SignalLevel;
}

export interface Market {
  id: string;
  eventId: string;
  type: MarketType;
  name: string;
  status: MarketStatus;
  runners: Runner[];
  openingOdds: Record<string, number>;
  currentOdds: Record<string, number>;
  peakOdds: Record<string, number>;
  lowOdds: Record<string, number>;
  matchedVolume: number;
  volumeDelta15m: number;
  liquidity: Liquidity;
  liquidityMetrics: LiquidityMetrics;
  moneyDistribution: Record<string, number>; // runnerId -> percent (0-100)
  oddsHistory: OddsSnapshot[];
  volumeHistory: VolumeSnapshot[];
  timeline: MarketTimelineEvent[];
  signal: MarketSignal;
  lastUpdated: string; // ISO 8601
}

/** Flattened Event+Market view used across tables and lists. */
export interface MarketRow {
  event: Event;
  market: Market;
  movementPercent: number; // shortest-price runner's odds movement, signed
}

export type AlertTrigger =
  | "odds-drop"
  | "volume-spike"
  | "money-shift"
  | "liquidity-shift"
  | "high-activity";

export interface Alert {
  id: string;
  timestamp: string; // ISO 8601
  sport: Sport;
  competition: string;
  match: string;
  market: string;
  trigger: AlertTrigger;
  title: string;
  description: string;
  value: string;
  score: number;
  severity: SignalLevel;
  eventId: string;
  marketId: string;
}

export interface MarketPulseBucket {
  level: SignalLevel;
  label: string;
  percent: number;
}

export interface OverviewKpis {
  marketsMonitored: number;
  marketsMonitoredDelta: number;
  highActivity: number;
  highActivityDelta: number;
  majorMovements: number;
  majorMovementsDelta: number;
  volumeTracked: number;
  volumeTrackedDelta: number;
  signalsDetected: number;
  signalsDetectedDelta: number;
}

export interface MarketActivityPoint {
  timestamp: string; // ISO 8601
  volume: number;
}

/** One entry in the Overview "Live Market Feed" — a lightweight, recent slice of a market's timeline. */
export interface FeedEvent {
  id: string;
  timestamp: string;
  marketId: string;
  eventLabel: string;
  type: MarketTimelineEventType;
  label: string;
  severity: SignalLevel;
}

export interface AnalyticsSummary {
  marketsMonitored: number;
  signalsGenerated: number;
  extremeSignals: number;
  averageMovement: number;
  volumeMonitored: number;
  signalsByDay: { day: string; count: number }[];
  signalsBySeverity: { level: SignalLevel; count: number }[];
  signalsByCompetition: { competition: string; count: number }[];
  largestMovements: MarketRow[];
  highestVolumeMarkets: MarketRow[];
}
