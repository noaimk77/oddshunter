import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { fuzzyFixtureMatch, slugTeam } from "../telegram/tipParser";
import { looksLikeCashoutSignal } from "../telegram/cashoutResolver";
import { sellPolymarketPosition, placePolymarketOrder } from "./polymarketClient";
import { resolvePolymarketBet } from "./polymarketMatcher";
import { decideStake } from "./riskEngine";
import { fetchPolymarketBankrollUsd } from "./bankroll";

/**
 * Real-money cash-out/flip execution for LIVE Polymarket positions. This is
 * separate from telegram/cashoutResolver.ts, which only posts a warning
 * reply to the VIP group (football-oriented, ConsensusAlert-keyed) — this
 * one actually sells (and, for a flip, re-buys) on the exchange, keyed to
 * AutobetTicket rows the autobet router itself placed. Two different
 * concerns sharing similar signal wording on purpose: the VIP warning is
 * for subscribers betting manually on other books; this is for the money
 * actually sitting in the bot's own wallet.
 *
 * Noaim 2026-09-27, from the trusted channel's real message history:
 *   - "Cashout" / "Match w2 cashout" — close the position, nothing more.
 *   - "Flip bet" — close the position AND buy the opposite side, sized like
 *     any other "Max bet" pick (20% of bankroll — Noaim's own words: "quand
 *     il dit cash out et parier sur l'opposé, on passe à du 20%").
 * Distinguished by wording only; both need a position to close, so a flip
 * signal that turns out to have no open position is just treated as a plain
 * new "max" bet on the opposite side (handled naturally: sell finds nothing
 * to sell, skips that leg, the buy leg still fires).
 */
const FLIP_SIGNAL_RE = /\bflip\b/i;

export function looksLikeFlipSignal(rawText: string): boolean {
  return FLIP_SIGNAL_RE.test(rawText);
}

interface ExecutionOutcome {
  closed: number;
  flippedIn: number;
  skipped: number;
  failed: number;
}

/**
 * One pass: scans recent ScrapedTips for cash-out/flip wording, matches
 * each against an open (PLACED, not yet closed) Polymarket AutobetTicket by
 * fuzzy fixture, and executes. Runs on the FAST detection cadence (see
 * index.ts) rather than the slow ingestion one — a live esports match moves
 * in minutes, waiting 15 min defeats the point of a cash-out.
 *
 * Idempotent via `closedByTicketId`: once an open ticket is closed, it's
 * excluded from the next pass's candidate query, so re-detecting the same
 * signal text on a later scan can't double-sell.
 */
