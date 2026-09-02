import { describe, expect, it } from "vitest";
import { parseTipMessage, extractFixture, extractSelection, buildParsedTip, getDirectionKey, fuzzyFixtureMatch } from "./tipParser";

describe("buildParsedTip canonical fingerprint", () => {
  const fixture = { homeTeam: "Blooming", awayTeam: "Real Oruro" };
  const pick = { market: "OVER_UNDER", selection: "OVER_3_5" };

  it("uses the sorted-slug form when no canonical event is given", () => {
    expect(buildParsedTip(fixture, pick).fingerprint).toBe("blooming|realoruro|OVER_UNDER|OVER_3_5");
  });

  it("keys on the event id when the fixture resolved, ignoring name spelling", () => {
    const a = buildParsedTip({ homeTeam: "Bloomng", awayTeam: "R Oruro" }, pick, { eventId: "evt_123" });
    const b = buildParsedTip({ homeTeam: "Real Oruro", awayTeam: "Blooming" }, pick, { eventId: "evt_123" });
    expect(a.fingerprint).toBe("evt:evt_123|OVER_UNDER|OVER_3_5");
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.eventId).toBe("evt_123");
  });
});

describe("parseTipMessage", () => {
  it("returns null for text with no recognizable fixture", () => {
    expect(parseTipMessage("Bonjour tout le monde, bonne soirée à tous 🎉")).toBeNull();
  });

  it("returns null when only teams are found but no market/selection", () => {
    expect(parseTipMessage("PSG vs OM\nCe soir à 21h")).toBeNull();
  });

  it("parses an over/under pick", () => {
    const result = parseTipMessage("PSG vs OM\nPari : Over 2.5 buts ✅");
    expect(result).toMatchObject({ homeTeam: "PSG", awayTeam: "OM", market: "OVER_UNDER", selection: "OVER_2_5" });
  });

  it("parses a French-phrased under pick", () => {
    const result = parseTipMessage("Real Madrid - Barcelona\nMoins de 2,5 buts");
    expect(result).toMatchObject({ market: "OVER_UNDER", selection: "UNDER_2_5" });
  });

  it("parses an over/under line other than 1.5/2.5 (real miss: 5.5 was previously unrecognized)", () => {
    const result = parseTipMessage("Sang Mustang vs Dzongri\nOver 5,5 but");
    expect(result).toMatchObject({ homeTeam: "Sang Mustang", awayTeam: "Dzongri", market: "OVER_UNDER", selection: "OVER_5_5" });
  });

  it("parses a +/-N buts line for an arbitrary goal total", () => {
    const over = parseTipMessage("PSG vs OM\n+3.5 buts");
    expect(over).toMatchObject({ market: "OVER_UNDER", selection: "OVER_3_5" });
    const under = parseTipMessage("PSG vs OM\n-0.5 buts");
    expect(under).toMatchObject({ market: "OVER_UNDER", selection: "UNDER_0_5" });
  });

  it("parses an over/under line where a bookmaker app puts the number in parens (real miss: 'Total: Over (4.5) 1.755')", () => {
    const result = parseTipMessage("Mylliem - Mawlai\nTotal: Over (4.5) 1.755");
    expect(result).toMatchObject({ market: "OVER_UNDER", selection: "OVER_4_5" });
  });

  it("does not mistake a bare Asian Handicap number (no 'buts' suffix) for an over/under goal total", () => {
    const fixture = extractFixture("Sang Mustang FC v Dzongri FC")!;
    expect(extractSelection("FC -1.5\nAsian Handicap In-Play", fixture)?.market).not.toBe("OVER_UNDER");
  });

  it("parses a BTTS pick", () => {
    const result = parseTipMessage("Lyon vs Marseille\nBTTS: Oui");
    expect(result).toMatchObject({ market: "BTTS", selection: "YES" });
  });

  it("parses a numeric 1X2 pick using team identity, not position", () => {
    const result = parseTipMessage("PSG vs OM\nPronostic: 1");
    expect(result?.market).toBe("1X2");
    expect(result?.selection).toBe("psg");
  });

  it("resolves a win-word pick to the named team", () => {
    const result = parseTipMessage("PSG vs OM\nPSG gagne ce soir 💪");
    expect(result?.selection).toBe("psg");
  });

  it("produces the same fingerprint regardless of team listing order", () => {
    const a = parseTipMessage("PSG vs OM\nPSG gagne ce soir");
    const b = parseTipMessage("OM vs PSG\nPSG gagne ce soir");
    expect(a?.fingerprint).toBe(b?.fingerprint);
  });

  it("produces different fingerprints for different selections on the same fixture", () => {
    const home = parseTipMessage("PSG vs OM\nPSG gagne ce soir");
    const away = parseTipMessage("PSG vs OM\nOM gagne ce soir");
    expect(home?.fingerprint).not.toBe(away?.fingerprint);
  });

  it("ignores lines containing odds-like numbers when looking for teams", () => {
    expect(parseTipMessage("Cote 2.10 - 3.40\nOver 2.5 buts")).toBeNull();
  });

  it("parses a handicap pick written as 'Handicap: N (-X.X)' with the team indicator (2 = away)", () => {
    const result = parseTipMessage("San Alfonso vs Deportivo Amambay\nHandicap: 2 (-9.5)");
    expect(result).toMatchObject({ market: "HANDICAP", selection: "AWAY_-9.5" });
  });

  it("parses a handicap pick from a 'MARKET: TeamName -X.X' line", () => {
    const result = parseTipMessage("SPORTING LIESTI VS DINAMO BUCURESTI\nMARKET: DINAMO BUCURESTI -2.5\nODDS: 1.89");
    expect(result).toMatchObject({ market: "HANDICAP", selection: "AWAY_-2.5" });
  });

  it("parses a handicap where the team indicator says 1 = home", () => {
    const result = parseTipMessage("Liverpool vs Chelsea\nhandicap 1 -1.5");
    expect(result).toMatchObject({ market: "HANDICAP", selection: "HOME_-1.5" });
  });

  it("returns null for a bare '-9.5 hdcp' with no team info (reader would not know which team)", () => {
    // Ambiguous by design — used to return "-9.5" pre-2026-09-02.
    expect(parseTipMessage("PSG vs OM\n-9.5 hdcp✅")).toBeNull();
  });

  it("extracts teams from a live-score line ('Team A 1:1 Team B') when no vs/dash separator exists", () => {
    const result = parseTipMessage("Puerto Rico 1:1 Cuba\nW2");
    expect(result).toMatchObject({ homeTeam: "Puerto Rico", awayTeam: "Cuba", market: "1X2", selection: "cuba" });
  });

  it("does not mistake a stats line with multiple score-like numbers for a fixture", () => {
    expect(parseTipMessage("3rd set (11-25, 26-24, 5-7)\nW2")).toBeNull();
  });

  it("resolves W1 to the first-listed team", () => {
    const result = parseTipMessage("Puerto Rico 1:1 Cuba\nW1");
    expect(result?.selection).toBe("puertorico");
  });

  it("real-world regression: LA HAINE OCR capture shows both odds options, not a pick — stays null", () => {
    // The image alone (odds board showing both "W1 2.05" and "W2 1.72") is
    // ambiguous by design — the actual pick ("W2") was in the short text
    // caption on a separate message, which this parser deliberately never
    // merges with the image (see tipListener.ts). A known gap: this real
    // message is correctly rejected rather than guessed, but isn't captured.
    const ocrText = [
      "4 Volleyball. NORCECA Continental A ie",
      "Championship. Women",
      "Group stage. Group B",
      "Puerto Rico 1:1 Cuba",
      "(Women) '5 2 (Women)",
      "3rd set (11-25, 26-24, 5-*7)",
      "Total (8) x v",
      "oe © -",
      "W1 2.05 W2 1.72",
    ].join("\n");
    expect(parseTipMessage(ocrText)).toBeNull();
  });
});

