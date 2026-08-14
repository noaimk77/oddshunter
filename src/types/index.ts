/**
 * Core domain types for OddScope.
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

export type EventStatus = "upcoming" | "live" | "closed";

export type SignalLevel = "normal" | "watch" | "elevated" | "high" | "extreme";

export type MarketType = "match-odds" | "over-under" | "handicap" | "correct-score";

export type Liquidity = "low" | "medium" | "high";

export type RunnerPosition = "home" | "draw" | "away";

export interface Event {
  id: string;
  sport: Sport;
  country: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string; // ISO 8601
  status: EventStatus;
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
}

export interface Market {
  id: string;
  eventId: string;
  type: MarketType;
  name: string;
  runners: Runner[];
  openingOdds: Record<string, number>;
  currentOdds: Record<string, number>;
  matchedVolume: number;
  volumeDelta15m: number;
  liquidity: Liquidity;
  moneyDistribution: Record<string, number>; // runnerId -> percent (0-100)
  oddsHistory: OddsSnapshot[];
  volumeHistory: VolumeSnapshot[];
  signal: MarketSignal;
}

/** Flattened Event+Market view used across tables and lists. */
export interface MarketRow {
  event: Event;
  market: Market;
  movementPercent: number; // shortest-price runner's odds movement, signed
}

export type AlertType =
  | "odds-drop"
  | "volume-spike"
  | "money-shift"
  | "high-activity";

export interface Alert {
  id: string;
  timestamp: string; // ISO 8601
  level: SignalLevel;
  type: AlertType;
  title: string;
  description: string;
  eventId: string;
  marketId: string;
  eventLabel: string;
  league: string;
  value: string;
  score: number;
}

export interface MarketPulseBucket {
  level: SignalLevel;
  label: string;
  percent: number;
}

export interface OverviewKpis {
  liveMarkets: number;
  liveMarketsDelta: number;
  highActivity: number;
  highActivityDelta: number;
  majorMovements: number;
  majorMovementsDelta: number;
  volumeTracked: number;
  volumeTrackedDelta: number;
}

export interface MarketActivityPoint {
  timestamp: string; // ISO 8601
  volume: number;
}

export interface AnalyticsSummary {
  marketsMonitored: number;
  signalsGenerated: number;
  averageOddsMovement: number;
  volumeTracked: number;
  signalsByDay: { day: string; count: number }[];
  signalsByLeague: { league: string; count: number }[];
  signalsBySeverity: { level: SignalLevel; count: number }[];
  volumeDistribution: { sport: Sport; volume: number }[];
}
