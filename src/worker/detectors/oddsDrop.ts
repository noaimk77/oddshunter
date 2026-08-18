/**
 * ODDS_DROP detector — V1 acceptance criterion (spec sections 5 and 19):
 * a configurable, explainable pre-match odds-drop detector. Pure function
 * over a price history so it's testable without a database or a real
 * provider; the worker's index.ts is the only caller that touches Prisma.
 */

export interface OddsDropConfig {
  /** Minimum drop from the opening price, in percent, to even consider firing. */
  dropThresholdPercent: number;
  /** The drop must hold at or below threshold for at least this long before firing. */
  minPersistenceSec: number;
  /**
   * If price bounces back up by more than this percent at any point after
   * the drop started, treat it as a temporary correction, not a real move
   * (spec: CORRECTION_FILTER — reject bounce-back noise).
   */
  correctionReboundPercent: number;
}

export const DEFAULT_ODDS_DROP_CONFIG: OddsDropConfig = {
  dropThresholdPercent: 5,
  minPersistenceSec: 120,
  correctionReboundPercent: 2,
};

export interface PricePoint {
  price: number;
  timestamp: Date;
}

export interface OddsDropSignal {
  fires: true;
  openingPrice: number;
  currentPrice: number;
  priceChangePct: number;
  persistedForSec: number;
}

export interface OddsDropRejection {
  fires: false;
  reason: "insufficient_data" | "below_threshold" | "insufficient_persistence" | "correction_filtered";
}

export type OddsDropOutcome = OddsDropSignal | OddsDropRejection;

export function detectOddsDrop(history: PricePoint[], config: OddsDropConfig = DEFAULT_ODDS_DROP_CONFIG): OddsDropOutcome {
  if (history.length < 2) return { fires: false, reason: "insufficient_data" };

  const sorted = [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const opening = sorted[0];
  const latest = sorted[sorted.length - 1];

  const priceChangePct = ((opening.price - latest.price) / opening.price) * 100;
  if (priceChangePct < config.dropThresholdPercent) {
    return { fires: false, reason: "below_threshold" };
  }

  const dropLevel = opening.price * (1 - config.dropThresholdPercent / 100);

  // Walk backwards from the latest point to find how long the price has
  // continuously stayed at or below the threshold level.
  let sinceIndex = sorted.length - 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].price <= dropLevel) {
      sinceIndex = i;
    } else {
      break;
    }
  }
  const persistedForSec = (latest.timestamp.getTime() - sorted[sinceIndex].timestamp.getTime()) / 1000;
  if (persistedForSec < config.minPersistenceSec) {
    return { fires: false, reason: "insufficient_persistence" };
  }

  // Correction filter: did price bounce back up at any point during the
  // persistence window before settling again? Compares each point to the
  // one before it (not to the final price — a gradual monotonic decline
  // naturally sits above its own endpoint the whole way down, which isn't a
  // bounce) so only an actual reversal counts as noise.
  const windowPoints = sorted.slice(sinceIndex);
  const hadRebound = windowPoints.some((p, i) => {
    if (i === 0) return false;
    const prev = windowPoints[i - 1];
    return p.price > prev.price * (1 + config.correctionReboundPercent / 100);
  });
  if (hadRebound) {
    return { fires: false, reason: "correction_filtered" };
  }

  return {
    fires: true,
    openingPrice: opening.price,
    currentPrice: latest.price,
    priceChangePct,
    persistedForSec,
  };
}
