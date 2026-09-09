/**
 * Turns tipster messages into normalized picks, or null if they can't be
 * read with enough confidence. Deliberately conservative: a missed parse
 * just means one fewer vote toward consensus, but a wrong parse can merge
 * two different picks into the same fingerprint — so every rule here favors
 * silence over a guess. Coverage is v1 (1X2, over/under 1.5/2.5, BTTS,
 * double chance, handicap); extend MARKET_RULES as real tipster formats
 * show up.
 *
 * Split into two phases (extractFixture / extractSelection) rather than one
 * combined function, because real tip channels routinely spread a pick
 * across two messages in the same chat: an image naming the fixture, then a
 * short standalone follow-up ("W2", "Victoire de Cuba") with no team names
 * at all. tipListener.ts remembers the last fixture per source chat
 * (ChatFixtureContext) and feeds it to extractSelection when a message has
 * no fixture of its own — see chatFixtureContext.ts.
 */

export interface Fixture {
  homeTeam: string;
  awayTeam: string;
}

export interface ParsedTip extends Fixture {
  market: string;
  /** Either a market outcome code (OVER_2_5, YES, 1X…) or a team slug when
   *  the pick is "this team wins" — using the team slug instead of a
   *  home/away label keeps the fingerprint correct even when two tipsters
   *  list the same fixture in opposite order. */
  selection: string;
  /** Order-independent key: two messages describing the same pick collapse
   *  to the same fingerprint regardless of team order or exact wording.
   *  When the fixture was snapped to a canonical `Event` (see
   *  fixtureResolver.ts) this is `evt:<id>|MARKET|SELECTION`, which also
   *  absorbs OCR spelling drift between channels; otherwise it falls back
   *  to the sorted-team-slug form. */
  fingerprint: string;
  /** Set when the raw names resolved to a row in our own fixture table. */
  eventId?: string;
}

const ACCENTS_RE = /[\u0300-\u036f]/g;

/**
 * Cyrillic \u2192 Latin, so a Russian-language tip channel writing "\u041d\u043e\u0440\u0442\u0435\u0440\u043d\u0435\u0440\u0441"
 * / "\u0421\u0438\u043a\u043a\u0438\u043c \u041f\u043e\u043b\u0438\u0441" for a match an English channel calls "Northerners" /
 * "Sikkim Police" boils down to the same team slug and can count toward the
 * same consensus (real miss, 2026-09-01: the two posts never merged and
 * the alert never fired). Phonetic transliteration only gets the two
 * spellings *close* \u2014 "\u043d\u043e\u0440\u0442" drops the silent "th" so it lands on
 * "nort" not "north" \u2014 so `sideMatchesFuzzy` below also allows a small
 * edit-distance gap once a name is long enough for that to be safe.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  \u0430: "a", \u0431: "b", \u0432: "v", \u0433: "g", \u0434: "d", \u0435: "e", \u0451: "e", \u0436: "zh", \u0437: "z",
  \u0438: "i", \u0439: "i", \u043a: "k", \u043b: "l", \u043c: "m", \u043d: "n", \u043e: "o", \u043f: "p", \u0440: "r",
  \u0441: "s", \u0442: "t", \u0443: "u", \u0444: "f", \u0445: "h", \u0446: "ts", \u0447: "ch", \u0448: "sh",
  \u0449: "sch", \u044a: "", \u044b: "y", \u044c: "", \u044d: "e", \u044e: "yu", \u044f: "ya",
};

function transliterate(s: string): string {
  let out = "";
  for (const ch of s) out += ch in CYRILLIC_TO_LATIN ? CYRILLIC_TO_LATIN[ch] : ch;
  return out;
}

function normalize(s: string): string {
  return transliterate(s.normalize("NFD").replace(ACCENTS_RE, "").toLowerCase()).trim();
}

/** Levenshtein edit distance, plain DP \u2014 inputs here are single team slugs
 *  (well under 40 chars) so the O(n\u00b7m) table is fine. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Generic corporate suffixes/prefixes ("FC", "Utd") that vary between
 * tipsters for the same team — "Umphrup" vs "Umphrup FC" is one match, and
 * the consensus fingerprint must not fracture on that decoration. Applied
 * as word-level tokens so "FC Barcelona" and "Barcelona FC" collapse both
 * ways. DELIBERATELY EXCLUDED: U19/U21/etc (youth teams — separate
 * competition), II/III/B (reserve teams), Women/Femmes (women's team),
 * "Athletic"/"City"/"Real" (part of team identity: Athletic Bilbao ≠
 * Atletico Madrid, Manchester City ≠ Manchester United).
 */
