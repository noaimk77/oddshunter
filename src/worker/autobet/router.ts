import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { looksLikeEsports } from "../telegram/tipParser";
import { AUTOBET_LIVE_ENABLED, getAutobetStakeEur } from "../config";
import { decideStake } from "./riskEngine";
import { fetchPolymarketBankrollUsd } from "./bankroll";
import { resolvePs3838Bet } from "./ps3838Matcher";
import { placeBet as ps3838PlaceBet, Ps3838ConfigError } from "./ps3838Client";
import { resolvePolymarketBet } from "./polymarketMatcher";
import { placePolymarketOrder } from "./polymarketClient";
import type { AutobetBroker, AutobetCandidate, AutobetResult } from "./types";

/**
 * Polymarket routing enabled 2026-09-27: Noaim confirmed he is a Monaco
 * resident, not French — Monaco has no ANJ-style block and online betting
 * there sits in an unregulated grey zone (no licensing regime, but no
 * prohibition on offshore platforms either; verified via WebSearch, a
 * pending bill — Projet de loi n° 722 — may tighten this later). This is
 * genuinely different from the earlier France/ANJ finding that blocked
 * this route originally. From the Fly box (Paris) itself, polymarket.com/
 * gamma-api/clob all resolve to the real Polymarket cert anyway (tested via
 * `flyctl ssh console`), so nothing here needs any network workaround.
 */

/**
 * The full lifecycle for one consensus alert that was actually sent to the
 * VIP group: decide broker by sport, reserve today's stake against the
 * shared circuit breaker, resolve + place (or simulate) on that broker, and
 * persist exactly one AutobetTicket row either way. Never throws — a
 * failure anywhere becomes a FAILED/REJECTED ticket, because a bug in this
 * path must never take down the VIP alert pipeline that calls it.
 */
export async function autobetOnConsensus(db: PrismaClient, tip: AutobetCandidate, consensusFingerprint: string): Promise<AutobetResult> {
  const esports = looksLikeEsports(tip.homeTeam, tip.awayTeam);
  const broker: AutobetBroker = esports ? "POLYMARKET" : "PS3838";

  try {
    // Stake sizing differs by path: esports/Polymarket is % of the live
    // wallet bankroll driven by the pick's confidence tier; PS3838
    // (football) has no tier and stays on the flat EUR stake for now.
    let stakeEur: number;
    if (esports) {
      const liveBankroll = await fetchPolymarketBankrollUsd();
      const decided = await decideStake(db, { tier: tip.confidenceTier ?? null, liveBankroll });
      if (!decided.allowed) {
        const result: AutobetResult = { broker, status: "REJECTED", stakeEur: 0, reason: decided.reason };
        await persist(db, tip, consensusFingerprint, result);
        return result;
      }
      stakeEur = decided.decision.stakeEur;
      const d = decided.decision;
      console.log(
        `[autobet] stake ${stakeEur} = ${d.pct}% of ${d.bankrollIsAssumed ? "assumed " : ""}bankroll ${d.bankroll}` +
          ` (tier ${tip.confidenceTier ?? "default"}) — ${tip.homeTeam} vs ${tip.awayTeam}.`,
      );
    } else {
      stakeEur = getAutobetStakeEur();
    }

    const result = esports ? await runPolymarket(tip, stakeEur) : await runPs3838(tip, stakeEur);
    await persist(db, tip, consensusFingerprint, result);
    const ref = result.brokerRef ? ` — ref ${result.brokerRef}` : "";
    const line = `[autobet] ${result.status} ${result.broker} ${result.stakeEur}€${result.oddsAtBet ? ` @ ${result.oddsAtBet}` : ""} — ${tip.homeTeam} vs ${tip.awayTeam}${ref}.`;
    if (result.status === "FAILED") console.error(line, result.reason ?? "");
    else console.log(line);
    return result;
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

async function runPs3838(tip: AutobetCandidate, stakeEur: number): Promise<AutobetResult> {
  const broker: AutobetBroker = "PS3838";

  let resolved: Awaited<ReturnType<typeof resolvePs3838Bet>>;
  try {
    resolved = await resolvePs3838Bet(tip, tip.market, tip.selection);
  } catch (err) {
    const reason =
      err instanceof Ps3838ConfigError
        ? "PS3838_USERNAME/PS3838_PASSWORD non configurés."
        : `PS3838 fixture/line lookup a échoué : ${err instanceof Error ? err.message : String(err)}`;
    return { broker, status: "REJECTED", stakeEur, reason };
  }
  if (!resolved.ok) return { broker, status: "REJECTED", stakeEur, reason: resolved.reason };

  if (!AUTOBET_LIVE_ENABLED) {
    return { broker, status: "SIMULATED", stakeEur, oddsAtBet: resolved.price, reason: "AUTOBET_LIVE_ENABLED=false — mode simulation." };
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
    return {
      broker,
      status: ok ? "PLACED" : "REJECTED",
      stakeEur,
      oddsAtBet: resolved.price,
      brokerRef: placed.betId ? String(placed.betId) : null,
      reason: ok ? undefined : `PS3838 status ${placed.status}${placed.errorCode ? ` (${placed.errorCode})` : ""}`,
    };
  } catch (err) {
    const reason =
      err instanceof Ps3838ConfigError
        ? "PS3838_USERNAME/PS3838_PASSWORD non configurés — bascule impossible en réel."
        : `PS3838 place bet a échoué : ${err instanceof Error ? err.message : String(err)}`;
    return { broker, status: "FAILED", stakeEur, oddsAtBet: resolved.price, reason };
  }
}

async function runPolymarket(tip: AutobetCandidate, stakeEur: number): Promise<AutobetResult> {
  const broker: AutobetBroker = "POLYMARKET";

  const resolved = await resolvePolymarketBet(tip, tip.market, tip.selection);
  if (!resolved.ok) return { broker, status: "REJECTED", stakeEur, reason: resolved.reason };
  const { outcome } = resolved.match;

  if (!AUTOBET_LIVE_ENABLED) {
    return {
      broker,
      status: "SIMULATED",
      stakeEur,
      oddsAtBet: outcome.price,
      reason: `simulation (tier ${tip.confidenceTier ?? "défaut"}). Marché: ${resolved.match.market.question}`,
    };
  }

  try {
    const placed = await placePolymarketOrder(outcome.tokenId, stakeEur);
    return {
      broker,
      status: placed.ok ? "PLACED" : "FAILED",
      stakeEur,
      oddsAtBet: outcome.price,
      brokerRef: placed.orderId ?? null,
      reason: placed.ok ? undefined : placed.error,
    };
  } catch (err) {
    return { broker, status: "FAILED", stakeEur, oddsAtBet: outcome.price, reason: `Polymarket order a échoué : ${err instanceof Error ? err.message : String(err)}` };
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
