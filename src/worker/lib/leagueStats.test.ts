import { describe, expect, it } from "vitest";
import { computeHitRate } from "./leagueStats";

describe("computeHitRate", () => {
  it("returns a null hit-rate when nothing has been decided yet", () => {
    expect(computeHitRate([])).toEqual({ wins: 0, losses: 0, voids: 0, decided: 0, hitRatePct: null });
    expect(computeHitRate([{ selectionWon: null }, { selectionWon: null }])).toEqual({
      wins: 0,
      losses: 0,
      voids: 2,
      decided: 0,
      hitRatePct: null,
    });
  });

  it("counts wins and losses, exposes voids separately", () => {
    const rows = [
      { selectionWon: true },
      { selectionWon: true },
      { selectionWon: false },
      { selectionWon: null },
    ];
    expect(computeHitRate(rows)).toEqual({
      wins: 2,
      losses: 1,
      voids: 1,
      decided: 3,
      hitRatePct: 67, // 2/3 rounded
    });
  });

  it("excludes voids from the denominator so a push doesn't dilute the rate", () => {
    // 5 wins, 5 losses, 90 voids — a naive "wins/total" would report 5%,
    // which is exactly the trap this helper is written to avoid.
    const rows = [
      ...Array(5).fill({ selectionWon: true }),
      ...Array(5).fill({ selectionWon: false }),
      ...Array(90).fill({ selectionWon: null }),
    ];
    const result = computeHitRate(rows);
    expect(result.hitRatePct).toBe(50);
    expect(result.decided).toBe(10);
    expect(result.voids).toBe(90);
  });
});