describe("extractFixture / extractSelection (cross-message resolution)", () => {
  it("extracts a fixture from an image with no pick in it", () => {
    expect(extractFixture("Puerto Rico vs Cuba\nLive now")).toEqual({ homeTeam: "Puerto Rico", awayTeam: "Cuba" });
  });

  it("finds no fixture in a bare follow-up message", () => {
    expect(extractFixture("W2")).toBeNull();
    expect(extractFixture("Victoire de Cuba")).toBeNull();
  });

  it("resolves a follow-up's selection against a fixture remembered from an earlier message, matching the same-message fingerprint", () => {
    const fixture = extractFixture("Puerto Rico vs Cuba\nLive now")!;

    const fromW2 = buildParsedTip(fixture, extractSelection("W2", fixture)!);
    const fromWords = buildParsedTip(fixture, extractSelection("Victoire de Cuba", fixture)!);
    const combined = parseTipMessage("Puerto Rico vs Cuba\nCuba gagne")!;

    expect(fromW2.fingerprint).toBe(combined.fingerprint);
    expect(fromWords.fingerprint).toBe(combined.fingerprint);
  });
});

describe("getDirectionKey — similar picks bucket together", () => {
  const fx = { homeTeam: "Cruz Azul Hidalgo", awayTeam: "Tepatitlan" };

  it("buckets a big favorite handicap (|N| ≥ 3) on a team as '<side>_wins_big'", () => {
    expect(getDirectionKey("HANDICAP", "HOME_-5", fx)).toBe("home_wins_big");
    expect(getDirectionKey("HANDICAP", "AWAY_-4.5", fx)).toBe("away_wins_big");
  });

  it("keeps a small favorite handicap as '<side>_wins_narrow'", () => {
    expect(getDirectionKey("HANDICAP", "HOME_-1", fx)).toBe("home_wins_narrow");
    expect(getDirectionKey("HANDICAP", "AWAY_-2", fx)).toBe("away_wins_narrow");
  });

  it("underdog handicap (+X) buckets as '<side>_covers_underdog'", () => {
    expect(getDirectionKey("HANDICAP", "HOME_+1.5", fx)).toBe("home_covers_underdog");
    expect(getDirectionKey("HANDICAP", "AWAY_+2", fx)).toBe("away_covers_underdog");
  });

  it("legacy no-side handicap stays uninferable (null)", () => {
    expect(getDirectionKey("HANDICAP", "-1.5", fx)).toBeNull();
  });

  it("keeps under-goals its own side", () => {
    expect(getDirectionKey("OVER_UNDER", "UNDER_2_5", fx)).toBe("under_goals");
  });

  it("keeps over-goals as 'over_goals'", () => {
    expect(getDirectionKey("OVER_UNDER", "OVER_4_5", fx)).toBe("over_goals");
  });
});

