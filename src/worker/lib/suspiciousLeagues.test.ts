import { describe, expect, it } from "vitest";
import { matchSuspiciousLeague, suspiciousLeagueScoreBonus } from "./suspiciousLeagues";

describe("matchSuspiciousLeague", () => {
  it("matches whole-country entries regardless of league name", () => {
    // Bolivia has no nameContains — whole country is monitored.
    const result = matchSuspiciousLeague("Bolivia", "Primera Division");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.weight).toBe(3);
  });

  it("matches nameContains entries only when league string contains the token", () => {
    // Vietnam: nameContains includes "v.league 2" — top flight ("V.League 1")
    // must NOT match, only lower divisions and youth leagues do.
    const topFlight = matchSuspiciousLeague("Vietnam", "V.League 1");
    expect(topFlight.matched).toBe(false);

    const secondTier = matchSuspiciousLeague("Vietnam", "V.League 2");
    expect(secondTier.matched).toBe(true);
    if (secondTier.matched) expect(secondTier.weight).toBe(3);

    const u19 = matchSuspiciousLeague("Vietnam", "V-League U19");
    expect(u19.matched).toBe(true);
  });

  it("survives provider naming variations (case, hyphens, prefix)", () => {
    // BetExplorer style
    const bex = matchSuspiciousLeague("Vietnam", "Vietnam - V.LEAGUE 2");
    expect(bex.matched).toBe(true);

    // API-Football style
    const af = matchSuspiciousLeague("vietnam", "v.league 2");
    expect(af.matched).toBe(true);

    // Extra whitespace / trailing description
    const noisy = matchSuspiciousLeague("  Vietnam  ", "V.League 2 - Round 15  ");
    expect(noisy.matched).toBe(true);
  });

  it("rejects countries not on the list even if the league name looks suspicious", () => {
    const result = matchSuspiciousLeague("England", "Premier League Cup");
    expect(result.matched).toBe(false);
  });

  it("matches International club friendlies (weight 3)", () => {
    // Guide explicitly calls out Europe: Club Friendly Matches; providers
    // vary between country="Europe", "International", "World" for these.
    const europe = matchSuspiciousLeague("Europe", "Club Friendlies");
    expect(europe.matched).toBe(true);

    const world = matchSuspiciousLeague("World", "Club Friendly");
    expect(world.matched).toBe(true);
  });

  it("bonus scales with weight (5/10/15)", () => {
    expect(suspiciousLeagueScoreBonus({ matched: false })).toBe(0);
    expect(
      suspiciousLeagueScoreBonus({
        matched: true,
        weight: 1,
        rule: { country: "x", weight: 1 },
      }),
    ).toBe(5);
    expect(
      suspiciousLeagueScoreBonus({
        matched: true,
        weight: 3,
        rule: { country: "x", weight: 3 },
      }),
    ).toBe(15);
  });
});
