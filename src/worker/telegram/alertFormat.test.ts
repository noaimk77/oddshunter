import { describe, expect, it } from "vitest";
import { consensusStatusLine, currentConsensusStatusPrefix, evaluateConsensusOutcome, formatConsensusMessage, formatConsensusOutcomeMessage, formatMarketSelection, inferSport, replaceConsensusStatusLine, sanitizeTeamName, shouldSendConsensusAlert } from "./alertFormat";

describe("sanitizeTeamName", () => {
  it("strips a stray & prefix left by OCR (real case: 'Wigry Suwatki vs & Termalica')", () => {
    expect(sanitizeTeamName("& Termalica")).toBe("Termalica");
  });

  it("strips a © trademark suffix (real case: 'Wolfsberger AC ©')", () => {
    expect(sanitizeTeamName("Wolfsberger AC ©")).toBe("Wolfsberger AC");
  });

  it("collapses double spaces and trims", () => {
    expect(sanitizeTeamName("  FC   Barcelona  ")).toBe("FC Barcelona");
  });

  it("keeps normal punctuation inside a name intact", () => {
    expect(sanitizeTeamName("Realidade Jovem/SP (W)")).toBe("Realidade Jovem/SP (W)");
  });
});

describe("inferSport — heuristic from the numeric line", () => {
  it("reads a small over/under line as football", () => {
    expect(inferSport({ market: "OVER_UNDER", selection: "OVER_2_5" })).toBe("football");
    expect(inferSport({ market: "OVER_UNDER", selection: "UNDER_1_5" })).toBe("football");
  });

  it("reads a large over/under line as basketball (real miss 2026-09-02: OVER_162_5 read as football)", () => {
    expect(inferSport({ market: "OVER_UNDER", selection: "OVER_162_5" })).toBe("basketball");
    expect(inferSport({ market: "OVER_UNDER", selection: "UNDER_180_5" })).toBe("basketball");
  });

  it("reads a large handicap as basketball (foot handicaps stay small)", () => {
    expect(inferSport({ market: "HANDICAP", selection: "-1.5" })).toBe("football");
    expect(inferSport({ market: "HANDICAP", selection: "-26.5" })).toBe("basketball");
  });

  it("treats BTTS as always football (goals is football-specific)", () => {
    expect(inferSport({ market: "BTTS", selection: "YES" })).toBe("football");
  });

  it("stays 'unknown' on markets with no numeric hint (1X2, DOUBLE_CHANCE)", () => {
    expect(inferSport({ market: "1X2", selection: "voluntari" })).toBe("unknown");
    expect(inferSport({ market: "DOUBLE_CHANCE", selection: "12" })).toBe("unknown");
  });
});

describe("formatMarketSelection — French, human-readable", () => {
  const psg = "PSG", om = "OM";

  it("translates OVER_2_5 to 'Plus de 2,5 buts'", () => {
    expect(formatMarketSelection({ homeTeam: psg, awayTeam: om, market: "OVER_UNDER", selection: "OVER_2_5" })).toBe("Plus de 2,5 buts");
  });

  it("translates a basketball line to 'points', not 'buts' (real miss: 'Plus de 162,5 buts' for Capiata Bulls)", () => {
    expect(formatMarketSelection({ homeTeam: "Capiata Bulls", awayTeam: "Deportivo San Jose", market: "OVER_UNDER", selection: "OVER_162_5" })).toBe("Plus de 162,5 points");
  });

  it("translates UNDER_1_5 to 'Moins de 1,5 buts'", () => {
    expect(formatMarketSelection({ homeTeam: psg, awayTeam: om, market: "OVER_UNDER", selection: "UNDER_1_5" })).toBe("Moins de 1,5 buts");
  });

  it("resolves a 1X2 team-slug to the actual team name (real miss: '1X2 — voluntari')", () => {
    expect(formatMarketSelection({ homeTeam: "FC Chindia Târgoviște", awayTeam: "FC Voluntari", market: "1X2", selection: "voluntari" })).toBe("Victoire FC Voluntari");
  });

  it("handles a DRAW", () => {
    expect(formatMarketSelection({ homeTeam: psg, awayTeam: om, market: "1X2", selection: "DRAW" })).toBe("Match nul");
  });

  it("translates DOUBLE_CHANCE 12", () => {
    expect(formatMarketSelection({ homeTeam: "Opava", awayTeam: "Górnicza", market: "DOUBLE_CHANCE", selection: "12" })).toBe("Double chance : Opava ou Górnicza");
  });

  it("translates BTTS YES", () => {
    expect(formatMarketSelection({ homeTeam: psg, awayTeam: om, market: "BTTS", selection: "YES" })).toBe("Les deux équipes marquent : oui");
  });

  it("translates a HANDICAP with the French decimal comma", () => {
    expect(formatMarketSelection({ homeTeam: psg, awayTeam: om, market: "HANDICAP", selection: "-1.5" })).toBe("Handicap -1,5");
  });

  it("shows the team name for a handicap with team side (real fix 2026-09-02)", () => {
    expect(formatMarketSelection({ homeTeam: "Sporting Liesti", awayTeam: "Dinamo Bucuresti", market: "HANDICAP", selection: "AWAY_-2.5" })).toBe("Handicap Dinamo Bucuresti -2,5");
    expect(formatMarketSelection({ homeTeam: "Sporting Liesti", awayTeam: "Dinamo Bucuresti", market: "HANDICAP", selection: "HOME_+1.5" })).toBe("Handicap Sporting Liesti +1,5");
  });
});

