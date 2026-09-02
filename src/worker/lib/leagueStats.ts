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
