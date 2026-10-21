import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDroppingOddsPage, parseMatchOddsFragment, parseResultsPage } from "./betexplorer";

// Fixtures captured live from betexplorer.com on 2026-08-19 — real
// server-rendered HTML, not synthetic. Frozen here so the parser is tested
// against exact real-world markup without hitting the network in CI.
const droppingOddsHtml = readFileSync(
  path.join(__dirname, "__fixtures__/betexplorer-dropping-odds.html"),
  "utf-8",
);
const matchOddsJson = readFileSync(path.join(__dirname, "__fixtures__/betexplorer-match-odds.json"), "utf-8");
const resultsHtml = readFileSync(path.join(__dirname, "__fixtures__/betexplorer-results.html"), "utf-8");

describe("parseDroppingOddsPage", () => {
  const rows = parseDroppingOddsPage(droppingOddsHtml);

  it("parses at least one row", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("extracts the Scotland Highland League match with correct teams and drop", () => {
    const row = rows.find((r) => r.matchId === "rw6i90hn");
    expect(row).toBeDefined();
    expect(row?.country).toBe("Scotland");
    expect(row?.league).toBe("Highland League");
    expect(row?.homeTeam).toBe("Strathspey Thistle");
    expect(row?.awayTeam).toBe("Brora Rangers");
    expect(row?.dropPercent).toBe(54);
  });

  it("reads current 1/X/2 odds as numbers", () => {
    const row = rows.find((r) => r.matchId === "rw6i90hn");
    expect(row?.current.home).toBeCloseTo(4.65);
    expect(row?.current.draw).toBeCloseTo(4.44);
  });

  it("covers exotic / lower-tier leagues, not just major ones", () => {
    const leagues = rows.map((r) => `${r.country}: ${r.league}`);
    expect(leagues.some((l) => l.includes("Iran"))).toBe(true);
    expect(leagues.some((l) => l.includes("Australia"))).toBe(true);
  });

  it("assigns a kickoff date to every row", () => {
    for (const row of rows) {
      expect(row.kickoff).not.toBeNull();
    }
  });
});

describe("parseMatchOddsFragment", () => {
  const points = parseMatchOddsFragment(matchOddsJson);

  it("parses at least one bookmaker's odds", () => {
    expect(points.length).toBeGreaterThan(0);
  });

  it("extracts 1xBet's price for the home outcome with a timestamp", () => {
    const point = points.find((p) => p.bookmakerName === "1xBet" && p.columnIndex === 0);
    expect(point).toBeDefined();
    expect(point?.price).toBeCloseTo(7.48);
    expect(point?.createdAt.getUTCFullYear()).toBe(2026);
    expect(point?.createdAt.getUTCMonth()).toBe(7); // August, 0-indexed
  });

  it("includes an Asian-facing bookmaker (BetInAsia), not only mainstream European books", () => {
    expect(points.some((p) => p.bookmakerName === "BetInAsia")).toBe(true);
  });

  it("tolerates being handed the raw HTML fragment directly (not JSON-wrapped)", () => {
    const wrapped = JSON.parse(matchOddsJson) as { odds: string };
    const direct = parseMatchOddsFragment(wrapped.odds);
    expect(direct.length).toBe(points.length);
  });
});

// Fixtures captured live from betexplorer.com on 2026-08-20 (real match,
// same parser, different market codes) — confirms parseMatchOddsFragment is
// genuinely market-agnostic and that DNB/DC/BTTS really are 2/3/2-column
// markets with no line dimension, not an assumption.
describe("parseMatchOddsFragment — non-1X2 markets", () => {
  it("DNB (ha): exactly 2 columns per bookmaker (home, away)", () => {
    const json = readFileSync(path.join(__dirname, "__fixtures__/betexplorer-match-odds-dnb.json"), "utf-8");
    const points = parseMatchOddsFragment(json);
    expect(points.length).toBeGreaterThan(0);
    const maxColumn = Math.max(...points.map((p) => p.columnIndex));
    expect(maxColumn).toBe(1);
  });

  it("Double Chance (dc): exactly 3 columns per bookmaker (1X, 12, X2)", () => {
    const json = readFileSync(path.join(__dirname, "__fixtures__/betexplorer-match-odds-dc.json"), "utf-8");
    const points = parseMatchOddsFragment(json);
    expect(points.length).toBeGreaterThan(0);
    const maxColumn = Math.max(...points.map((p) => p.columnIndex));
    expect(maxColumn).toBe(2);
  });

  it("BTTS (bts): exactly 2 columns per bookmaker (yes, no)", () => {
    const json = readFileSync(path.join(__dirname, "__fixtures__/betexplorer-match-odds-bts.json"), "utf-8");
    const points = parseMatchOddsFragment(json);
    expect(points.length).toBeGreaterThan(0);
    const maxColumn = Math.max(...points.map((p) => p.columnIndex));
    expect(maxColumn).toBe(1);
  });
});

describe("parseResultsPage", () => {
  const rows = parseResultsPage(resultsHtml);

  it("parses a large number of finished matches", () => {
    expect(rows.length).toBeGreaterThan(100);
  });

  it("extracts full-time and half-time score for a real finished match", () => {
    const row = rows.find((r) => r.matchId === "W2AF8ViL");
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      homeTeam: "Vllaznia",
      awayTeam: "Skenderbeu",
      fullTimeHomeGoals: 2,
      fullTimeAwayGoals: 2,
      halftimeHomeGoals: 0,
      halftimeAwayGoals: 0,
    });
  });

  it("extracts team names for every parsed row, not just the sampled one", () => {
    for (const row of rows) {
      expect(row.homeTeam.length).toBeGreaterThan(0);
      expect(row.awayTeam.length).toBeGreaterThan(0);
    }
  });

  it("only includes matches that have an actual score (skips upcoming/postponed rows)", () => {
    for (const row of rows) {
      expect(Number.isInteger(row.fullTimeHomeGoals)).toBe(true);
      expect(Number.isInteger(row.fullTimeAwayGoals)).toBe(true);
    }
  });
});