describe("shouldSendConsensusAlert — quality gate", () => {
  const base = { homeTeam: "PSG", awayTeam: "OM", market: "OVER_UNDER" as const, selection: "OVER_2_5" };

  it("passes a clean consensus", () => {
    expect(shouldSendConsensusAlert(base).ok).toBe(true);
  });

  it("rejects OVER_18 (OCR ate the decimal — real bug shipped today)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_18" }).ok).toBe(false);
  });

  it("rejects OVER_08 (bare 2-digit with no decimal separator)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_08" }).ok).toBe(false);
  });

  it("keeps OVER_0_5, OVER_2_5 etc. (real lines with the underscore-as-decimal)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_0_5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_5_5" }).ok).toBe(true);
  });

  it("rejects a meta caption picked up as a fixture side (real: 'Dail vs free bets in public channel')", () => {
    expect(shouldSendConsensusAlert({ homeTeam: "Dail", awayTeam: "free bets in public channel", market: "1X2", selection: "freebetsinpublicchannel" }).ok).toBe(false);
  });

  it("rejects a legacy bare-number handicap (no team side)", () => {
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "-26.5" }).ok).toBe(false);
  });

  it("rejects a name that boils down to nothing after sanitize", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "&" }).ok).toBe(false);
  });

  it("rejects a non-standard over/under fraction like 1.4 (real bug 2026-09-02: Sporting Liesti — 'Over 1.43' odds misread as the line)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_1_4" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_2_3" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, selection: "UNDER_1_7" }).ok).toBe(false);
  });

  it("keeps standard over/under fractions (.5, .25, .75)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_2_5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_1_25" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_2_75" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_2" }).ok).toBe(true);
  });

  it("rejects a sub-range basketball total — team/half line, not the match total (real 2026-09-09: 'Dugave Odema vs Metalac — Plus de 71,5 points')", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Dugave Odema", awayTeam: "Metalac", selection: "OVER_71_5" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_45_5" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, selection: "UNDER_88_5" }).ok).toBe(false);
  });

  it("keeps a real full-match basketball total (>= 115 points)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_162_5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "UNDER_180_5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_115_5" }).ok).toBe(true);
  });

  it("does not touch football over/under lines (< 15 is goals, not points)", () => {
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_5_5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, selection: "OVER_9_5" }).ok).toBe(true);
  });

  it("rejects a team name that reads as narrative Russian text (real bug 2026-09-02)", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Для них гол этой команде", awayTeam: "уже достижение" }).ok).toBe(false);
  });

  it("rejects a team name with too many words (5+ = narrative fragment)", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Pour eux le but est atteint" }).ok).toBe(false);
  });

  it("blocks HANDICAP without team side (legacy bare '-1.5' can't be posted — reader wouldn't know which team)", () => {
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "-1.5" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "+1.5" }).ok).toBe(false);
  });

  it("accepts HANDICAP with team side (new parser format 2026-09-02)", () => {
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "HOME_-1.5" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "AWAY_+2.5" }).ok).toBe(true);
  });

  it("rejects an aberrant handicap magnitude even with a team side", () => {
    expect(shouldSendConsensusAlert({ ...base, market: "HANDICAP", selection: "AWAY_-32" }).ok).toBe(false);
  });

  it("rejects a bet-slip menu fragment picked up as a team (real bug 2026-09-02: 'Main Same Game Multi vs Goals Asic')", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Main Same Game Multi", awayTeam: "Goals Asic", market: "OVER_UNDER", selection: "OVER_2_5" }).ok).toBe(false);
  });

  it("rejects Cyrillic team names — subscriber can't look them up in French (Noaim 2026-09-06)", () => {
    // Real cases from the 2026-09-06 screenshot: "Сингапур vs Монголия",
    // "AmMepuka MuHeHpo vs NoHapnHa", "BaacaH Harnoceypa vs IHACTaH".
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Сингапур", awayTeam: "Монголия" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Спартак Москва", awayTeam: "Динамо" }).ok).toBe(false);
  });

  it("rejects cyrillic-lookalike OCR garble ('BaacaH Harnoceypa vs IHACTaH')", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "BaacaH Harnoceypa", awayTeam: "IHACTaH" }).ok).toBe(false);
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "AmMepuka MuHeHpo", awayTeam: "NoHapnHa" }).ok).toBe(false);
  });

  it("keeps a clean, Latin, French/English-readable team name", () => {
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "Deportivo Paraguayo", awayTeam: "Club Leandro N. Alem" }).ok).toBe(true);
    expect(shouldSendConsensusAlert({ ...base, homeTeam: "FC Porto", awayTeam: "Sporting Lisboa" }).ok).toBe(true);
  });
});

