import { describe, expect, it } from "vitest";
import { formatSignalMessage, humanizeSelection, updateResultInMessage, type SignalWithContext } from "./sendAlert";

function baseSignal(overrides: {
  marketName: string;
  marketType: string;
  selection: string | null;
  home?: string;
  away?: string;
  openingPrice?: number | null;
  currentPrice?: number | null;
  priceChangePct?: number | null;
}): SignalWithContext {
  return {
    id: "sig_1",
    type: "ODDS_DROP",
    score: 70,
    reasons: [],
    openingPrice: overrides.openingPrice ?? null,
    currentPrice: overrides.currentPrice ?? null,
    priceChangePct: overrides.priceChangePct ?? null,
    metadata: null,
    priceHistory: [],
    firstDetectedAt: new Date("2026-09-03T20:00:00Z"),
    velocity: null,
    isLateMove: false,
    crossMarketCount: 1,
    leagueHitRate: null,
    market: {
      name: overrides.marketName,
      type: overrides.marketType,
      status: "open",
      event: {
        homeTeam: overrides.home ?? "Vinotinto",
        awayTeam: overrides.away ?? "San Antonio",
        kickoff: new Date("2026-09-03T22:00:00Z"),
        status: "scheduled",
        competition: { name: "Serie B", sport: "football", country: "Venezuela" },
      },
    },
    selection: overrides.selection ? { name: overrides.selection } : null,
  };
}

describe("humanizeSelection — raw market codes → plain-French bet instruction", () => {
  it("double chance 12 spells out both teams and 'no draw'", () => {
    expect(humanizeSelection("double_chance", "12", "Vinotinto", "San Antonio", null)).toBe(
      "Vinotinto ou San Antonio gagne (pas de match nul)",
    );
  });

  it("double chance 1x / x2", () => {
    expect(humanizeSelection("double_chance", "1x", "Vinotinto", "San Antonio", null)).toBe(
      "Vinotinto gagne ou match nul",
    );
    expect(humanizeSelection("double_chance", "x2", "Vinotinto", "San Antonio", null)).toBe(
      "San Antonio gagne ou match nul",
    );
  });

  it("1X2 positions become 'victoire <team>' / 'match nul'", () => {
    expect(humanizeSelection("match_winner", "home", "Vinotinto", "San Antonio", null)).toBe("victoire Vinotinto");
    expect(humanizeSelection("match_winner", "away", "Vinotinto", "San Antonio", null)).toBe("victoire San Antonio");
    expect(humanizeSelection("match_winner", "draw", "Vinotinto", "San Antonio", null)).toBe("match nul");
  });

  it("DNB names the team and the refund condition", () => {
    expect(humanizeSelection("dnb", "home", "Vinotinto", "San Antonio", null)).toBe(
      "Vinotinto, remboursé si match nul",
    );
  });

  it("over/under uses the line parsed from the market name", () => {
    expect(humanizeSelection("over_under", "over", "A", "B", "2.5")).toBe("plus de 2.5 buts dans le match");
    expect(humanizeSelection("over_under", "under", "A", "B", "2.5")).toBe("moins de 2.5 buts dans le match");
  });

  it("asian handicap names the backed team and the line", () => {
    expect(humanizeSelection("asian_handicap", "away", "A", "B", "-0.75")).toBe("B avec handicap -0.75");
  });

  it("returns null for unmapped shapes (momentum picks, unknown codes)", () => {
    expect(humanizeSelection("momentum_pick", "whatever", "A", "B", null)).toBeNull();
    expect(humanizeSelection("double_chance", "weird", "A", "B", null)).toBeNull();
    expect(humanizeSelection("over_under", "over", "A", "B", null)).toBeNull();
  });
});

describe("formatSignalMessage — the bot Signals alert", () => {
  it("replaces the raw 'DC (Megapari) — 12' line with a clear instruction + market ref", () => {
    const msg = formatSignalMessage(
      baseSignal({
        marketName: "DC (Megapari)",
        marketType: "double_chance",
        selection: "12",
        openingPrice: 1.65,
        currentPrice: 1.27,
        priceChangePct: 23,
      }),
    );
    expect(msg).toContain("🎯 À parier : Vinotinto ou San Antonio gagne (pas de match nul)");
    expect(msg).toContain("🧾 Double chance · cote Megapari");
    expect(msg).not.toContain("— 12");
    expect(msg).toContain("📉 23.0% de baisse (1.65 → 1.27)");
    expect(msg).toContain("🔄 Statut : en attente du résultat");
    expect(msg).not.toContain("Signal statistique");
  });

  it("keeps a readable raw line for momentum picks (no position code to translate)", () => {
    const msg = formatSignalMessage(
      baseSignal({ marketName: "Pronostic live (stats)", marketType: "momentum_pick", selection: null }),
    );
    expect(msg).toContain("Pronostic live (stats)");
    expect(msg).not.toContain("🎯 À parier");
  });

  it("translates an over/under signal using the line in the market name", () => {
    const msg = formatSignalMessage(
      baseSignal({ marketName: "O/U 2.5 (1xBet)", marketType: "over_under", selection: "over" }),
    );
    expect(msg).toContain("🎯 À parier : plus de 2.5 buts dans le match");
    expect(msg).toContain("🧾 Nombre de buts · cote 1xBet");
  });
});

describe("updateResultInMessage — flips the status line in place, never a new message", () => {
  it("replaces the pending status line with a won verdict + score", () => {
    const original = formatSignalMessage(
      baseSignal({ marketName: "DC (1xBet)", marketType: "double_chance", selection: "12" }),
    );
    const updated = updateResultInMessage(original, "won", {
      homeTeam: "Vinotinto",
      awayTeam: "San Antonio",
      homeScore: 3,
      awayScore: 1,
    });
    expect(updated).toContain("✅ Résultat : pari validé — Vinotinto 3-1 San Antonio");
    expect(updated).not.toContain("🔄 Statut :");
    // Same number of lines — a flip, not an appended paragraph.
    expect(updated.split("\n").length).toBe(original.split("\n").length);
  });

  it("renders lost/void verdicts", () => {
    const original = formatSignalMessage(
      baseSignal({ marketName: "DC (1xBet)", marketType: "double_chance", selection: "12" }),
    );
    expect(updateResultInMessage(original, "lost", { homeTeam: "A", awayTeam: "B", homeScore: 0, awayScore: 0 })).toContain(
      "❌ Résultat : pari perdu — A 0-0 B",
    );
    expect(
      updateResultInMessage(original, "void", { homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 1 }),
    ).toContain("⚪ Résultat : remboursé (push) — A 1-1 B");
  });

  it("falls back to appending when the message predates the status line", () => {
    const legacy = "⚽ A vs B\n🎯 À parier : victoire A";
    const updated = updateResultInMessage(legacy, "won", { homeTeam: "A", awayTeam: "B", homeScore: 2, awayScore: 0 });
    expect(updated).toContain("⚽ A vs B");
    expect(updated).toContain("✅ Résultat : pari validé — A 2-0 B");
  });

  it("omits the score when it isn't provided", () => {
    const original = formatSignalMessage(
      baseSignal({ marketName: "DC (1xBet)", marketType: "double_chance", selection: "12" }),
    );
    const updated = updateResultInMessage(original, "won");
    expect(updated).toContain("✅ Résultat : pari validé");
    expect(updated).not.toMatch(/\d-\d/);
  });
});
