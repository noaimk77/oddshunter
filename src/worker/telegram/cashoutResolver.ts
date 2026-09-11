import type { PrismaClient } from "@/generated/prisma/client";
import type { TelegramClient } from "telegram";
import { fetchLiveScore, fetchFixtureTiming } from "../providers/thesportsdb";
import { fuzzyFixtureMatch } from "./tipParser";
import { sendCashoutFollowup } from "./vipGroup";

/**
 * Cash-out follow-up pipeline. Complements the existing "one-shot consensus
 * alert" flow: some fraction of picks (rare in football, common in esports)
 * get re-priced or explicitly recalled by source channels AFTER we posted
 * them to the VIP. When that happens the abonné needs to see it while the
 * match is still in play — Noaim 2026-09-11: "1 seul groupe suffit et tant
 * que le match est en cours". A single source signal on a still-in-play
 * fixture triggers a REPLY on the original VIP alert, once, ever.
 *
 * Detection is deliberately narrow (see CASHOUT_SIGNAL_RE): only phrases
 * that mean "sortez maintenant". "Cashout won 2-1" from a scoreboard is
 * NOT a signal; it's a result announcement.
 */

/**
 * Phrases that mean "close the bet now". Anchored on real tipster wording:
 *   - "cash out", "cashout", "cash-out", "cashez", "encaissez", "cash out now"
 *   - "🟠 cashout", "⚠️ cashout", "cashout ⚠️"
 *   - "sortez maintenant" / "sortir maintenant" — French tipster short-hand
 * Excludes scoreboard-style "cashed out at 2.35" (past tense, a result not
 * an instruction) via the `?!ed\b` guard.
 */
const CASHOUT_SIGNAL_RE = /\b(?:cash[\s-]*out(?!ed\b)|cashez|encaissez|sortez\s+maintenant|sortir\s+maintenant)\b/i;

export function looksLikeCashoutSignal(rawText: string): boolean {
  return CASHOUT_SIGNAL_RE.test(rawText);
}

/**
 * True when the match is CURRENTLY in play (1H / HT / 2H / ET) OR upcoming.
 * "In progress" per Noaim's brief includes matches that haven't kicked off
 * yet — an abonné can still cash out on a pre-match ticket. FT / finished
 * blocks the reply: too late to act, and the alert should carry a graded
 * WON/LOST outcome instead.
 *
 * Falls back on `fetchFixtureTiming` when the live feed has nothing — the
 * live feed only lists soccer matches actively being played, so a
 * pre-match ticket 2h before kickoff won't appear there. Only if BOTH
 * sources say "finished" (or one says finished and the other has nothing)
 * do we treat it as too late; anything ambiguous errs on posting the
 * warning (better to warn late than miss a real cash-out).
 */
async function matchStillActionable(homeTeam: string, awayTeam: string): Promise<boolean> {
  const live = await fetchLiveScore(homeTeam, awayTeam).catch(() => null);
  if (live) {
    const status = live.status.toUpperCase();
    if (status === "FT" || status === "AET" || status === "PEN" || status.includes("FINISH")) return false;
    return true; // any other non-empty status = running
  }
  const timing = await fetchFixtureTiming(homeTeam, awayTeam).catch(() => null);
  if (timing?.status === "finished") return false;
  if (timing?.status === "notstarted") return true;
  // Neither source could tell us — post the warning anyway (see above).
  return true;
}

/**
 * One resolver pass — scans recent ScrapedTips for cash-out signals and,
 * for each one that fuzzy-matches an already-posted, still-actionable
 * ConsensusAlert we haven't replied on yet, posts the cash-out reply.
 *
 * Runs on the same cadence as `resolvePendingConsensusOutcomes` (main
 * loop, every few minutes). Deliberately re-scans a wider window than a
 * strict "since last pass" tail — the same signal can be re-detected
 * safely because `cashoutRepliedAt` is the idempotency latch.
 */
export async function resolveCashoutSignals(
  db: PrismaClient,
  client: TelegramClient,
  options: { signalWindowMinutes?: number; alertLookbackHours?: number } = {},
): Promise<{ replied: number; skipped: number }> {
  const signalWindowMinutes = options.signalWindowMinutes ?? 20;
  const alertLookbackHours = options.alertLookbackHours ?? 24;

  const signals = await db.scrapedTip.findMany({
    where: {
      detectedAt: { gte: new Date(Date.now() - signalWindowMinutes * 60_000) },
      homeTeam: { not: null },
      awayTeam: { not: null },
    },
    orderBy: { detectedAt: "asc" },
    take: 500,
  });

  const cashoutSignals = signals.filter((s) => looksLikeCashoutSignal(s.rawText));
  if (cashoutSignals.length === 0) return { replied: 0, skipped: 0 };

  // Only alerts we actually posted and haven't cashout-replied on yet. The
  // match-finished guard runs per candidate against the live feed rather
  // than on `outcome` — an alert can be still in play but ungraded (the
  // outcome resolver runs on its own cadence), and we want to warn during
  // the match, not wait for it to finish.
  const eligibleAlerts = await db.consensusAlert.findMany({
    where: {
      sentAt: { gte: new Date(Date.now() - alertLookbackHours * 3600_000) },
      sentMessageId: { not: null },
      homeTeam: { not: null },
      awayTeam: { not: null },
      cashoutRepliedAt: null,
    },
    orderBy: { sentAt: "desc" },
  });
  if (eligibleAlerts.length === 0) return { replied: 0, skipped: cashoutSignals.length };

  let replied = 0;
  let skipped = 0;

  for (const alert of eligibleAlerts) {
    if (!alert.homeTeam || !alert.awayTeam || !alert.sentMessageId) continue;

    const matchingSignal = cashoutSignals.find((s) =>
      fuzzyFixtureMatch(
        { homeTeam: alert.homeTeam!, awayTeam: alert.awayTeam! },
        { homeTeam: s.homeTeam!, awayTeam: s.awayTeam! },
      ),
    );
    if (!matchingSignal) continue;

    const actionable = await matchStillActionable(alert.homeTeam, alert.awayTeam);
    if (!actionable) {
      // Latch it anyway so we don't rescan this signal against this alert
      // on the next pass — the cash-out window is over.
      await db.consensusAlert.update({
        where: { id: alert.id },
        data: { cashoutRepliedAt: new Date() },
      });
      console.log(`[cashoutResolver] cash-out signal for ${alert.homeTeam} vs ${alert.awayTeam} — match is over, not posting.`);
      skipped++;
      continue;
    }

    const posted = await sendCashoutFollowup(client, {
      replyToMessageId: Number(alert.sentMessageId),
      homeTeam: alert.homeTeam,
      awayTeam: alert.awayTeam,
    });
    if (!posted) {
      // Telegram send failed — leave `cashoutRepliedAt` null so the next
      // pass retries. Don't burn the latch on a transient failure.
      console.warn(`[cashoutResolver] send failed for ${alert.homeTeam} vs ${alert.awayTeam}, will retry.`);
      skipped++;
      continue;
    }

    await db.consensusAlert.update({
      where: { id: alert.id },
      data: { cashoutRepliedAt: new Date() },
    });
    console.log(
      `[cashoutResolver] posted cash-out follow-up on ${alert.homeTeam} vs ${alert.awayTeam} (source: "${matchingSignal.sourceChatTitle ?? matchingSignal.sourceChatId}").`,
    );
    replied++;
  }

  return { replied, skipped };
}
