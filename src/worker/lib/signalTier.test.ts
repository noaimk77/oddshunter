import { describe, expect, it } from "vitest";
import { classifySignalTier, tierBadge } from "./signalTier";

// Base signal that JUST barely passes the score floor. Every test adds
// indicators on top so we can watch the standard→premium boundary.
const baseAboveFloor = { score: 55 };

describe("classifySignalTier", () => {
  it("stays standard when the score is below the premium floor, whatever the indicators", () => {
    expect(
      classifySignalTier({
        score: 40, // right at the delivery floor, below the premium floor
        confirmingBookmakers: 4,
        crossMarketCount: 3,
        isLateMove: true,
        velocity: { pctPerMin: 1 },
      }),
    ).toBe("standard");
  });

  it("stays standard with zero confirming indicators", () => {
    expect(classifySignalTier(baseAboveFloor)).toBe("standard");
  });

  it("stays standard with only ONE indicator (no matter which)", () => {
    expect(classifySignalTier({ ...baseAboveFloor, confirmingBookmakers: 3 })).toBe("standard");
    expect(classifySignalTier({ ...baseAboveFloor, crossMarketCount: 2 })).toBe("standard");
    expect(classifySignalTier({ ...baseAboveFloor, isLateMove: true })).toBe("standard");
    expect(classifySignalTier({ ...baseAboveFloor, velocity: { pctPerMin: 0.5 } })).toBe("standard");
  });

  it("becomes premium as soon as two independent indicators fire together", () => {
    expect(
      classifySignalTier({ ...baseAboveFloor, confirmingBookmakers: 3, isLateMove: true }),
    ).toBe("premium");
    expect(
      classifySignalTier({ ...baseAboveFloor, crossMarketCount: 2, velocity: { pctPerMin: 0.6 } }),
    ).toBe("premium");
    expect(
      classifySignalTier({ ...baseAboveFloor, confirmingBookmakers: 3, crossMarketCount: 2 }),
    ).toBe("premium");
  });

  it("respects the indicator thresholds — a signal just below stays standard", () => {
    // 2 confirming books is one short of the 3 required — not an indicator.
    expect(
      classifySignalTier({ ...baseAboveFloor, confirmingBookmakers: 2, isLateMove: true }),
    ).toBe("standard");
    // 0.4%/min is below the 0.5 threshold — not "fast".
    expect(
      classifySignalTier({ ...baseAboveFloor, crossMarketCount: 2, velocity: { pctPerMin: 0.4 } }),
    ).toBe("standard");
  });

  it("premium survives with three or four indicators (defence in depth)", () => {
    expect(
      classifySignalTier({
        ...baseAboveFloor,
        confirmingBookmakers: 4,
        crossMarketCount: 3,
        isLateMove: true,
      }),
    ).toBe("premium");
    expect(
      classifySignalTier({
        score: 90,
        confirmingBookmakers: 5,
        crossMarketCount: 4,
        isLateMove: true,
        velocity: { pctPerMin: 1.5 },
      }),
    ).toBe("premium");
  });
});

describe("tierBadge", () => {
  it("returns the star badge for premium", () => {
    expect(tierBadge("premium")).toBe("⭐ PREMIUM");
  });

  it("returns an empty string for standard, safe to concat without a trailing space", () => {
    expect(tierBadge("standard")).toBe("");
  });
});
