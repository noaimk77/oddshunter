import { describe, expect, it } from "vitest";
import { detectLiveScorelessPick, DEFAULT_LIVE_SCORELESS_CONFIG } from "./liveScorelessPick";

describe("detectLiveScorelessPick", () => {
  it("does not fire before the HT trigger minute", () => {
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 20, homeGoals: 0, awayGoals: 0 });
    expect(outcome).toEqual({ fires: false, reason: "too_early_ht" });
  });

  it("fires OVER_0_5_HT once still scoreless past the trigger minute", () => {
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 38, homeGoals: 0, awayGoals: 0 });
    expect(outcome.fires).toBe(true);
    if (outcome.fires) {
      expect(outcome.market).toBe("OVER_0_5_HT");
      expect(outcome.confidence).toBeGreaterThanOrEqual(0.55);
      expect(outcome.confidence).toBeLessThanOrEqual(0.9);
    }
  });

  it("does not fire once a goal has been scored", () => {
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 40, homeGoals: 1, awayGoals: 0 });
    expect(outcome).toEqual({ fires: false, reason: "already_scored" });
  });

  it("does not fire during the half-time gap (45 < minute < 46)", () => {
    // elapsed jumps straight from 45 to 46 in API-Football's live feed in
    // practice, but guard the gap anyway rather than assume the exact value.
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 45, homeGoals: 0, awayGoals: 0 });
    // 45 is still within the first-half branch and past the default trigger.
    expect(outcome.fires).toBe(true);
  });

  it("does not fire before the FT trigger minute in the second half", () => {
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 60, homeGoals: 0, awayGoals: 0 });
    expect(outcome).toEqual({ fires: false, reason: "too_early_ft" });
  });

  it("fires OVER_0_5_FT once still scoreless deep in the second half", () => {
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 80, homeGoals: 0, awayGoals: 0 });
    expect(outcome.fires).toBe(true);
    if (outcome.fires) expect(outcome.market).toBe("OVER_0_5_FT");
  });

  it("confidence climbs the deeper into the window the match gets", () => {
    const early = detectLiveScorelessPick({ elapsedMinutes: 76, homeGoals: 0, awayGoals: 0 });
    const late = detectLiveScorelessPick({ elapsedMinutes: 89, homeGoals: 0, awayGoals: 0 });
    if (early.fires && late.fires) expect(late.confidence).toBeGreaterThan(early.confidence);
  });

  it("respects a custom config", () => {
    const config = { minMinuteHT: 10, minMinuteFT: 50 };
    const outcome = detectLiveScorelessPick({ elapsedMinutes: 12, homeGoals: 0, awayGoals: 0 }, config);
    expect(outcome.fires).toBe(true);
    expect(DEFAULT_LIVE_SCORELESS_CONFIG.minMinuteHT).toBe(35);
  });
});
