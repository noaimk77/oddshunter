import { describe, expect, it } from "vitest";
import { detectOddsDrop, type PricePoint } from "./oddsDrop";

const t0 = new Date("2026-08-18T10:00:00Z");
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);

describe("detectOddsDrop", () => {
  it("rejects with too little data", () => {
    expect(detectOddsDrop([{ price: 2.0, timestamp: t0 }])).toEqual({ fires: false, reason: "insufficient_data" });
  });

  it("rejects a move smaller than the threshold", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 1.98, timestamp: minutes(10) },
    ];
    expect(detectOddsDrop(history)).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("rejects a sufficiently large drop that hasn't persisted long enough", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 1.8, timestamp: minutes(1) }, // 10% drop, only 1 min ago
    ];
    expect(detectOddsDrop(history)).toEqual({ fires: false, reason: "insufficient_persistence" });
  });

  it("fires on a large, persistent drop", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) },
      { price: 1.9, timestamp: minutes(2) },
      { price: 1.8, timestamp: minutes(4) },
      { price: 1.78, timestamp: minutes(8) },
    ];
    const result = detectOddsDrop(history);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.openingPrice).toBe(2.0);
      expect(result.currentPrice).toBe(1.78);
      expect(result.priceChangePct).toBeCloseTo(11, 0);
      expect(result.persistedForSec).toBeGreaterThanOrEqual(120);
    }
  });

  it("filters out a wobble inside the drop window as noise, not a clean sustained move", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) }, // opening
      { price: 1.75, timestamp: minutes(2) }, // sharp drop, well past threshold
      { price: 1.89, timestamp: minutes(4) }, // wobbles back up (still below the threshold level, so continuity holds)
      { price: 1.78, timestamp: minutes(9) }, // settles again — but the mid-window bounce is noise relative to the final price
    ];
    expect(detectOddsDrop(history)).toEqual({ fires: false, reason: "correction_filtered" });
  });

  it("respects custom config thresholds", () => {
    const history: PricePoint[] = [
      { price: 2.0, timestamp: minutes(0) }, // opening
      { price: 1.95, timestamp: minutes(3) }, // already past the 2% custom threshold (1.96)
      { price: 1.94, timestamp: minutes(5) }, // stays down for 2 more minutes
    ];
    const result = detectOddsDrop(history, {
      dropThresholdPercent: 2,
      minPersistenceSec: 60,
      correctionReboundPercent: 2,
    });
    expect(result.fires).toBe(true);
  });
});
