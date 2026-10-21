import { describe, expect, it } from "vitest";
import { computeHitRate, computeROI } from "./leagueStats";

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

describe("computeROI — flat 1€ stakes at Signal.currentPrice", () => {
  it("returns null ROI when nothing is decided", () => {
    expect(computeROI([])).toEqual({ units: 0, decided: 0, roiPct: null });
    expect(computeROI([{ selectionWon: null, currentPrice: 2 }])).toEqual({ units: 0, decided: 0, roiPct: null });
  });

  it("a single winning bet at 2.0 pays exactly 1 unit of profit", () => {
    expect(computeROI([{ selectionWon: true, currentPrice: 2 }])).toEqual({ units: 1, decided: 1, roiPct: 100 });
  });

  it("a single lost bet costs exactly 1 unit", () => {
    expect(computeROI([{ selectionWon: false, currentPrice: 5 }])).toEqual({ units: -1, decided: 1, roiPct: -100 });
  });

  it("voids don't move units and don't count toward decided", () => {
    const rows = [
      { selectionWon: true, currentPrice: 2 },
      { selectionWon: null, currentPrice: 2 },
      { selectionWon: null, currentPrice: null },
    ];
    expect(computeROI(rows)).toEqual({ units: 1, decided: 1, roiPct: 100 });
  });

  it("a mixed run gives the arithmetically correct ROI% (5W @1.5 + 5L = 5×0.5 − 5×1 = −2.5 units, −25% on 10 bets)", () => {
    const rows = [
      ...Array(5).fill({ selectionWon: true, currentPrice: 1.5 }),
      ...Array(5).fill({ selectionWon: false, currentPrice: 2 }),
    ];
    expect(computeROI(rows)).toEqual({ units: -2.5, decided: 10, roiPct: -25 });
  });

  it("a signal with no price recorded is skipped for units but still counted as decided", () => {
    // Real data-integrity edge — a won signal whose currentPrice never got
    // captured. Better to under-report profit than to fake a price.
    const rows = [
      { selectionWon: true, currentPrice: null },
      { selectionWon: false, currentPrice: 2 },
    ];
    expect(computeROI(rows)).toEqual({ units: -1, decided: 2, roiPct: -50 });
  });

  it("rejects a nonsense currentPrice ≤ 1 (would be a free win otherwise)", () => {
    expect(computeROI([{ selectionWon: true, currentPrice: 0.9 }])).toEqual({ units: 0, decided: 1, roiPct: 0 });
    expect(computeROI([{ selectionWon: true, currentPrice: 1 }])).toEqual({ units: 0, decided: 1, roiPct: 0 });
  });

  it("rounds ROI% to one decimal, units to two", () => {
    const rows = [
      { selectionWon: true, currentPrice: 1.837 },
      { selectionWon: false, currentPrice: 2 },
      { selectionWon: true, currentPrice: 2.11 },
    ];
    const roi = computeROI(rows);
    // 0.837 − 1 + 1.11 = 0.947 units; roi = 0.947/3 = 31.5%
    expect(roi.units).toBe(0.95);
    expect(roi.decided).toBe(3);
    expect(roi.roiPct).toBe(31.6);
  });
});
