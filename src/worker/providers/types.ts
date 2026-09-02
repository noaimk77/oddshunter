/**
 * Provider-agnostic shapes the detection engine consumes. Every real
 * provider adapter (Betfair, API-Football, a future OddsMatrix/Sportradar
 * feed) normalizes into these types — the detectors and scoring engine never
 * import a provider SDK directly, so swapping or adding a data source never
 * touches detection logic.
 */

export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string) {
    super(
      `${providerName} n'est pas configuré (identifiants absents ou placeholders) — ` +
        `rien n'est simulé à la place, l'adaptateur refuse simplement de tourner.`,
    );
    this.name = "ProviderNotConfiguredError";
  }
}

export interface NormalizedOddsPoint {
  providerName: string;
  externalCompetitionId: string;
  externalEventId: string;
  externalMarketId: string;
  externalSelectionId: string;
  sport: string;
  country: string;
  competitionName: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
  marketType: string;
  marketName: string;
  marketStatus: "open" | "suspended" | "closed";
  selectionName: string;
  selectionPosition: string;
  price: number;
  matchedVolume?: number;
  timestamp: Date;
  /** Defaults to "upcoming" on Event creation when omitted — every existing
   *  pre-match provider stays untouched. A live-odds provider sets "live"
   *  so the same detectors (ODDS_DROP etc.) that already watch pre-match
   *  snapshots watch in-play movement too, with no detector-side change. */
  eventStatus?: "upcoming" | "live";
}

export interface NormalizedBetfairSnapshot {
  externalSelectionId: string;
  backPrice: number | null;
  layPrice: number | null;
  spread: number | null;
  matchedVolume: number;
  availableLiquidity: number;
  marketStatus: "open" | "suspended" | "closed";
  timestamp: Date;
}

export interface NormalizedLiveState {
  externalEventId: string;
  minute: number | null;
  homeScore: number;
  awayScore: number;
  /** Most recent events (goal, card, penalty, VAR stoppage...), newest first. */
  recentEvents: { type: string; minute: number; team: "home" | "away" }[];
  shotsOnTarget?: { home: number; away: number };
  xg?: { home: number; away: number };
  corners?: { home: number; away: number };
  possessionPct?: { home: number; away: number };
  timestamp: Date;
}

/** One adapter per data source; the worker only ever talks to this shape. */
export interface MarketDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  fetchPreMatchOdds(sport: string): Promise<NormalizedOddsPoint[]>;
}

export interface ExchangeDataProvider {
  readonly name: string;
  isConfigured(): boolean;
  fetchExchangeSnapshots(externalMarketId: string): Promise<NormalizedBetfairSnapshot[]>;
}

export interface LiveStateProvider {
  readonly name: string;
  isConfigured(): boolean;
  fetchLiveState(externalEventId: string): Promise<NormalizedLiveState | null>;
}
