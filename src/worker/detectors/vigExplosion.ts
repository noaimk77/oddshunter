/**
 * VIG_EXPLOSION detector — spec point H: overround (bookmaker margin) rising
 * abnormally. Pure function over per-selection price histories for ONE
 * market, so it's testable without a database. Unlike ODDS_DROP/ODDS_RISE
 * this operates market-wide (needs every selection's price, not one), since
 * overround is only meaningful as the sum across a market's outcomes.
 *
 * impliedProbability = 1 / decimalOdds
 * overround = sum(impliedProbability) - 1
 *
 * V1 simplification, documented rather than hidden: this compares the
 * overround at the opening price vs the current price with no time-window
 * persistence check (unlike ODDS_DROP/RISE) — a widening margin is itself
 * the anomaly being flagged, not a price level that needs to "hold". Add a
 * persistence/correction-filter pass here too if false positives show up in
 * observation mode.
 */

export interface VigExplosionConfig {
  /** Minimum increase in overround, in percentage points, to fire. */
  minIncreasePercentPoints: number;
}

export const DEFAULT_VIG_EXPLOSION_CONFIG: VigExplosionConfig = {
  minIncreasePercentPoints: 5,
};

export interface PricePoint {
  price: number;
  timestamp: Date;
}

export interface SelectionHistory {
  selectionId: string;
  history: PricePoint[];
}

export interface VigExplosionSignal {
  fires: true;
  openingOverroundPct: number;
  currentOverroundPct: number;
  increasePercentPoints: number;
}

export interface VigExplosionRejection {
  fires: false;
  reason: "insufficient_data" | "incomplete_market" | "below_threshold";
}

export type VigExplosionOutcome = VigExplosionSignal | VigExplosionRejection;

function overroundFromPrices(prices: number[]): number {
  return prices.reduce((sum, price) => sum + 1 / price, 0) - 1;
}

export function detectVigExplosion(
  selections: SelectionHistory[],
  config: VigExplosionConfig = DEFAULT_VIG_EXPLOSION_CONFIG,
): VigExplosionOutcome {
  // A single-outcome or empty market has no meaningful overround.
  if (selections.length < 2) return { fires: false, reason: "insufficient_data" };

  const openingPrices: number[] = [];
  const currentPrices: number[] = [];

  for (const { history } of selections) {
    if (history.length === 0) return { fires: false, reason: "incomplete_market" };
    const sorted = [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    openingPrices.push(sorted[0].price);
    currentPrices.push(sorted[sorted.length - 1].price);
  }

  const openingOverroundPct = overroundFromPrices(openingPrices) * 100;
  const currentOverroundPct = overroundFromPrices(currentPrices) * 100;
  const increasePercentPoints = currentOverroundPct - openingOverroundPct;

  if (increasePercentPoints < config.minIncreasePercentPoints) {
    return { fires: false, reason: "below_threshold" };
  }

  return { fires: true, openingOverroundPct, currentOverroundPct, increasePercentPoints };
}
