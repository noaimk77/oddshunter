import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { looksLikeEsports } from "../telegram/tipParser";
import { AUTOBET_LIVE_ENABLED } from "../config";
import { checkDailyCapAndReserveStake } from "./riskEngine";
import { resolvePs3838Bet } from "./ps3838Matcher";
import { placeBet as ps3838PlaceBet, Ps3838ConfigError } from "./ps3838Client";
import type { AutobetCandidate, AutobetResult } from "./types";

/**
 * Polymarket is DNS-redirected to the French gambling regulator (ANJ)'s
 * block page from this box — verified 2026-09-27 (polymarket.com,
 * gamma-api.polymarket.com, clob.polymarket.com all serve a *.anj.fr
 * certificate, same as stake.com; bet365.com/betfair.com, both ANJ-licensed,
 * resolve normally). Polymarket is not authorized in France. This router
 * will not place — or attempt to place — a Polymarket order until Noaim
 * explicitly resolves that (see conversation 2026-09-27); esports picks are
 * recorded as REJECTED with this reason so the simulation history stays
 * honest instead of silently pretending esports betting works.
 */
const POLYMARKET_BLOCKED_REASON =
  "Polymarket inaccessible depuis la France (bloqué par l'ANJ) — non branché tant que ce point n'est pas réglé.";

/**
 * The full lifecycle for one consensus alert that was actually sent to the
 * VIP group: decide broker by sport, reserve today's stake against the
 * circuit breaker, resolve the pick on that broker, place it (or simulate),
 * and persist exactly one AutobetTicket row either way. Never throws — a
 * failure anywhere becomes a FAILED/REJECTED ticket, because a bug in this
 * path must never take down the VIP alert pipeline that calls it.
 */
export async function autobetOnConsensus(db: PrismaClient, tip: AutobetCandidate, consensusFingerprint: string): Promise<AutobetResult> {
  const esports = looksLikeEsports(tip.homeTeam, tip.awayTeam);
  const broker = esports ? "POLYMARKET" : "PS3838";

  try {
    const cap = await checkDailyCapAndReserveStake(db);
    if (!cap.allowed) {
      const result: AutobetResult = { broker, status: "REJECTED", stakeEur: 0, reason: cap.reason };
      await persist(db, tip, consensusFingerprint, result);
      return result;
    }
    const { stakeEur } = cap;

    if (esports) {
      const result: AutobetResult = { broker, status: "REJECTED", stakeEur, reason: POLYMARKET_BLOCKED_REASON };
      await persist(db, tip, consensusFingerprint, result);
      return result;
    }

    let resolved: Awaited<ReturnType<typeof resolvePs3838Bet>>;
    try {
      resolved = await resolvePs3838Bet(tip, tip.market, tip.selection);
    } catch (err) {
      const reason =
        err instanceof Ps3838ConfigError
          ? "PS3838_USERNAME/PS3838_PASSWORD non configurés — voir la conversation du 2026-09-27 pour la marche à suivre."
          : `PS3838 fixture/line lookup a échoué : ${err instanceof Error ? err.message : String(err)}`;
      resolved = { ok: false, reason };
    }
    if (!resolved.ok) {
      const result: AutobetResult = { broker, status: "REJECTED", stakeEur, reason: resolved.reason };
      await persist(db, tip, consensusFingerprint, result);
      return result;
    }

    if (!AUTOBET_LIVE_ENABLED) {
      const result: AutobetResult = {
        broker,
        status: "SIMULATED",
        stakeEur,
        oddsAtBet: resolved.price,
        reason: "AUTOBET_LIVE_ENABLED=false — mode simulation.",
      };
      await persist(db, tip, consensusFingerprint, result);
      console.log(`[autobet] SIMULATED ${broker} ${stakeEur}€ @ ${resolved.price} — ${tip.homeTeam} vs ${tip.awayTeam} (${tip.market} ${tip.selection}).`);
      return result;
    }

    try {
      const placed = await ps3838PlaceBet({
        lineId: resolved.lineId,
        sportId: 29,
        eventId: resolved.eventId,
        periodNumber: resolved.spec.periodNumber,
        betType: resolved.spec.betType,
        team: resolved.spec.team,
        side: resolved.spec.side,
        handicap: resolved.spec.handicap,
        stake: stakeEur,
      });
      const ok = placed.status === "ACCEPTED" || placed.status === "PENDING_ACCEPTANCE";
      const result: AutobetResult = {
        broker,
        status: ok ? "PLACED" : "REJECTED",
        stakeEur,
        oddsAtBet: resolved.price,
        brokerRef: placed.betId ? String(placed.betId) : null,
        reason: ok ? undefined : `PS3838 status ${placed.status}${placed.errorCode ? ` (${placed.errorCode})` : ""}`,
      };
      await persist(db, tip, consensusFingerprint, result);
      console.log(`[autobet] ${result.status} ${broker} ${stakeEur}€ @ ${resolved.price} — ${tip.homeTeam} vs ${tip.awayTeam} — betId ${result.brokerRef ?? "n/a"}.`);
      return result;
    } catch (err) {
      const reason =
        err instanceof Ps3838ConfigError
          ? "PS3838_USERNAME/PS3838_PASSWORD non configurés — bascule impossible en réel."
          : `PS3838 place bet a échoué : ${err instanceof Error ? err.message : String(err)}`;
      const result: AutobetResult = { broker, status: "FAILED", stakeEur, oddsAtBet: resolved.price, reason };
      await persist(db, tip, consensusFingerprint, result);
      console.error(`[autobet] FAILED ${broker} — ${tip.homeTeam} vs ${tip.awayTeam}:`, reason);
      return result;
    }
  } catch (err) {
    const result: AutobetResult = {
      broker,
      status: "FAILED",
      stakeEur: 0,
      reason: `autobet router crashed: ${err instanceof Error ? err.message : String(err)}`,
    };
    console.error("[autobet] router failed unexpectedly:", err);
    await persist(db, tip, consensusFingerprint, result).catch(() => {});
    return result;
  }
}

async function persist(db: PrismaClient, tip: AutobetCandidate, consensusFingerprint: string, result: AutobetResult): Promise<void> {
  try {
    await db.autobetTicket.create({
      data: {
        consensusFingerprint,
        broker: result.broker,
        sport: looksLikeEsports(tip.homeTeam, tip.awayTeam) ? "esports" : "football",
        homeTeam: tip.homeTeam,
        awayTeam: tip.awayTeam,
        market: tip.market,
        selection: tip.selection,
        stakeEur: result.stakeEur,
        oddsAtBet: result.oddsAtBet ?? null,
        status: result.status,
        brokerRef: result.brokerRef ?? null,
        reason: result.reason ?? null,
      },
    });
  } catch (err) {
    console.error("[autobet] failed to persist AutobetTicket (bet decision itself still stands):", err);
  }
}
