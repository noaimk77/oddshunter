import { describe, expect, it } from "vitest";
import { detectValueBet } from "./valueBet";

describe("detectValueBet", () => {
  it("fires on the bookmaker with the biggest edge over Pinnacle", () => {
    const result = detectValueBet([
      { bookmakerLabel: "Pinnacle", marketId: "m1", selectionId: "s1", price: 2.0 },
      { bookmakerLabel: "Bet365", marketId: "m2", selectionId: "s2", price: 2.1 },
      { bookmakerLabel: "1xBet", marketId: "m3", selectionId: "s3", price: 2.3 },
    ]);
    expect(result.fires).toBe(true);
    expect(result).toMatchObject({
      referenceBookmaker: "Pinnacle",
      referencePrice: 2.0,
      bestBookmaker: "1xBet",
      bestPrice: 2.3,
      marketId: "m3",
      selectionId: "s3",
    });
    expect((result as { edgePercent: number }).edgePercent).toBeCloseTo(15, 5);
  });

  it("rejects when Pinnacle's price isn't in the group", () => {
    const result = detectValueBet([{ bookmakerLabel: "Bet365", marketId: "m1", selectionId: "s1", price: 2.1 }]);
    expect(result).toEqual({ fires: false, reason: "no_reference_price" });
  });

  it("rejects when Pinnacle is the only price in the group", () => {
    const result = detectValueBet([{ bookmakerLabel: "Pinnacle", marketId: "m1", selectionId: "s1", price: 2.0 }]);
    expect(result).toEqual({ fires: false, reason: "insufficient_bookmakers" });
  });

  it("rejects when no bookmaker clears the minimum edge", () => {
    const result = detectValueBet([
      { bookmakerLabel: "Pinnacle", marketId: "m1", selectionId: "s1", price: 2.0 },
      { bookmakerLabel: "Bet365", marketId: "m2", selectionId: "s2", price: 2.02 },
    ]);
    expect(result).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("respects a custom minEdgePercent", () => {
    const prices = [
      { bookmakerLabel: "Pinnacle", marketId: "m1", selectionId: "s1", price: 2.0 },
      { bookmakerLabel: "Bet365", marketId: "m2", selectionId: "s2", price: 2.06 },
    ];
    expect(detectValueBet(prices, { referenceBookmaker: "Pinnacle", minEdgePercent: 8 })).toEqual({
      fires: false,
      reason: "below_threshold",
    });
    const result = detectValueBet(prices, { referenceBookmaker: "Pinnacle", minEdgePercent: 2 });
    expect(result.fires).toBe(true);
  });

  it("does not consider a bookmaker priced below Pinnacle as the best edge", () => {
    const result = detectValueBet([
      { bookmakerLabel: "Pinnacle", marketId: "m1", selectionId: "s1", price: 2.0 },
      { bookmakerLabel: "Bet365", marketId: "m2", selectionId: "s2", price: 1.5 },
      { bookmakerLabel: "1xBet", marketId: "m3", selectionId: "s3", price: 2.4 },
    ]);
    expect(result).toMatchObject({ fires: true, bestBookmaker: "1xBet" });
  });
});
