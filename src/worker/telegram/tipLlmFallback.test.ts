import { describe, expect, it } from "vitest";
import { normalizeSelection } from "./tipLlmFallback";

const fx = { homeTeam: "Borracheiros", awayTeam: "Bestia Academy" };

describe("normalizeSelection (LLM output normalization)", () => {
  it("accepts exact home slug for a 1X2 pick", () => {
    expect(normalizeSelection("1X2", "borracheiros", fx)).toBe("borracheiros");
  });

  it("accepts exact away slug for a 1X2 pick", () => {
    expect(normalizeSelection("1X2", "bestiaacademy", fx)).toBe("bestiaacademy");
  });

  it("recognizes 'draw' variants as DRAW", () => {
    expect(normalizeSelection("1X2", "draw", fx)).toBe("DRAW");
    expect(normalizeSelection("1X2", "nul", fx)).toBe("DRAW");
    expect(normalizeSelection("1X2", "x", fx)).toBe("DRAW");
  });

  it("prefix-matches a partial team name to the full slug", () => {
    // model sometimes returns "boca" for a fixture where home is "Boca Juniors"
    const fx2 = { homeTeam: "Boca Juniors", awayTeam: "River Plate" };
    expect(normalizeSelection("1X2", "boca", fx2)).toBe("bocajuniors");
    expect(normalizeSelection("1X2", "river", fx2)).toBe("riverplate");
  });

  it("rejects a 1X2 team the fixture does not contain", () => {
    expect(normalizeSelection("1X2", "chelsea", fx)).toBeNull();
  });

  it("upper-cases non-1X2 selections verbatim", () => {
    expect(normalizeSelection("OVER_UNDER", "over_2_5", fx)).toBe("OVER_2_5");
    expect(normalizeSelection("BTTS", "yes", fx)).toBe("YES");
    expect(normalizeSelection("DOUBLE_CHANCE", "1x", fx)).toBe("1X");
    expect(normalizeSelection("HANDICAP", "-1.5", fx)).toBe("-1.5");
  });
});
