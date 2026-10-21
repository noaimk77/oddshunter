/**
 * Signal scoring — spec section 6: no weighting is confirmed yet, so every
 * weight lives here as a plain configurable object (not a magic number
 * buried in logic) and every factor's contribution is returned alongside
 * the total, so it can be logged and recalibrated without a redeploy.
 *
 * Each factor is a value already normalized to [0, 1] by the caller
 * (detector-specific — e.g. amplitude might be `min(dropPct / 20, 1)`).
 * This module only does the weighting, clamping, and reason formatting.
 */

export interface ScoreFactors {
  amplitude: number;
  speed: number;
  persistence: number;
  multiBookAgreement: number;
  volume: number;
  liquidity: number;
  proximityToKickoff: number;
  competitionQuality: number;
  marketStatus: number;
  explainability: number;
  sourceQuality: number;
}

export type ScoreWeights = Record<keyof ScoreFactors, number>;

/**
 * Defaults sum to 1.0. Starting point only — the spec explicitly says to
 * begin with configurable parameters and recalibrate from measured false
 * positives / CLV once real data flows (section 15), not to treat these as
 * final.
 *
 * Rebalanced 2026-08-20: `volume` and `liquidity` are structurally always 0
 * for every provider currently wired in (BetExplorer/API-Football are
 * bookmaker-odds aggregators, not an exchange — real matched-volume data
 * only exists on Betfair Exchange, which is blocked for France). Weighting
 * them at 0.15 combined meant no signal could ever score above ~55/100, no
 * matter how strong — a 12.61→8.35 move and a 2.37→1.97 move landed within
 * a few points of each other. Their weight is redistributed into the
 * factors this pipeline can actually measure, so a genuinely strong signal
 * (big, fast, persistent, confirmed by several bookmakers) can now reach
 * the 80-100 range instead of being ceiling-capped by data we don't have.
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  amplitude: 0.25,
  speed: 0.15,
  persistence: 0.2,
  multiBookAgreement: 0.2,
  volume: 0, // no exchange data source wired in — don't pretend to weight it
  liquidity: 0, // same as volume — Betfair Exchange only, blocked for France
  proximityToKickoff: 0.08,
  competitionQuality: 0.04,
  marketStatus: 0.04,
  explainability: 0.02, // high explainability by known game state LOWERS suspicion — invert before scoring
  sourceQuality: 0.02,
};

/**
 * VALUE_BET-specific weights (Noaim, 2026-08-23). The shared
 * DEFAULT_SCORE_WEIGHTS above assumes every signal is a trend observed over
 * several snapshots — speed/persistence/multiBookAgreement (0.55 combined
 * weight) only make sense for that. VALUE_BET is a single-snapshot
 * cross-bookmaker comparison: those three factors are always passed in as 0,
 * which silently caps VALUE_BET's ceiling at ~36/100 no matter how large the
 * edge is. Confirmed live: 102 VALUE_BET signals overnight 2026-08-22/23,
 * every single one topped out at score 36 — including edges of 16-20%,
 * which is actually a strong signal for this detector, not a weak one. The
 * score number was misleading the user into reading real opportunities as
 * noise. Same treatment as the 2026-08-20 volume/liquidity rebalance: the
 * unusable weight is redistributed into the factors this detector actually
 * measures (amplitude = the edge itself, proximityToKickoff = real hours-to-
 * kickoff) plus the two placeholder factors it still carries.
 */
export const VALUE_BET_SCORE_WEIGHTS: ScoreWeights = {
  amplitude: 0.75,
  speed: 0,
  persistence: 0,
  multiBookAgreement: 0,
  volume: 0,
  liquidity: 0,
  proximityToKickoff: 0.15,
  competitionQuality: 0.06,
  marketStatus: 0,
  explainability: 0,
  sourceQuality: 0.04,
};

const FACTOR_LABEL_FR: Record<keyof ScoreFactors, string> = {
  amplitude: "amplitude du mouvement",
  speed: "vitesse de variation",
  persistence: "persistance",
  multiBookAgreement: "concordance entre bookmakers",
  volume: "volume et accélération du volume",
  liquidity: "liquidité disponible",
  proximityToKickoff: "proximité du coup d'envoi",
  competitionQuality: "qualité de la compétition",
  marketStatus: "statut du marché",
  explainability: "mouvement non expliqué par l'état du match",
  sourceQuality: "qualité historique de la source",
};

export interface ScoreReason {
  factor: keyof ScoreFactors;
  label: string;
  value: number;
  weight: number;
  contribution: number;
}

export interface ScoreResult {
  score: number;
  reasons: ScoreReason[];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * `explainability` is passed in as "how much this move is explained by a
 * known live event" (1 = fully explained) — that REDUCES suspicion, so it's
 * inverted here rather than asking every caller to remember to flip it.
 */
export function scoreSignal(factors: ScoreFactors, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): ScoreResult {
  const effective: ScoreFactors = { ...factors, explainability: 1 - clamp01(factors.explainability) };

  const reasons: ScoreReason[] = (Object.keys(weights) as (keyof ScoreFactors)[]).map((factor) => {
    const value = clamp01(effective[factor]);
    const weight = weights[factor];
    return {
      factor,
      label: FACTOR_LABEL_FR[factor],
      value,
      weight,
      contribution: value * weight,
    };
  });

  const total = reasons.reduce((sum, r) => sum + r.contribution, 0);
  const score = Math.round(clamp01(total) * 100);

  reasons.sort((a, b) => b.contribution - a.contribution);

  return { score, reasons };
}
