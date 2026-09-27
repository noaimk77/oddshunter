import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { getAutobetStakeEur, getAutobetDailyCapEur } from "../config";

/**
 * Circuit breaker: sums today's AutobetTicket.stakeEur (SIMULATED rows count
 * too — the whole point of the simulation period is that the numbers it
 * produces must be the real numbers a live day would have produced, cap
 * included) and refuses a new stake once the daily cap is hit. UTC day
 * boundary, matches Turso's stored timestamps.
 */
export async function checkDailyCapAndReserveStake(
  db: PrismaClient,
): Promise<{ allowed: true; stakeEur: number } | { allowed: false; reason: string }> {
  const stakeEur = getAutobetStakeEur();
  const capEur = getAutobetDailyCapEur();

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const todays = await db.autobetTicket.findMany({
    where: {
      createdAt: { gte: startOfDayUtc },
      status: { in: ["SIMULATED", "PLACED"] },
    },
    select: { stakeEur: true },
  });
  const stakedToday = todays.reduce((sum, t) => sum + t.stakeEur, 0);

  if (stakedToday + stakeEur > capEur) {
    return { allowed: false, reason: `daily-cap (${stakedToday.toFixed(2)}€ déjà engagés / plafond ${capEur}€)` };
  }
  return { allowed: true, stakeEur };
}
