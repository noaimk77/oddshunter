import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Computes and persists the per-league CONDITIONAL hit-rate a strategy
 * relies on — "given the match was still in trigger state X at minute Y,
 * how often did it end up satisfying the strategy" — not a raw league
 * average. This is the actual methodology behind InPlay Alerts' 74-77%
 * figures (Noaim, 2026-08-24: "pourquoi je ne reçois pas les mêmes
 * alertes... vous êtes censé être pareil" — the previous version computed
 * a flat per-league average, which structurally caps out lower and doesn't
 * match their per-state "combinaison" framing).
 *
 * The key design point: `precondition()` and `won()` below are the EXACT
 * same functions strategyRunner.ts's candidateTriggers() uses live — so the
 * historical sample and the live trigger can never silently diverge (the
 * old version had two independent hardcoded copies of "minute ≤ 15, score
 * 0-0", one here-ish and one in the runner; this version has one source of
 * truth).
 *
 * Requires `Event.firstHalfGoalMinutes` to be backfilled (see
 * historicalCollector.backfillGoalMinutes) — events without it are skipped
 * entirely rather than treated as scoreless, since null means "unknown",
 * not "no goals".
 */

export interface StrategyDef {
  label: string;
  minOdds: number;
  /** Latest minute at which this strategy's live trigger still fires — the
   *  checkpoint used to bucket historical matches (see strategyRunner's
   *  candidateTriggers, which checks `fixture.minute <= checkpointMinute`). */
  checkpointMinute: number;
  /** Max total first-half goals allowed at the checkpoint for the live
   *  trigger to still fire (0 for "still 0-0", 1 for "at most one goal so
   *  far", etc.) — mirrors strategyRunner's goal-count guard. */
  maxGoalsAtCheckpoint: number;
  /** Total first-half goals required for the strategy to have "hit". */
  htGoalsRequired: number;
}

export const STRATEGY_DEFS = {
  over_0_5_ht_by_league: {
    label: "Over 0.5 HT by League",
    minOdds: 1.5,
    checkpointMinute: 15,
    maxGoalsAtCheckpoint: 0,
    htGoalsRequired: 1,
  },
  over_1_5_ht_by_league: {
    label: "Over 1.5 HT by League",
    minOdds: 1.5,
    checkpointMinute: 20,
    maxGoalsAtCheckpoint: 1,
    htGoalsRequired: 2,
  },
} as const satisfies Record<string, StrategyDef>;

export type StrategyName = keyof typeof STRATEGY_DEFS;

export function isStrategyName(x: string): x is StrategyName {
  return x in STRATEGY_DEFS;
}

/** How many first-half goals had been scored by `checkpointMinute`, given
 *  the sorted list of first-half goal minutes. Shared by both the
 *  historical bucketing below and (conceptually) by the live trigger, which
 *  computes the same count directly from the live score instead of a goal-
 *  minute list (it doesn't need to — it already knows the current score). */
function goalsScoredBy(goalMinutes: number[], checkpointMinute: number): number {
  return goalMinutes.filter((m) => m <= checkpointMinute).length;
}

/** True iff a historical match, replayed up to `def.checkpointMinute`,
 *  would have satisfied this strategy's live trigger precondition. */
function matchesPrecondition(def: StrategyDef, goalMinutes: number[]): boolean {
  return goalsScoredBy(goalMinutes, def.checkpointMinute) <= def.maxGoalsAtCheckpoint;
}

/** True iff the match's total first-half goals satisfy the strategy's win
 *  condition — total goals scored across the WHOLE first half, not just up
 *  to the checkpoint (i.e. did enough goals eventually land before HT). */
function wonOutcome(def: StrategyDef, goalMinutes: number[]): boolean {
  return goalMinutes.length >= def.htGoalsRequired;
}

export interface ComputedStats {
  strategyName: StrategyName;
  competitionId: string;
  occurrences: number;
  hits: number;
  hitRatePct: number;
}

/**
 * Recomputes and upserts CONDITIONAL stats for one (strategy × competition):
 * among historical matches that were still in the trigger's precondition
 * state at its checkpoint minute, what fraction went on to satisfy the
 * strategy. Only considers events with a backfilled `firstHalfGoalMinutes`
 * (skips events where it's still null — not yet backfilled, distinct from
 * an empty array which means "backfilled, no first-half goals").
 */
export async function computeStrategyStats(
  db: PrismaClient,
  strategyName: StrategyName,
  competitionId: string,
  seasons: string[],
): Promise<ComputedStats> {
  const def = STRATEGY_DEFS[strategyName];

  const events = await db.event.findMany({
    where: { competitionId, status: "finished" },
    select: { firstHalfGoalMinutes: true },
  });

  let occurrences = 0;
  let hits = 0;
  for (const e of events) {
    if (e.firstHalfGoalMinutes === null) continue; // not backfilled yet — excluded, not assumed scoreless
    const goalMinutes = e.firstHalfGoalMinutes as number[];
    if (!matchesPrecondition(def, goalMinutes)) continue; // this match never reached our trigger state
    occurrences++;
    if (wonOutcome(def, goalMinutes)) hits++;
  }
  const hitRatePct = occurrences === 0 ? 0 : (hits / occurrences) * 100;

  await db.strategyStats.upsert({
    where: { strategyName_competitionId: { strategyName, competitionId } },
    create: {
      strategyName,
      competitionId,
      seasons,
      occurrences,
      hits,
      hitRatePct,
      minOdds: def.minOdds,
    },
    update: {
      seasons,
      occurrences,
      hits,
      hitRatePct,
      minOdds: def.minOdds,
      lastComputedAt: new Date(),
    },
  });

  return { strategyName, competitionId, occurrences, hits, hitRatePct };
}

export interface StrategyStreak {
  /** "V V V V V" — space-separated V (win) / X (loss), oldest→newest,
   *  capped at `limit`. Empty string when there are no resolved picks yet. */
  history: string;
  /** How many consecutive losses at the very end of the sequence. Reset
   *  to 0 by any V. Matches InPlay Alerts' `defaite_en_cours` semantics. */
  currentLosingStreak: number;
}

/** Reads the last N resolved picks and formats the streak line the alert
 *  message renders — separated from stats compute because it changes with
 *  every new pick resolution, not just when historical data updates. */
export async function getStrategyStreak(
  db: PrismaClient,
  strategyName: StrategyName,
  competitionId: string,
  limit = 5,
): Promise<StrategyStreak> {
  const picks = await db.strategyPick.findMany({
    where: {
      strategyName,
      event: { competitionId },
      resolvedAt: { not: null },
      hit: { not: null },
    },
    orderBy: { resolvedAt: "desc" },
    take: limit,
    select: { hit: true },
  });
  // Oldest → newest for display, matching InPlay Alerts (`V V V V X`
  // where the rightmost letter is the most recent result).
  const inOrder = picks.slice().reverse();
  const history = inOrder.map((p) => (p.hit ? "V" : "X")).join(" ");

  let currentLosingStreak = 0;
  for (const p of picks) {
    // picks is desc — first entry is most recent. Walk from most recent
    // and count until a win breaks the streak.
    if (p.hit === false) currentLosingStreak++;
    else break;
  }

  return { history, currentLosingStreak };
}
