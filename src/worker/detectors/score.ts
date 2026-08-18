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
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  amplitude: 0.2,
  speed: 0.1,
  persistence: 0.15,
  multiBookAgreement: 0.15,
  volume: 0.1,
  liquidity: 0.05,
  proximityToKickoff: 0.05,
  competitionQuality: 0.05,
  marketStatus: 0.05,
  explainability: 0.05, // high explainability by known game state LOWERS suspicion — invert before scoring
  sourceQuality: 0.05,
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
