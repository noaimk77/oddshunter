import { describe, expect, it } from "vitest";
import { gradeFromLive } from "./consensusOutcomeResolver";
import type { LiveScore } from "../providers/thesportsdb";

const fx = { homeTeam: "A", awayTeam: "B" };
const live = (homeScore: number, awayScore: number, status: string, minute: number | null = null): LiveScore => ({
  homeScore,
  awayScore,
  status,
  minute,
});

describe("gradeFromLive — only reports LOCKED verdicts from a live score", () => {
  it("OVER goals line already exceeded mid-match → WON, whatever the status", () => {
    expect(gradeFromLive("OVER_UNDER", "OVER_2_5", fx, live(2, 1, "2H", 70))).toBe("WON");
    expect(gradeFromLive("OVER_UNDER", "OVER_3_5", fx, live(2, 2, "1H", 40))).toBe("WON");
  });

  it("OVER line not yet reached mid-match → null (still in the balance)", () => {
    expect(gradeFromLive("OVER_UNDER", "OVER_2_5", fx, live(1, 1, "2H", 70))).toBeNull();
  });

  it("never calls an UNDER or 1X2 or handicap early from an in-play score", () => {
    expect(gradeFromLive("OVER_UNDER", "UNDER_2_5", fx, live(0, 0, "2H", 75))).toBeNull();
    expect(gradeFromLive("1X2", "a", fx, live(3, 0, "2H", 80))).toBeNull();
    expect(gradeFromLive("HANDICAP", "HOME_-1.5", fx, live(3, 0, "2H", 80))).toBeNull();
    expect(gradeFromLive("DOUBLE_CHANCE", "1X", fx, live(1, 0, "2H", 80))).toBeNull();
  });

  it("BTTS yes → WON as soon as both teams have scored", () => {
    expect(gradeFromLive("BTTS", "YES", fx, live(1, 1, "2H", 60))).toBe("WON");
    expect(gradeFromLive("BTTS", "YES", fx, live(2, 0, "2H", 60))).toBeNull();
    expect(gradeFromLive("BTTS", "NO", fx, live(0, 0, "2H", 60))).toBeNull(); // NO can only settle at FT
  });

  it("first-half OVER at HT → graded either way; before HT only the locked WON", () => {
    expect(gradeFromLive("OVER_UNDER_HT", "OVER_1_5", fx, live(2, 0, "HT"))).toBe("WON");
    expect(gradeFromLive("OVER_UNDER_HT", "OVER_1_5", fx, live(0, 0, "HT"))).toBe("LOST");
    expect(gradeFromLive("OVER_UNDER_HT", "OVER_1_5", fx, live(2, 0, "1H", 30))).toBe("WON"); // already exceeded, locked
    expect(gradeFromLive("OVER_UNDER_HT", "OVER_1_5", fx, live(1, 0, "1H", 30))).toBeNull(); // not yet
    expect(gradeFromLive("OVER_UNDER_HT", "UNDER_1_5", fx, live(0, 0, "1H", 30))).toBeNull(); // UNDER never early
  });

  it("first-half line at FT can't be graded from the live full-time score", () => {
    expect(gradeFromLive("OVER_UNDER_HT", "OVER_1_5", fx, live(3, 1, "FT"))).toBeNull();
  });

  it("live feed says FT → grades every market fully from the final score", () => {
    expect(gradeFromLive("OVER_UNDER", "UNDER_2_5", fx, live(1, 1, "FT"))).toBe("WON");
    expect(gradeFromLive("OVER_UNDER", "OVER_2_5", fx, live(1, 1, "FT"))).toBe("LOST");
    expect(gradeFromLive("BTTS", "NO", fx, live(2, 0, "FT"))).toBe("WON");
    expect(gradeFromLive("1X2", "a", fx, live(2, 0, "FT"))).toBe("WON");
  });
});
