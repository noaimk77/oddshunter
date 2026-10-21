import { describe, expect, it } from "vitest";
import { distinctiveTokens } from "./thesportsdb";

describe("distinctiveTokens — opponent confirmation for fetchFixtureTiming", () => {
  it("drops a club word both sides share (Real Madrid vs Real Betis — the 2026-09-09 stale-repost bug)", () => {
    // "real" is a stopword AND shared, so the only token left to confirm
    // the opponent on Real Madrid's events feed is "betis" — Madrid's own
    // upcoming fixtures no longer match, so the guard stops locking onto
    // the wrong (future) match and reporting it "not started".
    expect(distinctiveTokens("Real Betis", "Real Madrid")).toEqual(["betis"]);
    expect(distinctiveTokens("Real Madrid", "Real Betis")).toEqual(["madrid"]);
  });

  it("keeps the meaningful word from a generic-prefixed name", () => {
    expect(distinctiveTokens("Deportivo Cali", "Atletico Nacional")).toEqual(["cali"]);
    expect(distinctiveTokens("Sporting Cristal", "Universitario")).toEqual(["cristal"]);
  });

  it("returns empty when nothing distinctive is left (caller then skips the timing guard)", () => {
    expect(distinctiveTokens("FC", "AC")).toEqual([]);
    expect(distinctiveTokens("Real Madrid", "Real Madrid")).toEqual([]);
  });

  it("keeps multi-word distinctive names intact", () => {
    expect(distinctiveTokens("Independiente Yumbo", "Deportes Quindio")).toEqual(["independiente", "yumbo"]);
  });
});
