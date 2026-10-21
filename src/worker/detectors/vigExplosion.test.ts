import { describe, expect, it } from "vitest";
import { detectVigExplosion, type SelectionHistory } from "./vigExplosion";

const t0 = new Date("2026-08-19T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("detectVigExplosion", () => {
  it("rejects a market with fewer than 2 selections", () => {
    const selections: SelectionHistory[] = [{ selectionId: "home", history: [{ price: 2.0, timestamp: t0 }] }];
    expect(detectVigExplosion(selections)).toEqual({ fires: false, reason: "insufficient_data" });
  });

  it("rejects when a selection has no price data at all", () => {
    const selections: SelectionHistory[] = [
      { selectionId: "home", history: [{ price: 2.0, timestamp: t0 }] },
      { selectionId: "away", history: [] },
    ];
    expect(detectVigExplosion(selections)).toEqual({ fires: false, reason: "incomplete_market" });
  });

  it("rejects a market whose overround barely moves", () => {
    // Opening: 1/2.0 + 1/2.0 - 1 = 0%. Current: 1/1.98 + 1/1.98 - 1 ≈ 1.01% — below the 5pt default threshold.
    const selections: SelectionHistory[] = [
      {
        selectionId: "home",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.98, timestamp: minutes(5) },
        ],
      },
      {
        selectionId: "away",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.98, timestamp: minutes(5) },
        ],
      },
    ];
    expect(detectVigExplosion(selections)).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("fires when the overround jumps well past the threshold", () => {
    // Opening: 1/2.0 + 1/2.0 - 1 = 0%. Current: 1/1.5 + 1/1.5 - 1 ≈ 33.3%.
    const selections: SelectionHistory[] = [
      {
        selectionId: "home",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.5, timestamp: minutes(5) },
        ],
      },
      {
        selectionId: "away",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.5, timestamp: minutes(5) },
        ],
      },
    ];
    const result = detectVigExplosion(selections);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.openingOverroundPct).toBeCloseTo(0, 1);
      expect(result.currentOverroundPct).toBeCloseTo(33.3, 0);
      expect(result.increasePercentPoints).toBeCloseTo(33.3, 0);
    }
  });

  it("handles a three-way market (home/draw/away)", () => {
    const selections: SelectionHistory[] = [
      {
        selectionId: "home",
        history: [
          { price: 3.0, timestamp: minutes(0) },
          { price: 2.0, timestamp: minutes(5) },
        ],
      },
      {
        selectionId: "draw",
        history: [
          { price: 3.0, timestamp: minutes(0) },
          { price: 2.0, timestamp: minutes(5) },
        ],
      },
      {
        selectionId: "away",
        history: [
          { price: 3.0, timestamp: minutes(0) },
          { price: 2.0, timestamp: minutes(5) },
        ],
      },
    ];
    const result = detectVigExplosion(selections);
    expect(result.fires).toBe(true);
  });

  it("respects a custom threshold", () => {
    const selections: SelectionHistory[] = [
      {
        selectionId: "home",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.95, timestamp: minutes(5) },
        ],
      },
      {
        selectionId: "away",
        history: [
          { price: 2.0, timestamp: minutes(0) },
          { price: 1.95, timestamp: minutes(5) },
        ],
      },
    ];
    const result = detectVigExplosion(selections, { minIncreasePercentPoints: 1 });
    expect(result.fires).toBe(true);
  });
});
