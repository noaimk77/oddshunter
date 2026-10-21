import { describe, expect, it } from "vitest";
import { looksLikeCashoutSignal } from "./cashoutResolver";

describe("looksLikeCashoutSignal", () => {
  it("detects an explicit English cash-out instruction", () => {
    expect(looksLikeCashoutSignal("⚠️ CASH OUT NOW ⚠️")).toBe(true);
    expect(looksLikeCashoutSignal("cashout on Lyon-Marseille")).toBe(true);
    expect(looksLikeCashoutSignal("Cash-out sur ce match")).toBe(true);
  });

  it("detects the French tipster variants", () => {
    expect(looksLikeCashoutSignal("Encaissez le pari maintenant")).toBe(true);
    expect(looksLikeCashoutSignal("Sortez maintenant, ça sent mauvais")).toBe(true);
  });

  it("does NOT fire on scoreboard past-tense 'cashed out' (a result announcement, not an instruction)", () => {
    expect(looksLikeCashoutSignal("Cashed out at 2.35 profit +€120")).toBe(false);
  });

  it("does NOT fire on unrelated messages", () => {
    expect(looksLikeCashoutSignal("🎯 Over 2.5 buts sur Lyon-Marseille cote 1,85")).toBe(false);
    expect(looksLikeCashoutSignal("Bonne chance à tous ce soir 🍀")).toBe(false);
  });
});