export async function resolveCashoutExecutions(
  db: PrismaClient,
  options: { signalWindowMinutes?: number; openLookbackHours?: number } = {},
): Promise<ExecutionOutcome> {
  const signalWindowMinutes = options.signalWindowMinutes ?? 20;
  const openLookbackHours = options.openLookbackHours ?? 24;
  const out: ExecutionOutcome = { closed: 0, flippedIn: 0, skipped: 0, failed: 0 };

  const signals = await db.scrapedTip.findMany({
    where: { detectedAt: { gte: new Date(Date.now() - signalWindowMinutes * 60_000) }, homeTeam: { not: null }, awayTeam: { not: null } },
    orderBy: { detectedAt: "asc" },
    take: 500,
  });
  const actionSignals = signals.filter((s) => looksLikeCashoutSignal(s.rawText) || looksLikeFlipSignal(s.rawText));
  if (actionSignals.length === 0) return out;

  const openTickets = await db.autobetTicket.findMany({
    where: {
      broker: "POLYMARKET",
      status: "PLACED",
      closedByTicketId: null,
      polyTokenId: { not: null },
      createdAt: { gte: new Date(Date.now() - openLookbackHours * 3600_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (openTickets.length === 0) return out;

  for (const ticket of openTickets) {
    const signal = actionSignals.find((s) => fuzzyFixtureMatch({ homeTeam: ticket.homeTeam, awayTeam: ticket.awayTeam }, { homeTeam: s.homeTeam!, awayTeam: s.awayTeam! }));
    if (!signal) continue;
    const isFlip = looksLikeFlipSignal(signal.rawText);

    if (!ticket.polyTokenId || !ticket.sizeShares || ticket.sizeShares <= 0) {
      console.warn(`[cashoutExecutor] ${ticket.homeTeam} vs ${ticket.awayTeam}: open ticket has no known share size, can't sell — skipping.`);
      out.skipped++;
      continue;
    }

    let sellStatus: "PLACED" | "FAILED" = "FAILED";
    let sellReason: string | undefined;
    let sellRef: string | null = null;
    try {
      const sold = await sellPolymarketPosition(ticket.polyTokenId, ticket.sizeShares);
      sellStatus = sold.ok ? "PLACED" : "FAILED";
      sellReason = sold.ok ? (isFlip ? "flip — jambe vente" : "cash-out") : sold.error;
      sellRef = sold.orderId ?? null;
    } catch (err) {
      sellReason = `sell a échoué : ${err instanceof Error ? err.message : String(err)}`;
    }

    const closeTicket = await db.autobetTicket.create({
      data: {
        consensusFingerprint: ticket.consensusFingerprint,
        broker: "POLYMARKET",
        sport: "esports",
        homeTeam: ticket.homeTeam,
        awayTeam: ticket.awayTeam,
        market: ticket.market,
        selection: ticket.selection,
        stakeEur: 0, // a sell has no "stake", it liquidates one
        status: sellStatus,
        brokerRef: sellRef,
        reason: sellReason,
        polyTokenId: ticket.polyTokenId,
        polyConditionId: ticket.polyConditionId,
      },
    });
    await db.autobetTicket.update({ where: { id: ticket.id }, data: { status: "CLOSED", closedByTicketId: closeTicket.id } });

    if (sellStatus !== "PLACED") {
      console.error(`[cashoutExecutor] SELL FAILED ${ticket.homeTeam} vs ${ticket.awayTeam}: ${sellReason}`);
      out.failed++;
      continue;
    }
    console.log(`[cashoutExecutor] cashed out ${ticket.homeTeam} vs ${ticket.awayTeam} (${ticket.sizeShares} shares) — ref ${sellRef ?? "n/a"}.`);
    out.closed++;

    if (!isFlip) continue;

    // Flip's buy leg: the OPPOSITE team from what this ticket held, sized
    // like a fresh "max" (20%) pick — Noaim's own rule, not a function of
    // the sale proceeds. Only defined for a moneyline (1X2) ticket — "flip"
    // on a handicap/totals position has no unambiguous "opposite side"
    // without guessing a line, so those are skipped rather than guessed.
    if (ticket.market !== "1X2") {
      console.warn(`[cashoutExecutor] flip on ${ticket.homeTeam} vs ${ticket.awayTeam}: market ${ticket.market} has no defined "opposite side", buy leg skipped.`);
      continue;
    }
    const homeSlug = slugTeam(ticket.homeTeam);
    const awaySlug = slugTeam(ticket.awayTeam);
    const oppositeSelection = ticket.selection === homeSlug ? awaySlug : ticket.selection === awaySlug ? homeSlug : null;
    if (!oppositeSelection) {
      console.warn(`[cashoutExecutor] flip on ${ticket.homeTeam} vs ${ticket.awayTeam}: original selection "${ticket.selection}" isn't a recognized team side, buy leg skipped.`);
      continue;
    }

    try {
      const liveBankroll = await fetchPolymarketBankrollUsd();
      const decided = await decideStake(db, { tier: "max", liveBankroll });
      if (!decided.allowed) {
        console.warn(`[cashoutExecutor] flip buy-leg skipped for ${ticket.homeTeam} vs ${ticket.awayTeam}: ${decided.reason}`);
        continue;
      }
      const resolved = await resolvePolymarketBet({ homeTeam: ticket.homeTeam, awayTeam: ticket.awayTeam }, "1X2", oppositeSelection);
      if (!resolved.ok) {
        await db.autobetTicket.create({
          data: {
            consensusFingerprint: ticket.consensusFingerprint,
            broker: "POLYMARKET",
            sport: "esports",
            homeTeam: ticket.homeTeam,
            awayTeam: ticket.awayTeam,
            market: "1X2",
            selection: oppositeSelection,
            stakeEur: decided.decision.stakeEur,
            status: "REJECTED",
            reason: `flip buy-leg: ${resolved.reason}`,
          },
        });
        out.failed++;
        continue;
      }
      const placed = await placePolymarketOrder(resolved.match.outcome.tokenId, decided.decision.stakeEur);
      await db.autobetTicket.create({
        data: {
          consensusFingerprint: ticket.consensusFingerprint,
          broker: "POLYMARKET",
          sport: "esports",
          homeTeam: ticket.homeTeam,
          awayTeam: ticket.awayTeam,
          market: "1X2",
          selection: oppositeSelection,
          stakeEur: decided.decision.stakeEur,
          status: placed.ok ? "PLACED" : "FAILED",
          brokerRef: placed.orderId ?? null,
          polyTokenId: placed.ok ? resolved.match.outcome.tokenId : null,
          polyConditionId: placed.ok ? resolved.match.market.conditionId : null,
          reason: placed.ok ? "flip — jambe achat" : placed.error,
        },
      });
      if (placed.ok) {
        console.log(`[cashoutExecutor] flip buy-leg placed on ${oppositeSelection} — ${ticket.homeTeam} vs ${ticket.awayTeam}, ${decided.decision.stakeEur}€.`);
        out.flippedIn++;
      } else {
        out.failed++;
      }
    } catch (err) {
      console.error(`[cashoutExecutor] flip buy-leg crashed for ${ticket.homeTeam} vs ${ticket.awayTeam}:`, err);
      out.failed++;
    }
  }

  return out;
}
