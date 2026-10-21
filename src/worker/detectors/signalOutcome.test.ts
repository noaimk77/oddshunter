import { describe, expect, it } from "vitest";
import { resolveSelectionOutcome, type MatchResult } from "./signalOutcome";

const result: MatchResult = { fullTimeHomeGoals: 2, fullTimeAwayGoals: 1, halftimeHomeGoals: 0, halftimeAwayGoals: 0 };

describe("resolveSelectionOutcome — match_winner (1X2)", () => {
  it("resolves a home win as true for the home selection", () => {
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "home", result)).toBe(true);
  });

  it("resolves a home win as false for the away selection", () => {
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "away", result)).toBe(false);
  });

  it("resolves a home win as false for the draw selection", () => {
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "draw", result)).toBe(false);
  });

  it("resolves a draw correctly", () => {
    const draw: MatchResult = { ...result, fullTimeHomeGoals: 1, fullTimeAwayGoals: 1 };
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "draw", draw)).toBe(true);
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "home", draw)).toBe(false);
  });
});

describe("resolveSelectionOutcome — over_under_live", () => {
  it("resolves Over correctly against the full-time total", () => {
    // 2+1=3 total goals, line 2.5 -> Over hits
    expect(resolveSelectionOutcome("over_under_live", "Over/Under Line 2.5", "over", result)).toBe(true);
    expect(resolveSelectionOutcome("over_under_live", "Over/Under Line 2.5", "under", result)).toBe(false);
  });

  it("resolves Under correctly when the total stays below the line", () => {
    expect(resolveSelectionOutcome("over_under_live", "Over/Under Line 3.5", "under", result)).toBe(true);
  });

  it("uses the half-time score for a (1st Half) market, not full-time", () => {
    const htGoals: MatchResult = { ...result, halftimeHomeGoals: 1, halftimeAwayGoals: 1 };
    // HT total = 2, line 1.5 -> Over; full-time total (3) would also say Over here,
    // so also check a line where HT and FT disagree to prove it's really using HT.
    expect(resolveSelectionOutcome("over_under_live", "Over/Under (1st Half) 1.5", "over", htGoals)).toBe(true);
    const htUnder: MatchResult = { ...result, halftimeHomeGoals: 0, halftimeAwayGoals: 0 };
    expect(resolveSelectionOutcome("over_under_live", "Over/Under (1st Half) 2.5", "over", htUnder)).toBe(false);
  });

  it("returns null when the half-time score isn't available for a (1st Half) market", () => {
    const noHt: MatchResult = { ...result, halftimeHomeGoals: null, halftimeAwayGoals: null };
    expect(resolveSelectionOutcome("over_under_live", "Over/Under (1st Half) 1.5", "over", noHt)).toBeNull();
  });

  it("returns null when the market name has no parseable handicap", () => {
    expect(resolveSelectionOutcome("over_under_live", "Over/Under Line", "over", result)).toBeNull();
  });
});

describe("resolveSelectionOutcome — dnb (Draw No Bet)", () => {
  it("resolves a home win as true for the home selection", () => {
    expect(resolveSelectionOutcome("dnb", "DNB", "home", result)).toBe(true);
  });

  it("resolves a home win as false for the away selection", () => {
    expect(resolveSelectionOutcome("dnb", "DNB", "away", result)).toBe(false);
  });

  it("returns null (push) on a draw", () => {
    const draw: MatchResult = { ...result, fullTimeHomeGoals: 1, fullTimeAwayGoals: 1 };
    expect(resolveSelectionOutcome("dnb", "DNB", "home", draw)).toBeNull();
    expect(resolveSelectionOutcome("dnb", "DNB", "away", draw)).toBeNull();
  });
});

describe("resolveSelectionOutcome — double_chance", () => {
  it("resolves 1x (home or draw) for a home win", () => {
    expect(resolveSelectionOutcome("double_chance", "DC", "1x", result)).toBe(true);
  });

  it("resolves x2 (draw or away) as false for a home win", () => {
    expect(resolveSelectionOutcome("double_chance", "DC", "x2", result)).toBe(false);
  });

  it("resolves 12 (not draw) as true for a home win", () => {
    expect(resolveSelectionOutcome("double_chance", "DC", "12", result)).toBe(true);
  });

  it("resolves 12 as false on a draw", () => {
    const draw: MatchResult = { ...result, fullTimeHomeGoals: 1, fullTimeAwayGoals: 1 };
    expect(resolveSelectionOutcome("double_chance", "DC", "12", draw)).toBe(false);
  });
});

describe("resolveSelectionOutcome — btts", () => {
  it("resolves yes as true when both teams scored", () => {
    expect(resolveSelectionOutcome("btts", "BTTS", "yes", result)).toBe(true);
  });

  it("resolves no as false when both teams scored", () => {
    expect(resolveSelectionOutcome("btts", "BTTS", "no", result)).toBe(false);
  });

  it("resolves yes as false when one team is shut out", () => {
    const shutout: MatchResult = { ...result, fullTimeHomeGoals: 2, fullTimeAwayGoals: 0 };
    expect(resolveSelectionOutcome("btts", "BTTS", "yes", shutout)).toBe(false);
  });
});

describe("resolveSelectionOutcome — unsupported types", () => {
  it("returns null for an unrecognized market type", () => {
    expect(resolveSelectionOutcome("vig_explosion", "Overround", "home", result)).toBeNull();
  });

  it("returns null for an unrecognized selection position", () => {
    expect(resolveSelectionOutcome("match_winner", "1X2 (Pinnacle)", "mystery", result)).toBeNull();
  });
});
