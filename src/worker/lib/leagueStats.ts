import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Hit-rate helpers backed by the SignalOutcome feedback loop (see
 * outcomeResolver.ts). Two audiences:
 *  - League hit-rate is embedded in the alert itself so a paying user sees
 *    at a glance whether this detector has any historical track record on
 *    the competition the signal fires on (Noaim, 2026-08-23, inspired by
 *    Suspicious Game's premium bot which surfaces per-league confidence).
 *  - User hit-rate powers the /stats bot command — same data, filtered by
 *    who actually received the delivery.
 *
 * Both intentionally exclude `void` (Draw No Bet push on a draw, etc.) from
 * the denominator so the percentage reads as "of decided bets, how many
 * won" — not diluted by refunds that were never a win or a loss.
 */

export interface HitRate {
  wins: number;
  losses: number;
  voids: number;
  /** wins + losses (voids excluded from denominator — a push isn't a bet's outcome). */
  decided: number;
  /** Percentage rounded to nearest integer; null when `decided === 0`. */
  hitRatePct: number | null;
}

/** Pure aggregator — exported so the win/loss/void → HitRate math can be
 *  unit-tested without spinning up Postgres. Every DB-facing helper below
 *  fetches SignalOutcome rows and hands them straight to this. */
export function computeHitRate(rows: { selectionWon: boolean | null }[]): HitRate {
  let wins = 0;
  let losses = 0;
  let voids = 0;
  for (const r of rows) {
    if (r.selectionWon === true) wins++;
    else if (r.selectionWon === false) losses++;
    else voids++;
  }
  const decided = wins + losses;
  return {
    wins,
    losses,
    voids,
    decided,
    hitRatePct: decided === 0 ? null : Math.round((wins / decided) * 100),
  };
}

/**
 * Hit-rate for signals on this competition, over the last N days. ODDS_RISE
 * is excluded (same rationale as deliverTouchedSignals — it's the mirror of
 * an ODDS_DROP on the other side of the market, not independent evidence).
 * Returns null when there's not enough data to be worth showing to a user;
 * callers should skip rendering the line rather than displaying "0/0".
 */
export async function getLeagueHitRate(
  db: PrismaClient,
  competitionId: string,
  sinceDays: number,
  minDecided = 10,
): Promise<HitRate | null> {
  const since = new Date(Date.now() - sinceDays * 24 * 3_600_000);
  const outcomes = await db.signalOutcome.findMany({
    where: {
      checkedAt: { gte: since },
      signal: {
        type: { not: "ODDS_RISE" },
        market: { event: { competitionId } },
      },
    },
    select: { selectionWon: true },
  });
  const stats = computeHitRate(outcomes);
  if (stats.decided < minDecided) return null;
  return stats;
}

/**
 * Hit-rate for one user's delivered alerts (SignalDelivery joined against
 * SignalOutcome). Same ODDS_RISE exclusion, no minimum threshold — /stats
 * should still respond usefully to a new subscriber, showing "aucune alerte
 * résolue" is more honest than staying silent.
 */
export async function getUserHitRate(db: PrismaClient, userId: string, sinceDays: number): Promise<HitRate> {
  const since = new Date(Date.now() - sinceDays * 24 * 3_600_000);
  // No `outcome: { isNot: null }` filter here — the post-fetch `.filter`
  // below drops undelivered/pending ones, and keeping the query lenient
  // lets us count "reçues mais pas encore résolues" separately upstream
  // (via countUserAlerts) without a second overlapping predicate.
  const deliveries = await db.signalDelivery.findMany({
    where: {
      userId,
      channel: "TELEGRAM",
      sentAt: { gte: since },
      signal: { type: { not: "ODDS_RISE" } },
    },
    select: { signal: { select: { outcome: { select: { selectionWon: true } } } } },
  });
  const outcomes = deliveries
    .map((d) => d.signal.outcome)
    .filter((o): o is { selectionWon: boolean | null } => o !== null);
  return computeHitRate(outcomes);
}

/** Total alerts a user received over the window (including unresolved ones),
 *  so /stats can distinguish "45 reçues, 32 résolues" from "45 reçues, 45
 *  résolues" — reassures the user that recent picks aren't being ignored,
 *  just still pending. */
export async function countUserAlerts(db: PrismaClient, userId: string, sinceDays: number): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 24 * 3_600_000);
  return db.signalDelivery.count({
    where: {
      userId,
      channel: "TELEGRAM",
      sentAt: { gte: since },
      signal: { type: { not: "ODDS_RISE" } },
    },
  });
}

