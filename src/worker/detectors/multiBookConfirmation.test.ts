import { describe, expect, it } from "vitest";
import { detectMultiBookConfirmation, type BookmakerMove } from "./multiBookConfirmation";

const move = (marketId: string, bookmakerLabel: string, priceChangePct: number, persistedForSec = 300): BookmakerMove => ({
  marketId,
  selectionId: `${marketId}-sel`,
  bookmakerLabel,
  priceChangePct,
  persistedForSec,
});

describe("detectMultiBookConfirmation", () => {
  it("rejects with no data", () => {
    expect(detectMultiBookConfirmation([])).toEqual({ fires: false, reason: "insufficient_data" });
  });

  it("rejects a single bookmaker moving alone", () => {
    const moves = [move("m1", "1xBet", -12)];
    expect(detectMultiBookConfirmation(moves)).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("fires when 2+ independent bookmakers move together", () => {
    const moves = [move("m1", "1xBet", -12), move("m2", "BetInAsia", -9)];
    const result = detectMultiBookConfirmation(moves);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.confirmingCount).toBe(2);
      expect(result.bookmakers).toEqual(["1xBet", "BetInAsia"]);
    }
  });

  it("picks the largest mover as the anchor", () => {
    const moves = [move("m1", "1xBet", -6), move("m2", "BetInAsia", -18), move("m3", "Betsson", -9)];
    const result = detectMultiBookConfirmation(moves);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.anchor.marketId).toBe("m2");
    }
  });

  it("averages the price change across confirming bookmakers", () => {
    const moves = [move("m1", "1xBet", -10), move("m2", "BetInAsia", -20)];
    const result = detectMultiBookConfirmation(moves);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.averagePriceChangePct).toBeCloseTo(-15);
    }
  });

  it("dedupes if the same market is passed twice", () => {
    const moves = [move("m1", "1xBet", -12), move("m1", "1xBet", -12)];
    expect(detectMultiBookConfirmation(moves)).toEqual({ fires: false, reason: "below_threshold" });
  });

  it("respects a custom threshold", () => {
    const moves = [move("m1", "1xBet", -12), move("m2", "BetInAsia", -9), move("m3", "Betsson", -11)];
    const result = detectMultiBookConfirmation(moves, { minConfirmingBookmakers: 3 });
    expect(result.fires).toBe(true);
  });

  it("reports the fastest confirming bookmaker's persistence, not an average", () => {
    const moves = [move("m1", "1xBet", -12, 600), move("m2", "BetInAsia", -9, 120), move("m3", "Betsson", -11, 900)];
    const result = detectMultiBookConfirmation(moves);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.fastestPersistedForSec).toBe(120);
    }
  });

  it("identifies the first-mover as the book that held the drop longest", () => {
    const moves = [move("m1", "1xBet", -12, 600), move("m2", "SBO", -9, 120), move("m3", "Marathonbet", -11, 900)];
    const result = detectMultiBookConfirmation(moves);
    expect(result.fires).toBe(true);
    if (result.fires) {
      expect(result.firstMoverBookmaker).toBe("Marathonbet");
      expect(result.firstMoverPersistedForSec).toBe(900);
    }
  });
});