const CLUB_DECORATIONS = new Set([
  "fc", "sc", "ac", "cf", "cd", "afc", "cfc",
  "sv", "vfl", "vfb", "bk", "if", "sk", "ff", "fk", "ik", "hk", "tk",
  "united", "utd", "club", "team",
  "vv", "vv.",
]);

function slugTeamWords(s: string): string[] {
  return normalize(s)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !CLUB_DECORATIONS.has(w));
}

export function slugTeam(s: string): string {
  return slugTeamWords(s).join("");
}

const TEAM_SEPARATOR_RE = /\s+(?:vs\.?|v\.?|x|-|–|—)\s+/i;

/**
 * Words that mean "league / country / competition context" — never a team
 * name, but the fixture regex would otherwise grab them off lines like
 * "Championnat de Malaisie. Super League" and produce a phantom fixture
 * (real miss on Darul Takzim, 2026-08-29 UTC 14:20). If either side of a
 * candidate "Team A vs Team B" boils down to just these words after slug
 * normalization, the candidate is rejected — the real teams appear on
 * another line and are picked up on the next pass.
 */
const NON_TEAM_TOKENS = new Set([
  "malaisie", "malaysia", "france", "angleterre", "england", "italie", "italy",
  "espagne", "spain", "allemagne", "germany", "portugal", "belgique", "belgium",
  "argentine", "argentina", "bresil", "brazil", "mexique", "mexico", "japon", "japan",
  "coree", "korea", "chine", "china", "inde", "india", "usa", "america",
  "australie", "australia", "iran", "irak", "iraq", "russie", "russia", "ukraine",
  "championnat", "championship", "ligue", "league", "superleague", "premier",
  "division", "conference", "cup", "coupe", "trophy", "trophee",
  "round", "tour", "matchday", "saison", "season", "group", "groupe", "phase",
  "playoff", "playoffs", "finale", "final", "semi", "quarter", "eliminatoire",
  "temps", "matchs", "match", "football", "basket", "tennis", "handball", "cricket",
  "womens", "women", "femmes",
]);

function isRealTeamName(candidate: string): boolean {
  const words = normalize(candidate)
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  // At least one word must be a real team-name-looking token — every word
  // being a country/competition word is what betrays the phantom.
  return words.some((w) => !NON_TEAM_TOKENS.has(w) && w.length >= 2);
}

/** A line reads as "Team A vs Team B" if it splits cleanly in two on a known
 *  separator, both sides are short and letter-only (no odds like "2.10"). */
function extractTeams(line: string): [string, string] | null {
  const parts = line.split(TEAM_SEPARATOR_RE);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((p) => p.trim());
  if (!a || !b) return null;
  if (a.length > 40 || b.length > 40) return null;
  if (/\d/.test(a) || /\d/.test(b)) return null;
  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  return [a, b];
}

/** Live-score screenshots (OCR'd) usually read "Team A 1:1 Team B" rather
 *  than using a vs/dash separator — the score sits where the separator
 *  would be. Tried only when extractTeams finds nothing, so a genuine
 *  vs/dash fixture line is never overridden by a looser match. */
const SCORE_SEPARATOR_RE = /^(.{2,30}?)\s+\d{1,3}\s*[:\-]\s*\d{1,3}\s+(.{2,30}?)$/;

