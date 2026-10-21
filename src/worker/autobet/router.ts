import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { looksLikeEsports } from "../telegram/tipParser";
import { AUTOBET_LIVE_ENABLED } from "../config";
import { decideStake } from "./riskEngine";
import { fetchPolymarketBankrollUsd } from "./bankroll";
import { resolvePolymarketBet } from "./polymarketMatcher";
import { placePolymarketOrder, waitForPolymarketFill } from "./polymarketClient";
import type { AutobetBroker, AutobetCandidate, AutobetResult } from "./types";
import { notifyAutobetAdmin } from "../telegram/adminNotify";

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
  // The trusted single-source esports channel ("Vip ESPORTS") is esports by
  // construction — real esports team names ("Forsaken", "Bushido Wildcats")
  // almost never carry a keyword the scan below looks for, which was
  // silently misrouting every one of its picks to the football broker
  // (PS3838, permanently rejected) — see AutobetCandidate.isTrustedEsportsSource.
  const esports = tip.isTrustedEsportsSource || looksLikeEsports(tip.homeTeam, tip.awayTeam);

  // PS3838 (football) disabled outright (Noaim, 2026-09-28) — shelved since
  // 2026-09-27 (10k$ deposit / 100k$ monthly turnover PER SPORT, declined,
  // out of scale) and every attempt was a guaranteed REJECTED ticket, just
  // burning a PS3838 API call for nothing. Skip football tips entirely
  // rather than call a broker known dead — Polymarket/esports only for now.
  if (!esports) {
    const result: AutobetResult = {
      broker: "PS3838",
      status: "REJECTED",
      stakeEur: 0,
      reason: "PS3838 désactivé pour l'instant — Polymarket (esport) uniquement (Noaim, 2026-09-28).",
    };
    await persist(db, tip, consensusFingerprint, result);
    return result;
  }
  const broker: AutobetBroker = "POLYMARKET";

  try {
    const liveBankroll = await fetchPolymarketBankrollUsd();
    const decided = await decideStake(db, { tier: tip.confidenceTier ?? null, liveBankroll });
    if (!decided.allowed) {
      const result: AutobetResult = { broker, status: "REJECTED", stakeEur: 0, reason: decided.reason };
      await persist(db, tip, consensusFingerprint, result);
      await notifyOnMiss(tip, result);
      return result;
    }
    const stakeEur = decided.decision.stakeEur;
    const d = decided.decision;
    console.log(
      `[autobet] stake ${stakeEur} = ${d.pct}% of ${d.bankrollIsAssumed ? "assumed " : ""}bankroll ${d.bankroll}` +
        ` (tier ${tip.confidenceTier ?? "default"}) — ${tip.homeTeam} vs ${tip.awayTeam}.`,
    );

    const result = await runPolymarket(tip, stakeEur);
    await persist(db, tip, consensusFingerprint, result);
    const ref = result.brokerRef ? ` — ref ${result.brokerRef}` : "";
    const line = `[autobet] ${result.status} ${result.broker} ${result.stakeEur}€${result.oddsAtBet ? ` @ ${result.oddsAtBet}` : ""} — ${tip.homeTeam} vs ${tip.awayTeam}${ref}.`;
    if (result.status === "FAILED") console.error(line, result.reason ?? "");
    else console.log(line);
    await notifyOnMiss(tip, result);
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
    await notifyOnMiss(tip, result);
    return result;
  }
}

/**
 * A trusted single-source esports pick (see AutobetCandidate.isTrustedEsportsSource)
 * has no second corroborating chat to fall back on — a REJECTED/FAILED
 * ticket here means real money that should have been staked, wasn't, with
 * nothing but a log line no one is watching (confirmed prod case:
 * "Forsaken vs The Otter Side", 2026-09-27, misrouted to PS3838 and
 * rejected — see tipListener.ts's adminNotify.ts for the mirror-image gap
 * on the VIP-send side). DM Noaim so he finds out the same day, not by
 * digging through Turso a week later.
 */
async function notifyOnMiss(tip: AutobetCandidate, result: AutobetResult): Promise<void> {
  if (!tip.isTrustedEsportsSource) return;
  if (result.status !== "REJECTED" && result.status !== "FAILED") return;
  await notifyAutobetAdmin(
    `⚠️ Autobet ${result.status} (Vip ESPORTS)\n${tip.homeTeam} vs ${tip.awayTeam} — ${tip.market} ${tip.selection}\n` +
      `Broker : ${result.broker}\nRaison : ${result.reason ?? "inconnue"}`,
  ).catch(() => {});
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
    if (!placed.ok) {
      return { broker, status: "FAILED", stakeEur, oddsAtBet: outcome.price, reason: placed.error };
    }
    // Settlement isn't instant — poll the Data API for the real filled
    // share count rather than trust a computed estimate, so a cash-out
    // later sells exactly what's actually held, not a guess.
    const sizeShares = await waitForPolymarketFill(outcome.tokenId);
    return {
      broker,
      status: "PLACED",
      stakeEur,
      oddsAtBet: outcome.price,
      brokerRef: placed.orderId ?? null,
      polyTokenId: outcome.tokenId,
      polyConditionId: resolved.match.market.conditionId,
      sizeShares: sizeShares > 0 ? sizeShares : null,
      reason: sizeShares > 0 ? undefined : "achat confirmé mais taille de position pas encore visible (settlement lent) — vérifier /positions plus tard",
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
        sport: tip.isTrustedEsportsSource || looksLikeEsports(tip.homeTeam, tip.awayTeam) ? "esports" : "football",
        homeTeam: tip.homeTeam,
        awayTeam: tip.awayTeam,
        market: tip.market,
        selection: tip.selection,
        stakeEur: result.stakeEur,
        oddsAtBet: result.oddsAtBet ?? null,
        status: result.status,
        brokerRef: result.brokerRef ?? null,
        reason: result.reason ?? null,
        polyTokenId: result.polyTokenId ?? null,
        polyConditionId: result.polyConditionId ?? null,
        sizeShares: result.sizeShares ?? null,
      },
    });
  } catch (err) {
    console.error("[autobet] failed to persist AutobetTicket (bet decision itself still stands):", err);
  }
}