describe("evaluateConsensusOutcome — grade the pick against final score", () => {
  const psg = { homeTeam: "PSG", awayTeam: "OM" };

  it("OVER_2_5 wins when total > 2.5", () => {
    expect(evaluateConsensusOutcome("OVER_UNDER", "OVER_2_5", psg, { homeScore: 2, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("OVER_UNDER", "OVER_2_5", psg, { homeScore: 1, awayScore: 1 })).toBe("LOST");
  });

  it("returns VOID on an exact-line push (Over 2.0 with 1-1)", () => {
    expect(evaluateConsensusOutcome("OVER_UNDER", "OVER_2", psg, { homeScore: 1, awayScore: 1 })).toBe("VOID");
  });

  it("1X2 with a team slug resolves against the actual team side", () => {
    expect(evaluateConsensusOutcome("1X2", "psg", psg, { homeScore: 3, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("1X2", "psg", psg, { homeScore: 1, awayScore: 1 })).toBe("LOST");
    expect(evaluateConsensusOutcome("1X2", "DRAW", psg, { homeScore: 1, awayScore: 1 })).toBe("WON");
  });

  it("BTTS YES needs both teams to score", () => {
    expect(evaluateConsensusOutcome("BTTS", "YES", psg, { homeScore: 1, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("BTTS", "YES", psg, { homeScore: 2, awayScore: 0 })).toBe("LOST");
  });

  it("double chance 1X wins on home or draw", () => {
    expect(evaluateConsensusOutcome("DOUBLE_CHANCE", "1X", psg, { homeScore: 1, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("DOUBLE_CHANCE", "1X", psg, { homeScore: 2, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("DOUBLE_CHANCE", "1X", psg, { homeScore: 0, awayScore: 1 })).toBe("LOST");
  });

  it("legacy handicap without team side stays null", () => {
    expect(evaluateConsensusOutcome("HANDICAP", "-1.5", psg, { homeScore: 2, awayScore: 0 })).toBeNull();
  });

  it("HANDICAP HOME -1.5 wins if home wins by 2+ goals", () => {
    expect(evaluateConsensusOutcome("HANDICAP", "HOME_-1.5", psg, { homeScore: 3, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("HANDICAP", "HOME_-1.5", psg, { homeScore: 2, awayScore: 1 })).toBe("LOST");
  });

  it("HANDICAP AWAY +1.5 wins if away loses by at most 1", () => {
    expect(evaluateConsensusOutcome("HANDICAP", "AWAY_+1.5", psg, { homeScore: 2, awayScore: 1 })).toBe("WON");
    expect(evaluateConsensusOutcome("HANDICAP", "AWAY_+1.5", psg, { homeScore: 3, awayScore: 1 })).toBe("LOST");
  });

  it("HANDICAP with an integer line can push (VOID) when the adjusted score is exactly level", () => {
    expect(evaluateConsensusOutcome("HANDICAP", "HOME_-1", psg, { homeScore: 2, awayScore: 1 })).toBe("VOID");
  });

  it("basketball total (Plus de 162,5 points) grades against total points", () => {
    expect(evaluateConsensusOutcome("OVER_UNDER", "OVER_162_5", { homeTeam: "Capiata Bulls", awayTeam: "Deportivo" }, { homeScore: 89, awayScore: 78 })).toBe("WON");
    expect(evaluateConsensusOutcome("OVER_UNDER", "OVER_162_5", { homeTeam: "Capiata Bulls", awayTeam: "Deportivo" }, { homeScore: 71, awayScore: 70 })).toBe("LOST");
  });
});

describe("formatConsensusOutcomeMessage — reply body", () => {
  it("renders a WON message with score + odds recap", () => {
    const body = formatConsensusOutcomeMessage({
      homeTeam: "Leicester City",
      awayTeam: "Plymouth Argyle",
      homeScore: 3,
      awayScore: 1,
      outcome: "WON",
      oddsAtAlert: 1.85,
    });
    expect(body).toContain("✅ Passé");
    expect(body).toContain("Leicester City 3-1 Plymouth Argyle");
    expect(body).toContain("Cote au signalement : 1,85");
  });

  it("renders a LOST message without odds when none was captured", () => {
    const body = formatConsensusOutcomeMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      homeScore: 0,
      awayScore: 0,
      outcome: "LOST",
    });
    expect(body).toContain("❌ Perdu");
    expect(body).not.toContain("Cote");
  });
});

describe("consensusStatusLine + replaceConsensusStatusLine — result line appended once graded", () => {
  const base = formatConsensusMessage({
    homeTeam: "FC Iberia 2010",
    awayTeam: "FC Orbi",
    market: "OVER_UNDER",
    selection: "OVER_2_5",
    fingerprint: "iberia|orbi|OVER_UNDER|OVER_2_5",
    groupCount: 2,
    country: "Georgia",
    oddsAtAlert: 1.75,
  });

  it("a fresh alert carries NO status line (Noaim 2026-09-06: 'enlève le statut')", () => {
    expect(base).not.toContain("Statut");
    expect(base).not.toContain("en attente du résultat");
    expect(currentConsensusStatusPrefix(base)).toBeNull();
  });

  it("appends a graded verdict + final score, leaving every other line intact", () => {
    const won = replaceConsensusStatusLine(
      base,
      consensusStatusLine({ state: "won", homeTeam: "FC Iberia 2010", awayTeam: "FC Orbi", homeScore: 3, awayScore: 2 }),
    );
    expect(won).toContain("✅ Résultat : pari validé — FC Iberia 2010 3-2 FC Orbi");
    expect(won).toContain("🌍 Pays : Georgia");
    expect(won).toContain("💰 Cote au signalement : 1,75");
    expect(won.split("\n").length).toBe(base.split("\n").length + 1);

    const lost = replaceConsensusStatusLine(
      base,
      consensusStatusLine({ state: "lost", homeTeam: "FC Iberia 2010", awayTeam: "FC Orbi", homeScore: 0, awayScore: 0 }),
    );
    expect(lost).toContain("❌ Résultat : pari perdu — FC Iberia 2010 0-0 FC Orbi");
  });

  it("a re-grade replaces the result line rather than stacking a second one", () => {
    const once = replaceConsensusStatusLine(
      base,
      consensusStatusLine({ state: "lost", homeTeam: "FC Iberia 2010", awayTeam: "FC Orbi", homeScore: 0, awayScore: 0 }),
    );
    const twice = replaceConsensusStatusLine(
      once,
      consensusStatusLine({ state: "won", homeTeam: "FC Iberia 2010", awayTeam: "FC Orbi", homeScore: 3, awayScore: 2 }),
    );
    expect(twice).toContain("✅ Résultat : pari validé");
    expect(twice).not.toContain("❌ Résultat");
    expect(twice.split("\n").length).toBe(once.split("\n").length);
  });

  it("still handles a legacy message that had a status line", () => {
    const legacy = [
      "⚽ Match : A vs B",
      "📊 Pronostic : Plus de 2,5 buts",
      "🔄 Statut : en attente du résultat",
    ].join("\n");
    const out = replaceConsensusStatusLine(legacy, consensusStatusLine({ state: "lost", homeTeam: "A", awayTeam: "B", homeScore: 1, awayScore: 0 }));
    expect(out).toContain("❌ Résultat : pari perdu — A 1-0 B");
    expect(out).not.toContain("🔄 Statut :");
    expect(out.split("\n").length).toBe(legacy.split("\n").length);
  });
});

describe("formatConsensusMessage — end-to-end format", () => {
  it("renders a simplified block — no header, no group count, no disclaimer, no status line", () => {
    const msg = formatConsensusMessage({
      homeTeam: "Leicester City",
      awayTeam: "Plymouth Argyle",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "leicester|plymouth|OVER_UNDER|OVER_2_5",
      groupCount: 2,
    });
    expect(msg).toContain("⚽ Match : Leicester City vs Plymouth Argyle");
    expect(msg).toContain("📊 Pronostic : Plus de 2,5 buts");
    expect(msg).not.toContain("Statut");
    expect(msg).not.toContain("Consensus détecté");
    expect(msg).not.toContain("Signalé par");
    expect(msg).not.toContain("Agrégation automatique");
    expect(msg.startsWith("⚽ Match :")).toBe(true);
  });

  it("uses the basketball emoji and 'points' unit for a basketball pick (real miss 2026-09-02 00:53)", () => {
    const msg = formatConsensusMessage({
      homeTeam: "Capiata Bulls",
      awayTeam: "Deportivo San Jose",
      market: "OVER_UNDER",
      selection: "OVER_162_5",
      fingerprint: "capiatabulls|deportivosanjose|OVER_UNDER|OVER_162_5",
      groupCount: 2,
    });
    expect(msg).toContain("🏀 Match : Capiata Bulls vs Deportivo San Jose");
    expect(msg).toContain("Plus de 162,5 points");
    expect(msg).not.toContain("buts");
    expect(msg).not.toContain("⚽");
  });

  it("adds the odds line when provided (French comma format)", () => {
    const msg = formatConsensusMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "x",
      groupCount: 2,
      oddsAtAlert: 1.85,
    });
    expect(msg).toContain("💰 Cote au signalement : 1,85");
  });

  it("omits the odds line when no odds were extracted", () => {
    const msg = formatConsensusMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "x",
      groupCount: 2,
    });
    expect(msg).not.toContain("Cote au signalement");
  });

  it("omits an absurdly-low odds line (real bug 2026-09-02: 1,02 surfaced from a market menu)", () => {
    const msg = formatConsensusMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "x",
      groupCount: 2,
      oddsAtAlert: 1.02,
    });
    expect(msg).not.toContain("Cote au signalement");
  });

  it("averages multiple odds samples into a single displayed value, no tag (Noaim 2026-09-05)", () => {
    const msg = formatConsensusMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "x",
      groupCount: 2,
      oddsSamples: [1.5, 2.0],
    });
    expect(msg).toContain("💰 Cote au signalement : 1,75");
    expect(msg).not.toContain("moyenne");
    expect(msg).not.toContain("selon les groupes");
    expect(msg).not.toContain("–");
  });

  it("shows a single odds value when all groups agree", () => {
    const msg = formatConsensusMessage({
      homeTeam: "PSG",
      awayTeam: "OM",
      market: "OVER_UNDER",
      selection: "OVER_2_5",
      fingerprint: "x",
      groupCount: 2,
      oddsSamples: [1.85, 1.85],
    });
    expect(msg).toContain("💰 Cote au signalement : 1,85");
    expect(msg).not.toContain("moyenne");
  });

  it("cleans the team names in the rendered message (& / © artefacts)", () => {
    const msg = formatConsensusMessage({
      homeTeam: "Wigry Suwatki",
      awayTeam: "& Termalica",
      market: "OVER_UNDER",
      selection: "OVER_5_5",
      fingerprint: "termalica|wigry|OVER_UNDER|OVER_5_5",
      groupCount: 2,
    });
    expect(msg).toContain("Wigry Suwatki vs Termalica");
    expect(msg).not.toContain("&");
  });
});