function extractTeamsFromScoreLine(line: string): [string, string] | null {
  const match = line.match(SCORE_SEPARATOR_RE);
  if (!match) return null;
  const [, a, b] = match;
  // Guards against swallowing stats blobs like "3rd set (11-25," as a "team
  // name" — real team names carry no leftover digits/punctuation once the
  // score itself has been split off.
  if (/\d/.test(a) || /\d/.test(b)) return null;
  if (/[(),]/.test(a) || /[(),]/.test(b)) return null;
  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  return [a.trim(), b.trim()];
}

/** Finds a fixture ("Team A vs Team B") anywhere in the message, or null if
 *  none reads clean enough. Standalone so a message can be recognized as
 *  "just announces a match" independent of whether it also has a pick. */
export function extractFixture(rawText: string): Fixture | null {
  if (!rawText) return null;
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const teams = extractTeams(line);
    if (teams) return { homeTeam: teams[0], awayTeam: teams[1] };
  }
  for (const line of lines) {
    const teams = extractTeamsFromScoreLine(line);
    if (teams) return { homeTeam: teams[0], awayTeam: teams[1] };
  }
  return null;
}

interface MarketRule {
  market: string;
  selection: string;
  pattern: RegExp;
}

const MARKET_RULES: MarketRule[] = [
  { market: "BTTS", selection: "YES", pattern: /(btts|les deux equipes marquent|deux equipes marquent)/i },
  { market: "DOUBLE_CHANCE", selection: "1X", pattern: /\b1x\b/i },
  { market: "DOUBLE_CHANCE", selection: "X2", pattern: /\bx2\b/i },
  { market: "DOUBLE_CHANCE", selection: "12", pattern: /\b12\b/i },
];

/**
 * Over/under goal lines aren't just 1.5/2.5 — real tipsters post 0.5 through
 * 6.5+ depending on the sport and match. Originally hardcoded to 1.5/2.5
 * only, which silently dropped every other line (a real miss: "Sang Mustang
 * vs Dzongri — Over 5.5 buts" never reached consensus because 5.5 wasn't
 * recognized). The bare +/-N form still requires a trailing "buts?" to
 * avoid misreading an Asian Handicap line ("-1.5") as a goal total — see
 * HANDICAP_RE below, which the same raw handicap board would otherwise
 * collide with.
 */
// \W{0,3} (not \s*) between the word and the number — real posts write
// "Over (4.5)" or "Over: 4.5" from a bookmaker app's own goal-line panel,
// not just a bare space (a real miss: "Total: Over (4.5) 1.755" was still
// dropped by the first fix because "(" isn't whitespace).
const OVER_RE = /(?:over\W{0,3}(\d+(?:[.,]\d)?)|plus de\W{0,3}(\d+(?:[.,]\d)?)|\+\s*(\d+(?:[.,]\d)?)\s*buts?)/i;
const UNDER_RE = /(?:under\W{0,3}(\d+(?:[.,]\d)?)|moins de\W{0,3}(\d+(?:[.,]\d)?)|-\s*(\d+(?:[.,]\d)?)\s*buts?)/i;

/**
 * A lot of tipster channels post first-half-only lines — nearly always
 * "over 0.5 / 1.5 (1ère mi-temps)". Those must NOT collapse into the same
 * fingerprint as a full-match "over 1.5" (they're a different bet with a
 * different price and outcome), so when one of these cues is present the
 * market becomes `OVER_UNDER_HT` instead of `OVER_UNDER`.
 *
 * Deliberately requires an EXPLICIT first-half marker — "1ère mi-temps",
 * "première période", "1st half", or a standalone HT/MT/1H/1T abbreviation
 * (the forms bet-slip OCR leaves behind). A bare "mi-temps" mention is NOT
 * enough: tipsters routinely reference the half-time state while betting on
 * the full match ("3-0 à la mi-temps, over 4.5 facile" is a full-time
 * over), and a wrong HT tag both fractures the consensus fingerprint and
 * grades the pick against the wrong score. Second-half lines ("2e
 * mi-temps") are screened out separately in extractSelection.
 */
