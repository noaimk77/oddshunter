import { describe, expect, it } from "vitest";
import { normalizeTeam, scoreTeamMatch, scoreFixtureMatch } from "./fixtureResolver";

describe("normalizeTeam", () => {
  it("strips accents, punctuation and club noise words", () => {
    expect(normalizeTeam("Atlético El Vigía FC").tokens).toEqual(["atletico", "el", "vigia"]);
  });

  it("keeps the raw tokens when everything looked like a noise word", () => {
    expect(normalizeTeam("FC SC").tokens.length).toBeGreaterThan(0);
  });
});

describe("scoreTeamMatch", () => {
  it("scores an exact normalized match as 1", () => {
    expect(scoreTeamMatch("Real Oruro", "Real Oruro")).toBe(1);
  });

  it("scores OCR truncation high via substring containment", () => {
    expect(scoreTeamMatch("R. Oruro", "Real Oruro")).toBeGreaterThan(0.6);
    expect(scoreTeamMatch("Bloomng", "Blooming")).toBeGreaterThan(0.8);
  });

  it("scores two unrelated teams low", () => {
    expect(scoreTeamMatch("The Strongest", "Real Oruro")).toBeLessThan(0.4);
  });
});

describe("scoreFixtureMatch", () => {
  const event = { homeTeam: "Blooming", awayTeam: "Real Oruro" };

  it("matches the same fixture in the same order", () => {
    expect(scoreFixtureMatch({ homeTeam: "Blooming", awayTeam: "Real Oruro" }, event)).toBeGreaterThan(0.9);
  });

  it("matches the same fixture with teams swapped", () => {
    expect(scoreFixtureMatch({ homeTeam: "Real Oruro", awayTeam: "Blooming" }, event)).toBeGreaterThan(0.9);
  });

  it("matches through mild OCR noise on both sides", () => {
    expect(scoreFixtureMatch({ homeTeam: "Blooming FC", awayTeam: "R. Oruro" }, event)).toBeGreaterThan(0.74);
  });

  it("rejects a fixture that only shares one team", () => {
    expect(scoreFixtureMatch({ homeTeam: "Blooming", awayTeam: "The Strongest" }, event)).toBe(0);
  });

  it("rejects an entirely different fixture", () => {
    expect(scoreFixtureMatch({ homeTeam: "San Antonio", awayTeam: "Bolivar" }, event)).toBe(0);
  });
});
