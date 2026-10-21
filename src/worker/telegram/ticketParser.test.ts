import { describe, expect, it } from "vitest";
import { extractOdds, extractResult } from "./ticketParser";

describe("extractOdds", () => {
  it("reads a labeled odds value", () => {
    expect(extractOdds("Pick: PSG win\nCote: 1.72")).toBe(1.72);
  });

  it("reads a trailing bare decimal line as odds", () => {
    expect(extractOdds("San Alfonso - Deportivo Amambay 1.632")).toBe(1.632);
  });

  it("does not mistake a handicap line for odds", () => {
    expect(extractOdds("Handicap: 2 (-9.5)")).toBeNull();
  });

  it("does not mistake an over/under market line for odds", () => {
    expect(extractOdds("Over 2.5 buts")).toBeNull();
  });

  it("does not mistake a market-line-with-checkmark for odds", () => {
    expect(extractOdds("-9.5 hdcp✅")).toBeNull();
  });

  it("rejects an out-of-range number", () => {
    expect(extractOdds("Score final 62.5")).toBeNull();
  });
});

describe("extractResult", () => {
  it("reads a checkmark as WON", () => {
    expect(extractResult("Under 162.5✅")).toBe("WON");
  });

  it("reads a cross as LOST", () => {
    expect(extractResult("Over 2.5 ❌")).toBe("LOST");
  });

  it("defaults to PENDING with no outcome marker", () => {
    expect(extractResult("PSG vs OM\nOver 2.5 buts")).toBe("PENDING");
  });

  it("defaults to PENDING when both markers are present (ambiguous)", () => {
    expect(extractResult("✅ Ticket 1\n❌ Ticket 2")).toBe("PENDING");
  });
});