/**
 * ROI/units-won summary for a set of resolved signals, priced at the
 * moment the alert fired (Signal.currentPrice — the odds the subscriber
 * would have taken had they placed the bet immediately). Units are what
 * you'd have made if you'd bet a flat 1€ on every signal:
 *   - win  → +(price − 1)  (you get your stake back plus the profit)
 *   - loss → −1
 *   - void → 0
 * ROI% = totalUnits / decidedBetCount × 100. Voids are excluded from the
 * denominator (same convention as HitRate.decided).
 */
export interface ROI {
  /** Cumulative profit/loss in units, e.g. +12.4 = you'd be up 12.4€
   *  on 1€ flat stakes. */
  units: number;
  /** wins + losses. */
  decided: number;
  /** units / decided × 100. Null when decided === 0. */
  roiPct: number | null;
}

export function computeROI(rows: { selectionWon: boolean | null; currentPrice: number | null }[]): ROI {
  let units = 0;
  let decided = 0;
  for (const r of rows) {
    if (r.selectionWon === null) continue; // void or unresolved — skip
    decided++;
    if (r.selectionWon === true) {
      // Silently ignore a resolved-won signal whose currentPrice is missing:
      // it's a data-integrity bug we shouldn't surface to a subscriber as
      // "+0€", but excluding it entirely is more honest than defaulting to
      // some average price. Same treatment as a void — no unit change.
      if (r.currentPrice != null && Number.isFinite(r.currentPrice) && r.currentPrice > 1) {
        units += r.currentPrice - 1;
      }
    } else {
      units -= 1;
    }
  }
  const roiPct = decided === 0 ? null : Math.round((units / decided) * 100 * 10) / 10;
  return { units: Math.round(units * 100) / 100, decided, roiPct };
}

/**
 * Global (all-subscribers) hit-rate + ROI over the window — this is what
 * powers the /perf command and the public sales pitch. A prospect who
 * hasn't subscribed yet has nothing in getUserHitRate; showing them the
 * global track record is what earns the click on the checkout link (Noaim,
 * 2026-09-06 Phase 1: "sans preuve sociale personne ne paie").
 *
 * ODDS_RISE excluded, same rationale as everywhere else.
 */
export async function getGlobalPerformance(
  db: PrismaClient,
  sinceDays: number,
): Promise<{ hitRate: HitRate; roi: ROI; totalFired: number }> {
  const since = new Date(Date.now() - sinceDays * 24 * 3_600_000);
  const [outcomes, totalFired] = await Promise.all([
    db.signalOutcome.findMany({
      where: {
        checkedAt: { gte: since },
        signal: { type: { not: "ODDS_RISE" } },
      },
      select: { selectionWon: true, signal: { select: { currentPrice: true } } },
    }),
    db.signal.count({
      where: {
        firstDetectedAt: { gte: since },
        type: { not: "ODDS_RISE" },
      },
    }),
  ]);
  const flat = outcomes.map((o) => ({ selectionWon: o.selectionWon, currentPrice: o.signal.currentPrice }));
  return {
    hitRate: computeHitRate(flat),
    roi: computeROI(flat),
    totalFired,
  };
}

/**
 * Same as `getGlobalPerformance` but scoped to Premium signals only. The
 * shared tier rules live in `signalTier.ts`; here we translate them into a
 * database predicate — `score >= 55` AND `type === "MULTI_BOOK_CONFIRMATION"`.
 * The compact indicator-count logic in `classifySignalTier` doesn't have a
 * clean SQL translation (velocity is a computed field, isLateMove/
 * crossMarketCount aren't columns), so we use the ONE indicator that IS a
 * column — `type` — as the practical Premium proxy for aggregate stats.
 * MULTI_BOOK_CONFIRMATION alone doesn't guarantee Premium tier at delivery
 * time, but almost every Premium signal in practice IS a MULTI_BOOK one,
 * so the aggregate hit-rate is a faithful approximation. The message
 * badge users see is still the strict classifier (2+ indicators).
 */
export async function getPremiumPerformance(
  db: PrismaClient,
  sinceDays: number,
): Promise<{ hitRate: HitRate; roi: ROI; totalFired: number }> {
  const since = new Date(Date.now() - sinceDays * 24 * 3_600_000);
  const premiumWhere = { type: "MULTI_BOOK_CONFIRMATION", score: { gte: 55 } };
  const [outcomes, totalFired] = await Promise.all([
    db.signalOutcome.findMany({
      where: { checkedAt: { gte: since }, signal: premiumWhere },
      select: { selectionWon: true, signal: { select: { currentPrice: true } } },
    }),
    db.signal.count({ where: { firstDetectedAt: { gte: since }, ...premiumWhere } }),
  ]);
  const flat = outcomes.map((o) => ({ selectionWon: o.selectionWon, currentPrice: o.signal.currentPrice }));
  return { hitRate: computeHitRate(flat), roi: computeROI(flat), totalFired };
}