describe("fuzzyFixtureMatch — whole-word rescue for short OCR fragments", () => {
  // Real case, 2026-08-31: one channel's OCR mangled "Binan Tatak Gel
  // GameX vs Rizal Golden Coolers" down to bare "Gel" for the home team;
  // "gel" is 3 chars so the plain substring rule rejects it outright, even
  // though it's one whole word of the full name — this fractured the
  // consensus bucket across two channels that both saw the same live game.
  it("matches a bare 3-char fragment against the full name it came from", () => {
    const short = { homeTeam: "Gel", awayTeam: "Coolers" };
    const full = { homeTeam: "Binan Tatak Gel GameX", awayTeam: "Rizal Golden Coolers" };
    expect(fuzzyFixtureMatch(short, full)).toBe(true);
  });

  it("still rejects an unrelated short fragment (no false positives)", () => {
    const short = { homeTeam: "Star", awayTeam: "City" };
    const unrelated = { homeTeam: "Real Madrid", awayTeam: "Manchester United" };
    expect(fuzzyFixtureMatch(short, unrelated)).toBe(false);
  });

  it("keeps the existing ≥5-char substring behavior working", () => {
    const short = { homeTeam: "Darul Takzim", awayTeam: "Nongrah" };
    const full = { homeTeam: "Johor Darul Takzim", awayTeam: "Umlyngka Nongrah" };
    expect(fuzzyFixtureMatch(short, full)).toBe(true);
  });

  // Real miss, 2026-09-01: a Russian-language channel posted "Нортернерс vs
  // Сикким Полис" while an English channel posted "Northerners FC vs Sikkim
  // Police" for the same India Sikkim S-League match. Cyrillic characters
  // were stripped entirely by the slugger (slug came out ""), so the two
  // never merged and the consensus alert never fired.
  it("matches a Cyrillic-transliterated fixture against its English spelling", () => {
    const ru = { homeTeam: "Нортернерс", awayTeam: "Сикким Полис" };
    const en = { homeTeam: "Northerners FC", awayTeam: "Sikkim Police" };
    expect(fuzzyFixtureMatch(ru, en)).toBe(true);
  });

  it("does not merge two different teams that happen to be within the edit-distance budget", () => {
    // "arsenal" vs "arsenol" is 1 edit but these are short-ish; more to the
    // point, unrelated real names stay apart.
    const a = { homeTeam: "Liverpool", awayTeam: "Everton" };
    const b = { homeTeam: "Liverpool", awayTeam: "Preston" }; // Everton vs Preston: distance 5
    expect(fuzzyFixtureMatch(a, b)).toBe(false);
  });
});