const FIRST_HALF_CUE_RE =
  /(?:\b1(?:ere|ère|re|er)?\s*(?:mi[-\s]?temps|p[ée]riode|half)\b|\bpremi[èe]re\s*(?:mi[-\s]?temps|p[ée]riode)\b|\b1st\s*half\b|\bfirst\s*half\b|\bmi[-\s]?temps\s*1\b|\b(?:ht|mt|1h|1t)\b)/i;

/** Explicit SECOND-half markers — when present, a generic first-half cue is
 *  ignored so "over 0.5 2e mi-temps" stays a plain (non-HT) line rather
 *  than being mislabelled. */
const SECOND_HALF_CUE_RE =
  /(?:\b2(?:e|eme|ème|nd)?\s*(?:mi[-\s]?temps|p[ée]riode|half)\b|\bseconde?\s*(?:mi[-\s]?temps|p[ée]riode)\b|\bdeuxi[èe]me\s*(?:mi[-\s]?temps|p[ée]riode)\b|\b2nd\s*half\b|\b(?:2h|2t)\b)/i;

function matchOverUnder(
  rawText: string,
  re: RegExp,
  direction: "OVER" | "UNDER",
  half: "" | "_HT" = "",
): { market: string; selection: string } | null {
  const match = rawText.match(re);
  if (!match) return null;
  const raw = match[1] ?? match[2] ?? match[3];
  const line = raw.replace(",", ".").replace(".", "_");
  return { market: `OVER_UNDER${half}`, selection: `${direction}_${line}` };
}

/**
 * Handicap parsing tries three patterns in order, each of which can pin
 * the pick to a team side (real requirement from Noaim 2026-09-02: a
 * "Handicap -1.5" alert with no team is unreadable to the VIP subscriber).
 *
 *   1. Handicap: 1 (-9.5)   / handicap 2 -1.5   — the 1/2 is the team
 *      (bookmaker convention: 1 = home, 2 = away).
 *   2. MARKET: DINAMO BUCURESTI -2.5           — English tipster format;
 *      the team name adjacent to the number matches home or away.
 *   3. TeamName [+-]X.X on a bare line         — same idea, no MARKET tag.
 *
 * Anything else (a floating "-1.5 hdcp" with no team) returns null — the
 * downstream quality gate blocks handicaps without a team side.
 */
// "Handicap: 1 (-9.5)" — group 1 is the team indicator, group 2 the value.
// The value may or may not carry an explicit sign; if none is given, book
// convention has "handicap 1 -1.5" meaning home -1.5 (the sign is written).
// We only accept an explicit sign since without it we can't tell backing
// from spotting.
const HANDICAP_TEAM_INDICATOR_RE = /(?:handicap|hcap|hdcp|hcp)[\s:—-]*([12])\b[\s(]*([+-]\d+(?:\.\d+)?)/i;

// "MARKET: DINAMO BUCURESTI -2.5" or "market: liverpool +0.5"
const HANDICAP_MARKET_LINE_RE = /(?:market|marché|marche|pari)\s*[:\-—]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .\-']{2,50}?)\s+([+-]\d+(?:\.\d+)?)/i;

// A bare line "SomeTeam -1.5" — checked per line so we don't cross-match
// across unrelated content.
const HANDICAP_BARE_TEAM_RE = /^\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .\-']{2,50}?)\s+([+-]\d+(?:\.\d+)?)\s*$/;

const WIN_WORDS_RE = /(gagne|victoire|vainqueur|\bwin\b)/i;
const NUMERIC_1X2_RE = /(?:pronostic|prono|pick|tip)\s*[:\-]?\s*(1|x|2)\b/i;

/**
 * Selection format for HANDICAP is `HOME_<signed>` or `AWAY_<signed>` (e.g.
 * `HOME_-1.5`, `AWAY_+2.5`) so downstream code (alertFormat.ts, outcome
 * evaluator) knows which team the handicap applies to. Returns null when
 * no team side can be inferred — the caller then skips the handicap pattern
 * entirely rather than emitting a picker-unfriendly bare number.
 */
function extractHandicap(rawText: string, fixture: Fixture): { market: string; selection: string } | null {
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);

  // Pattern 1: "Handicap: 1 (-9.5)" / "handicap 2 +1.5" — 1 = home, 2 = away.
  const indicator = rawText.match(HANDICAP_TEAM_INDICATOR_RE);
  if (indicator) {
    const side = indicator[1] === "1" ? "HOME" : "AWAY";
    return { market: "HANDICAP", selection: `${side}_${indicator[2]}` };
  }

  // Pattern 2: "MARKET: DINAMO BUCURESTI -2.5" — a labeled market line
  // whose text before the number matches home or away.
  const marketLine = rawText.match(HANDICAP_MARKET_LINE_RE);
  if (marketLine) {
    const teamText = marketLine[1].trim();
    const side = matchTeamText(teamText, homeSlug, awaySlug);
    if (side) return { market: "HANDICAP", selection: `${side}_${marketLine[2]}` };
  }

  // Pattern 3: a bare per-line "TeamName -X.X".
  for (const line of rawText.split("\n")) {
    const bare = line.match(HANDICAP_BARE_TEAM_RE);
    if (!bare) continue;
    const side = matchTeamText(bare[1], homeSlug, awaySlug);
    if (side) return { market: "HANDICAP", selection: `${side}_${bare[2]}` };
  }

  return null;
}

