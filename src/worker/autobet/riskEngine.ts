import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { getAutobetStakePercents, getAutobetDailyCapEur, getAutobetAssumedBankrollEur } from "../config";
import type { ConfidenceTier } from "./confidenceTier";

export interface StakeDecision {
  stakeEur: number;
  /** The % of bankroll applied, and the bankroll it was applied to — for
   *  the log line / ticket reason so a review of `/paris` is legible. */
  pct: number;
  bankroll: number;
  bankrollIsAssumed: boolean;
}

/**
 * Sizes a stake as a % of bankroll, chosen by the pick's confidence tier
 * (getAutobetStakePercents). Bankroll is the live wallet balance when
 * known; when it's 0/unreadable (e.g. nothing deposited yet) it falls back
 * to the assumed bankroll so simulation numbers stay realistic — a fallback
 * is flagged so a LIVE bet is never sized off an imaginary balance (the
 * caller rejects that case).
 *
 * Optional daily cap (getAutobetDailyCapEur, default 0 = none): sums today's
 * SIMULATED+PLACED stakes and refuses once the cap would be exceeded.
 */
export async function decideStake(
  db: PrismaClient,
  opts: { tier: ConfidenceTier | null; liveBankroll: number | null },
): Promise<{ allowed: true; decision: StakeDecision } | { allowed: false; reason: string }> {
  const percents = getAutobetStakePercents();
  // No tier caption at all (no "1/3"/"2/3"/"3/3"/"Max bet" under the pick)
  // is treated as the channel's highest ordinary confidence, "3/3" — Noaim
  // 2026-09-27: a pick posted with no explicit downgrade reads as full
  // confidence, not as a separate lower "default" tier.
  const pct = percents[opts.tier ?? "3/3"] ?? percents["3/3"];

  const hasLive = opts.liveBankroll != null && opts.liveBankroll > 0;
  const bankroll = hasLive ? (opts.liveBankroll as number) : getAutobetAssumedBankrollEur();
  const stakeEur = Math.round(bankroll * pct) / 100; // pct is a percentage

  if (stakeEur <= 0) {
    return { allowed: false, reason: "stake computed as 0 (empty bankroll and no assumed fallback)" };
  }

  const capEur = getAutobetDailyCapEur();
  if (capEur > 0) {
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);
    const todays = await db.autobetTicket.findMany({
      where: { createdAt: { gte: startOfDayUtc }, status: { in: ["SIMULATED", "PLACED"] } },
      select: { stakeEur: true },
    });
    const stakedToday = todays.reduce((sum, t) => sum + t.stakeEur, 0);
    if (stakedToday + stakeEur > capEur) {
      return { allowed: false, reason: `daily-cap (${stakedToday.toFixed(2)} déjà engagés / plafond ${capEur})` };
    }
  }

  return { allowed: true, decision: { stakeEur, pct, bankroll, bankrollIsAssumed: !hasLive } };
}
