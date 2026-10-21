/**
 * ODDS_RISE detector — mirror of ODDS_DROP (see oddsDrop.ts) for a
 * significant, persistent increase in price. Same correction-filter logic,
 * just checking for a downward rebound instead of an upward one.
 */

export interface OddsRiseConfig {
  /** Minimum rise from the opening price, in percent, to even consider firing. */
  riseThresholdPercent: number;
  /** The rise must hold at or above threshold for at least this long before firing. */
  minPersistenceSec: number;
  /**
   * If price drops back down by more than this percent at any point after
   * the rise started, treat it as a temporary correction, not a real move.
   */
  correctionReboundPercent: number;
}

export const DEFAULT_ODDS_RISE_CONFIG: OddsRiseConfig = {
  riseThresholdPercent: 5,
  minPersistenceSec: 120,
  correctionReboundPercent: 2,
};

export interface PricePoint {
  price: number;
  timestamp: Date;
}

export interface OddsRiseSignal {
  fires: true;
  openingPrice: number;
  currentPrice: number;
  priceChangePct: number;
  persistedForSec: number;
}

export interface OddsRiseRejection {
  fires: false;
  reason: "insufficient_data" | "below_threshold" | "insufficient_persistence" | "correction_filtered";
}

export type OddsRiseOutcome = OddsRiseSignal | OddsRiseRejection;

export function detectOddsRise(history: PricePoint[], config: OddsRiseConfig = DEFAULT_ODDS_RISE_CONFIG): OddsRiseOutcome {
  if (history.length < 2) return { fires: false, reason: "insufficient_data" };

  const sorted = [...history].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const opening = sorted[0];
  const latest = sorted[sorted.length - 1];

  const priceChangePct = ((latest.price - opening.price) / opening.price) * 100;
  if (priceChangePct < config.riseThresholdPercent) {
    return { fires: false, reason: "below_threshold" };
  }

  const riseLevel = opening.price * (1 + config.riseThresholdPercent / 100);

  // Walk backwards from the latest point to find how long the price has
  // continuously stayed at or above the threshold level.
  let sinceIndex = sorted.length - 1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].price >= riseLevel) {
      sinceIndex = i;
    } else {
      break;
    }
  }
  const persistedForSec = (latest.timestamp.getTime() - sorted[sinceIndex].timestamp.getTime()) / 1000;
  if (persistedForSec < config.minPersistenceSec) {
    return { fires: false, reason: "insufficient_persistence" };
  }

  // Correction filter: did price drop back down at any point during the
  // persistence window before settling again?
  const windowPoints = sorted.slice(sinceIndex);
  const hadRebound = windowPoints.some((p, i) => {
    if (i === 0) return false;
    const prev = windowPoints[i - 1];
    return p.price < prev.price * (1 - config.correctionReboundPercent / 100);
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