/** Case- and accent-insensitive match of a chunk of text against the home
 *  or away team's normalized slug. Returns "HOME"/"AWAY" or null. */
function matchTeamText(text: string, homeSlug: string, awaySlug: string): "HOME" | "AWAY" | null {
  const s = slugTeam(text);
  if (!s) return null;
  // "TeamName" appears within one side's slug (or vice-versa) with at
  // least 4 characters of overlap — enough to rule out one-letter accidents.
  const matches = (a: string, b: string) => (a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 4;
  if (matches(s, homeSlug)) return "HOME";
  if (matches(s, awaySlug)) return "AWAY";
  return null;
}

/**
 * Finds a market + selection in the message given an already-known fixture
 * (from this same message, or remembered from an earlier one in the same
 * chat — see ChatFixtureContext). Team names are only used to resolve
 * "this team wins" phrasing (win words / W1-W2 shorthand) to a team slug.
 */
export function extractSelection(rawText: string, fixture: Fixture): { market: string; selection: string } | null {
  if (!rawText) return null;
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);

  const half: "" | "_HT" =
    FIRST_HALF_CUE_RE.test(rawText) && !SECOND_HALF_CUE_RE.test(rawText) ? "_HT" : "";
  const over = matchOverUnder(rawText, OVER_RE, "OVER", half);
  if (over) return over;
  const under = matchOverUnder(rawText, UNDER_RE, "UNDER", half);
  if (under) return under;

  for (const rule of MARKET_RULES) {
    if (rule.pattern.test(rawText)) {
      return { market: rule.market, selection: rule.selection };
    }
  }

  const handicap = extractHandicap(rawText, fixture);
  if (handicap) return handicap;

  const numericMatch = rawText.match(NUMERIC_1X2_RE);
  if (numericMatch) {
    const code = numericMatch[1].toLowerCase();
    const selection = code === "1" ? homeSlug : code === "2" ? awaySlug : "DRAW";
    return { market: "1X2", selection };
  }

  // Only trusted when exactly one of the two tokens is present — an odds
  // display naming both ("W1 2.05 W2 1.72") isn't a pick, it's a menu of
  // options, and picking the first one found would just be a guess.
  const hasW1 = /\bw1\b/i.test(rawText);
  const hasW2 = /\bw2\b/i.test(rawText);
  if (hasW1 && !hasW2) return { market: "1X2", selection: homeSlug };
  if (hasW2 && !hasW1) return { market: "1X2", selection: awaySlug };

  // Scoped to the single line carrying the win word — checking the whole
  // message would also match a fixture line if one happens to be present,
  // wrongly picking the home team no matter which one the pick line names.
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const pickLine = lines.find((line) => WIN_WORDS_RE.test(line));
  if (pickLine) {
    const normLine = normalize(pickLine);
    if (normLine.includes(normalize(fixture.homeTeam))) return { market: "1X2", selection: homeSlug };
    if (normLine.includes(normalize(fixture.awayTeam))) return { market: "1X2", selection: awaySlug };
  }

  return null;
}

