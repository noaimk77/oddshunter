import type { PrismaClient } from "@/generated/prisma/client";
import { getLeagueHitRate } from "../lib/leagueStats";
import type { SignalWithContext } from "./sendAlert";

/**
 * Builds the enriched context Suspicious-Game-style alerts render — velocity,
 * late-move flag, cross-market count, league hit-rate — from a Signal row.
 * Extracted so BOTH the initial delivery (deliverTouchedSignals in index.ts)
 * AND the outcome-resolution edit (outcomeResolver.postResultToTelegram)
 * produce byte-identical messages ± the appended result line. Without this,
 * the ✅/❌ edit would silently strip every enrichment from the message,
 * confusing readers into thinking the extra context was a bug.
 *
 * The `signal` shape is intentionally narrow — the caller passes whatever it
 * already has loaded (Prisma includes vary between callers).
 */

export interface SignalContextInputs {
  signal: {
    id: string;
    type: string;
    score: number;
    reasons: unknown;
    openingPrice: number | null;
    currentPrice: number | null;
    priceChangePct: number | null;
    metadata: unknown;
    firstDetectedAt: Date;
    selectionId: string | null;
  };
  market: {
    name: string;
    type: string;
    status: string;
  };
  event: {
    id: string;
    homeTeam: string;
    awayTeam: string;
    kickoff: Date;
    status: string;
  };
  competition: {
    id: string;
    name: string;
    sport: string;
    country: string;
  };
  selection: { name: string } | null;
}

export const LEAGUE_HIT_RATE_WINDOW_DAYS = 30;

export async function buildSignalContext(db: PrismaClient, inputs: SignalContextInputs): Promise<SignalWithContext> {
  const { signal, market, event, competition, selection } = inputs;

  const priceHistory = signal.selectionId
    ? (
        await db.oddsSnapshot.findMany({
          where: { selectionId: signal.selectionId },
          orderBy: { timestamp: "desc" },
          take: 10,
          select: { timestamp: true, price: true },
        })
      ).reverse()
    : [];

  let velocity: SignalWithContext["velocity"] = null;
  if (priceHistory.length >= 2 && signal.priceChangePct != null) {
    const windowMs = priceHistory[priceHistory.length - 1].timestamp.getTime() - priceHistory[0].timestamp.getTime();
    const windowMinutes = windowMs / 60_000;
    if (windowMinutes > 0) {
      velocity = { pctPerMin: Math.abs(signal.priceChangePct) / windowMinutes, windowMinutes };
    }
  }

  const minutesBeforeKickoff = (event.kickoff.getTime() - signal.firstDetectedAt.getTime()) / 60_000;
  const isLateMove = minutesBeforeKickoff > 0 && minutesBeforeKickoff <= 60;

  const openSignalsOnEvent = await db.signal.findMany({
    where: {
      market: { eventId: event.id },
      status: { in: ["OPEN", "UPDATED"] },
      type: { not: "ODDS_RISE" },
    },
    select: { market: { select: { type: true } } },
  });
  // Includes the current signal's own type (it's still open at this point),
  // so a lone signal reads as 1 — cross-market rendering starts at 2+.
  const crossMarketCount = new Set(openSignalsOnEvent.map((s) => s.market.type)).size;

  let leagueHitRate = null;
  try {
    leagueHitRate = await getLeagueHitRate(db, competition.id, LEAGUE_HIT_RATE_WINDOW_DAYS);
  } catch (err) {
    console.error(`[signalContext] league hit-rate lookup failed for signal ${signal.id}`, err);
  }

  return {
    id: signal.id,
    type: signal.type,
    score: signal.score,
    reasons: (signal.reasons as { label: string; contribution: number }[] | null) ?? [],
    openingPrice: signal.openingPrice,
    currentPrice: signal.currentPrice,
    priceChangePct: signal.priceChangePct,
    metadata: signal.metadata,
    priceHistory,
    firstDetectedAt: signal.firstDetectedAt,
    velocity,
    isLateMove,
    crossMarketCount,
    leagueHitRate,
    leagueHitRateDays: LEAGUE_HIT_RATE_WINDOW_DAYS,
    market: {
      name: market.name,
      type: market.type,
      status: market.status,
      event: {
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        kickoff: event.kickoff,
        status: event.status,
        competition: {
          id: competition.id,
          name: competition.name,
          sport: competition.sport,
          country: competition.country,
        },
      },
    },
    selection: selection ? { name: selection.name } : null,
  };
}
