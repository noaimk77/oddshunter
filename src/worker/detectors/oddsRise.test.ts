import { describe, expect, it } from "vitest";
import { detectOddsRise, type PricePoint } from "./oddsRise";

const t0 = new Date("2026-08-19T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("detectOddsRise", () => {
  it("rejects with too little data", () => {
    expect(detectOddsRise([{ price: 2.0, timestamp: t0 }])).toEqual({ fires: false, reason: "insufficient_data" });
  });

  it("rejects a move smaller than the threshold", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 2.02, timestamp: minutes(10) },
    ];
    expect(detectOddsRise(history)).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("rejects a sufficiently large rise that hasn't persisted long enough", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 2.2, timestamp: minutes(1) }, // 10% rise, only 1 min ago
    ];
    expect(detectOddsRise(history)).toEqual({ fires: false, reason: "insufficient_persistence" });
  });

  it("fires on a large, persistent rise", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 2.1, timestamp: minutes(2) },
      { price: 2.2, timestamp: minutes(4) },
      { price: 2.24, timestamp: minutes(8) },
    ];
    const result = detectOddsRise(history);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.openingPrice).toBe(2.0);
      expect(result.currentPrice).toBe(2.24);
      expect(result.priceChangePct).toBeCloseTo(12, 0);
      expect(result.persistedForSec).toBeGreaterThanOrEqual(120);
    }
  });

  it("filters out a wobble inside the rise window as noise, not a clean sustained move", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) }, // opening
      { price: 2.3, timestamp: minutes(2) }, // sharp rise, well past threshold
      { price: 2.1, timestamp: minutes(4) }, // wobbles back down (still above threshold level, so continuity holds)
      { price: 2.24, timestamp: minutes(9) }, // settles again — but the mid-window dip is noise relative to the final price
    ];
    expect(detectOddsRise(history)).toEqual({ fires: false, reason: "correction_filtered" });
  });

  it("respects custom config thresholds", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) }, // opening
      { price: 2.05, timestamp: minutes(3) }, // already past the 2% custom threshold (2.04)
      { price: 2.06, timestamp: minutes(5) }, // stays up for 2 more minutes
    ];
    const result = detectOddsRise(history, {
      riseThresholdPercent: 2,
      minPersistenceSec: 60,
      correctionReboundPercent: 2,
    });
    expect(result.fires).toBe(true);
  });
});