export function buildParsedTip(
  fixture: Fixture,
  marketSelection: { market: string; selection: string },
  canonical?: { eventId: string },
): ParsedTip {
  if (canonical) {
    const fingerprint = `evt:${canonical.eventId}|${marketSelection.market}|${marketSelection.selection}`;
    return { ...fixture, ...marketSelection, fingerprint, eventId: canonical.eventId };
  }
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);
  const fingerprint = [...[homeSlug, awaySlug].sort(), marketSelection.market, marketSelection.selection].join("|");
  return { ...fixture, ...marketSelection, fingerprint };
}

/**
 * Direction-level bucket for looser consensus: 3 tipsters betting the same
 * SIDE of the same match count as a consensus even if the exact market or
 * line differs. Real tipsters rarely pick identical lines — Over 4.5, Over
 * 5.5, Over 6.5 all mean "goals will come"; Handicap -4.5 and Handicap -5
 * on the same favorite both mean "backing the favorite to win big". A
 * strict fingerprint requires all three chats to pick the exact same line;
 * this key groups by direction so the pattern still fires. Returns null
 * when the (market, selection) pair can't be classified — HANDICAP without
 * a clear team side is bucketed by "any handicap on this match" (the most
 * common convention: negative handicap = favorite) so at least the "back
 * the favorite" cluster is captured.
 */
export function getDirectionKey(market: string, selection: string, fixture: Fixture): string | null {
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);
  if (market === "1X2") {
    if (selection === homeSlug) return "home_wins";
    if (selection === awaySlug) return "away_wins";
    if (selection === "DRAW") return "draw";
    return null;
  }
  if (market === "OVER_UNDER" || market === "OVER_UNDER_HT") {
    // First-half goals get their own direction bucket — a "over 1.5 HT"
    // reader and a "over 2.5 full-time" reader are not backing the same
    // thing, so they must never merge into one directional consensus.
    const suffix = market === "OVER_UNDER_HT" ? "_ht" : "";
    if (selection.startsWith("OVER_")) return `over_goals${suffix}`;
    if (selection.startsWith("UNDER_")) return `under_goals${suffix}`;
    return null;
  }
  if (market === "BTTS") {
    if (selection === "YES") return "btts_yes";
    if (selection === "NO") return "btts_no";
    return null;
  }
  if (market === "DOUBLE_CHANCE") {
    if (selection === "1X") return "home_or_draw";
    if (selection === "X2") return "away_or_draw";
    if (selection === "12") return "no_draw";
    return null;
  }
  if (market === "HANDICAP") {
    // New format: `HOME_-1.5` / `AWAY_+2.5` — team-side is captured. Two
    // handicap picks on the same match cluster together only when they
    // back the SAME team (a "home wins big" reader and an "away covers +2"
    // reader are backing opposite sides of the match, not the same
    // direction). Legacy no-side format (bare "-1.5") is treated as
    // uninferable and returned null so the strict path handles those.
    const withSide = selection.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
    if (!withSide) return null;
    const side = withSide[1].toLowerCase();
    const n = Number.parseFloat(withSide[2]);
    if (!Number.isFinite(n)) return null;
    // A big favorite handicap (|n| ≥ 3) reads as "blowout / lots of goals";
    // small handicap = "narrow win"; positive = "underdog covers".
    if (n <= -3) return `${side}_wins_big`;
    if (n < 0) return `${side}_wins_narrow`;
    return `${side}_covers_underdog`;
  }
  return null;
}

/**
 * Extracts the "fixture" portion of a fingerprint — everything before the
 * trailing `|MARKET|SELECTION` — so two picks on the same match cluster
 * together for the directional consensus, regardless of their line.
 */
export function fixturePrefixOf(fingerprint: string): string {
  const parts = fingerprint.split("|");
  if (parts.length < 3) return fingerprint;
  return parts.slice(0, parts.length - 2).join("|");
}

