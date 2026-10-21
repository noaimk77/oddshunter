/**
 * VALUE_BET detector — pure function, same shape as the other detectors.
 * Compares every bookmaker's current price for one real-world outcome
 * against a reference "sharp" bookmaker's price (Pinnacle by default,
 * confirmed present in API-Football's bookmaker pool 2026-08-22). A price
 * meaningfully above the reference implies the market disagrees with the
 * sharp book's assessment — the closest honest proxy to "value" available
 * without exchange-style matched-volume data (Betfair, off-limits in
 * France — see project notes). Only ever fires on the single best-edge
 * bookmaker in the group, never every book above threshold, so downstream
 * scoring naturally caps this to "best opportunities only" (Noaim,
 * 2026-08-22: "les meilleures... tu n'en vas pas trop").
 */

export interface BookmakerPrice {
  bookmakerLabel: string;
  marketId: string;
  selectionId: string;
  price: number;
}

export interface ValueBetConfig {
  referenceBookmaker: string;
  minEdgePercent: number;
}

export const DEFAULT_VALUE_BET_CONFIG: ValueBetConfig = {
  referenceBookmaker: "Pinnacle",
  minEdgePercent: 8,
};

export interface ValueBetSignal {
  fires: true;
  referenceBookmaker: string;
  referencePrice: number;
  bestBookmaker: string;
  bestPrice: number;
  edgePercent: number;
  marketId: string;
  selectionId: string;
}
export interface ValueBetRejection {
  fires: false;
  reason: "no_reference_price" | "insufficient_bookmakers" | "below_threshold";
}
export type ValueBetOutcome = ValueBetSignal | ValueBetRejection;

export function detectValueBet(prices: BookmakerPrice[], config: ValueBetConfig = DEFAULT_VALUE_BET_CONFIG): ValueBetOutcome {
  const reference = prices.find((p) => p.bookmakerLabel === config.referenceBookmaker);
  if (!reference) return { fires: false, reason: "no_reference_price" };

  const others = prices.filter((p) => p.bookmakerLabel !== config.referenceBookmaker);
  if (others.length === 0) return { fires: false, reason: "insufficient_bookmakers" };

  let best = others[0];
  let bestEdge = ((best.price - reference.price) / reference.price) * 100;
  for (const p of others.slice(1)) {
    const edge = ((p.price - reference.price) / reference.price) * 100;
    if (edge > bestEdge) {
      bestEdge = edge;
      best = p;
    }
  }

  if (bestEdge < config.minEdgePercent) return { fires: false, reason: "below_threshold" };

  return {
    fires: true,
    referenceBookmaker: config.referenceBookmaker,
    referencePrice: reference.price,
    bestBookmaker: best.bookmakerLabel,
    bestPrice: best.price,
    edgePercent: bestEdge,
    marketId: best.marketId,
    selectionId: best.selectionId,
  };
}
