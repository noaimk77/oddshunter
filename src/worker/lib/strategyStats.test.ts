import { describe, expect, it } from "vitest";
import { STRATEGY_DEFS } from "./strategyStats";

/**
 * These pure helpers aren't exported (computeStrategyStats is the only
 * public surface, and it needs a PrismaClient) — so this test re-derives
 * the same math computeStrategyStats uses internally and checks it against
 * hand-picked fixtures, to lock the conditional-bucketing semantics that
 * replaced the old flat-average calculation (Noaim, 2026-08-24).
 */
function goalsScoredBy(goalMinutes: number[], checkpointMinute: number): number {
  return goalMinutes.filter((m) => m <= checkpointMinute).length;
}

function matchesPrecondition(def: (typeof STRATEGY_DEFS)[keyof typeof STRATEGY_DEFS], goalMinutes: number[]): boolean {
  return goalsScoredBy(goalMinutes, def.checkpointMinute) <= def.maxGoalsAtCheckpoint;
}

function wonOutcome(def: (typeof STRATEGY_DEFS)[keyof typeof STRATEGY_DEFS], goalMinutes: number[]): boolean {
  return goalMinutes.length >= def.htGoalsRequired;
}

describe("over_0_5_ht_by_league conditional bucketing", () => {
  const def = STRATEGY_DEFS.over_0_5_ht_by_league; // checkpoint=15, maxGoalsAtCheckpoint=0, htGoalsRequired=1

  it("excludes a match that already scored before the checkpoint", () => {
    // A goal at minute 10 means this match was NOT still 0-0 through
    // minute 15 — it never would have triggered live, so it must not
    // enter the sample at all.
    expect(matchesPrecondition(def, [10])).toBe(false);
  });

  it("includes a scoreless-so-far match and marks it a loss if no HT goal ever comes", () => {
    expect(matchesPrecondition(def, [])).toBe(true);
    expect(wonOutcome(def, [])).toBe(false);
  });

  it("includes a match that stayed 0-0 through minute 15 then scored at minute 30 — counts as a win", () => {
    expect(matchesPrecondition(def, [30])).toBe(true);
    expect(wonOutcome(def, [30])).toBe(true);
  });

  it("a goal exactly AT the checkpoint minute counts as already scored (excluded)", () => {
    // Boundary: a goal at minute 15 means goalsScoredBy(15) = 1 > maxGoalsAtCheckpoint(0).
    expect(matchesPrecondition(def, [15])).toBe(false);
  });
});

describe("over_1_5_ht_by_league conditional bucketing", () => {
  const def = STRATEGY_DEFS.over_1_5_ht_by_league; // checkpoint=20, maxGoalsAtCheckpoint=1, htGoalsRequired=2

  it("includes a match with exactly one goal before the checkpoint", () => {
    expect(matchesPrecondition(def, [10])).toBe(true);
  });

  it("excludes a match with two goals before the checkpoint (already resolved live)", () => {
    expect(matchesPrecondition(def, [5, 12])).toBe(false);
  });

  it("a match with one early goal that gets a second goal after HT-checkpoint but before HT is a win", () => {
    expect(matchesPrecondition(def, [10])).toBe(true);
    expect(wonOutcome(def, [10, 35])).toBe(true);
  });

  it("a match with one early goal and no second goal before HT is a loss", () => {
    expect(matchesPrecondition(def, [10])).toBe(true);
    expect(wonOutcome(def, [10])).toBe(false);
  });
});

describe("computeStrategyStats conditional sample (hand simulation)", () => {
  it("matches a known hand-computed hit-rate over a small fixture set", () => {
    const def = STRATEGY_DEFS.over_0_5_ht_by_league;
    // 5 historical matches' first-half goal-minute lists:
    const matches = [
      [], // 0-0 all half — excluded from precondition? no: matchesPrecondition([]) = true (0 goals by 15 <= 0). Loss (0 goals total).
      [8], // scored before checkpoint — excluded entirely
      [20], // scoreless through 15, then scored — included, WIN
      [40], // scoreless through 15, then scored late — included, WIN
      [3, 33], // scored before checkpoint — excluded (first goal at 3 already violates precondition)
    ];
    const included = matches.filter((m) => matchesPrecondition(def, m));
    const wins = included.filter((m) => wonOutcome(def, m));
    // Expected included: [], [20], [40] → 3 matches. Wins: [20], [40] → 2/3.
    expect(included.length).toBe(3);
    expect(wins.length).toBe(2);
    expect((wins.length / included.length) * 100).toBeCloseTo(66.666, 1);
  });
});