/**
 * Two team slugs are treated as the same team when one is a substring of
 * the other, provided both are ≥5 characters. Catches the routine tipster
 * variance — "Johor Darul Takzim" / "Darul Takzim" / "Takzim" all boil
 * down to slugs where the shortest is contained in the longest, so the
 * substring rule folds them together. Under 5 chars we require an exact
 * match — "star" would substring into "starcity" and any team whose name
 * happens to contain those letters otherwise, which is too permissive.
 */
export function teamSlugsMatchFuzzy(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return a.includes(b) || b.includes(a);
}

/**
 * Two sides match either by the normal substring rule above, or — when one
 * name is a short (3-4 char) fragment that rule flatly rejects — when that
 * fragment equals one whole word of the other name. Confirmed real case
 * (2026-08-31): a live basketball scoreboard screenshot OCR'd "Binan Tatak
 * Gel GameX" down to bare "Gel" in one channel while another channel read
 * the full name; "gel" is 3 characters so `teamSlugsMatchFuzzy` rejected it
 * outright even though it's plainly one word of the full name, and the
 * whole fixture failed to fuzzy-match across the two channels as a result.
 * Deliberately narrower than lowering the substring rule's length floor
 * outright: matching a *whole word* (not just any short substring) keeps
 * "star" from spuriously matching "Starcity" or similar unrelated names —
 * the risk the 5-char floor exists to prevent in the first place.
 */
function sideMatchesFuzzy(slugA: string, wordsA: string[], slugB: string, wordsB: string[]): boolean {
  if (teamSlugsMatchFuzzy(slugA, slugB)) return true;
  if (slugA.length >= 3 && slugA.length < 5 && wordsB.includes(slugA)) return true;
  if (slugB.length >= 3 && slugB.length < 5 && wordsA.includes(slugB)) return true;
  // Near-match rescue for transliterated spellings: phonetic Cyrillic→Latin
  // lands one or two characters off the English spelling ("nort(h)erners",
  // "sikkimpolis" vs "sikkimpolice"). Allow an edit-distance gap that scales
  // with length — 1 per 6 chars, capped at 2 — and only once both slugs are
  // ≥6 chars, where a 1-2 char slip is a spelling variant rather than a
  // different team. Short slugs keep the strict exact/substring rules above.
  const shorter = Math.min(slugA.length, slugB.length);
  if (shorter >= 6) {
    const budget = Math.min(2, Math.floor(Math.max(slugA.length, slugB.length) / 6));
    if (budget >= 1 && editDistance(slugA, slugB) <= budget) return true;
  }
  return false;
}

/**
 * Two fixtures are the same match when both team-slug pairs fuzzy-match,
 * order-independent — a chat that flips home/away shouldn't fracture the
 * consensus bucket.
 */
export function fuzzyFixtureMatch(a: Fixture, b: Fixture): boolean {
  const aHomeWords = slugTeamWords(a.homeTeam);
  const aAwayWords = slugTeamWords(a.awayTeam);
  const bHomeWords = slugTeamWords(b.homeTeam);
  const bAwayWords = slugTeamWords(b.awayTeam);
  const aHome = aHomeWords.join("");
  const aAway = aAwayWords.join("");
  const bHome = bHomeWords.join("");
  const bAway = bAwayWords.join("");

  const straight = sideMatchesFuzzy(aHome, aHomeWords, bHome, bHomeWords) && sideMatchesFuzzy(aAway, aAwayWords, bAway, bAwayWords);
  if (straight) return true;
  const swapped = sideMatchesFuzzy(aHome, aHomeWords, bAway, bAwayWords) && sideMatchesFuzzy(aAway, aAwayWords, bHome, bHomeWords);
  return swapped;
}

/** Convenience for the common case: fixture and pick both in one message. */
export function parseTipMessage(rawText: string): ParsedTip | null {
  const fixture = extractFixture(rawText);
  if (!fixture) return null;
  const marketSelection = extractSelection(rawText, fixture);
  if (!marketSelection) return null;
  return buildParsedTip(fixture, marketSelection);
}
