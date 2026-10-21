import { describe, expect, it } from "vitest";
import { detectMomentumPick, DEFAULT_MOMENTUM_CONFIG, type TeamMatchStats } from "./momentum";

function stats(overrides: Partial<TeamMatchStats> = {}): TeamMatchStats {
  return { shotsOnGoal: 0, totalShots: 0, cornerKicks: 0, possessionPct: 50, expectedGoals: 0, goals: 0, ...overrides };
}

describe("detectMomentumPick", () => {
  it("fires an OVER pick when combined xG far exceeds the actual score, with enough shots and time", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 60,
      home: stats({ expectedGoals: 1.8, shotsOnGoal: 5, goals: 0 }),
      away: stats({ expectedGoals: 0.6, shotsOnGoal: 3, goals: 0 }),
    });
    expect(outcome.fires).toBe(true);
    if (outcome.fires && outcome.market === "OVER") {
      expect(outcome.line).toBe(0.5);
      expect(outcome.confidence).toBeGreaterThan(0);
      expect(outcome.minutesRemaining).toBe(30);
    } else {
      throw new Error("expected an OVER pick");
    }
  });

  it("does not fire when too little match time remains, even with a big xG gap", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 80,
      home: stats({ expectedGoals: 2.5, shotsOnGoal: 8, goals: 0 }),
      away: stats({ expectedGoals: 0, shotsOnGoal: 0, goals: 0 }),
    });
    expect(outcome).toEqual({ fires: false, reason: "not_enough_time_remaining" });
  });

  it("does not fire an OVER pick when xG gap is large but shot volume is too thin (one fluky shot)", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 50,
      home: stats({ expectedGoals: 1.5, shotsOnGoal: 1, goals: 0 }),
      away: stats({ expectedGoals: 0, shotsOnGoal: 0, goals: 0 }),
    });
    expect(outcome.fires).toBe(false);
  });

  it("fires a BTTS pick when the scoreless side has real underlying pressure", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 55,
      home: stats({ goals: 1, shotsOnGoal: 2, expectedGoals: 1.1 }),
      away: stats({ goals: 0, shotsOnGoal: 3, expectedGoals: 1.0 }),
    });
    expect(outcome.fires).toBe(true);
    if (outcome.fires && outcome.market === "BTTS") {
      expect(outcome.scorelessTeam).toBe("away");
    } else {
      throw new Error("expected a BTTS pick");
    }
  });

  it("does not fire BTTS when both teams have already scored", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 55,
      home: stats({ goals: 1, shotsOnGoal: 2, expectedGoals: 1.1 }),
      away: stats({ goals: 1, shotsOnGoal: 3, expectedGoals: 1.0 }),
    });
    expect(outcome.fires).toBe(false);
  });

  it("does not fire BTTS when the scoreless side has too little underlying pressure", () => {
    const outcome = detectMomentumPick({
      elapsedMinutes: 55,
      home: stats({ goals: 1, shotsOnGoal: 2, expectedGoals: 1.1 }),
      away: stats({ goals: 0, shotsOnGoal: 0, expectedGoals: 0.1 }),
    });
    expect(outcome.fires).toBe(false);
  });

  it("respects a custom config", () => {
    const looseConfig = { ...DEFAULT_MOMENTUM_CONFIG, minXgGap: 0.2, minShotsOnGoalCombined: 1 };
    const outcome = detectMomentumPick(
      {
        elapsedMinutes: 40,
        home: stats({ expectedGoals: 0.3, shotsOnGoal: 1, goals: 0 }),
        away: stats({ expectedGoals: 0, shotsOnGoal: 0, goals: 0 }),
      },
      looseConfig,
    );
    expect(outcome.fires).toBe(true);
  });
});
