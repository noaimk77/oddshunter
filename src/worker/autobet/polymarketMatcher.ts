import { slugTeam, parseOverUnderLine, type Fixture } from "../telegram/tipParser";
import { searchEsportsMarkets, type PolymarketMarket, type PolymarketOutcome } from "./polymarketClient";

/** Same forgiving name-overlap heuristic as ps3838Matcher.ts (duplicated
 *  narrowly on purpose — see that file's comment). */
function namesOverlap(a: string, b: string): boolean {
  const sa = slugTeam(a);
  const sb = slugTeam(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  return sa.length >= 4 && sb.length >= 4 && (sa.includes(sb) || sb.includes(sa));
}

/** Polymarket's `question` text is the closest thing to a fixture name
 *  ("Will Team A beat Team B?", "Team A vs. Team B – Map 1 Winner") — no
 *  structured home/away fields like PS3838's fixtures. A sub-market
 *  question often doesn't restate either team's name at all ("Games Total:
 *  O/U 2.5" — verified real example, 2026-09-27) — only the parent EVENT's
 *  title does ("Valorant: Team Vitality vs LOUD") — so both are checked. */
function questionMatchesFixture(market: PolymarketMarket, fixture: Fixture): boolean {
  const home = slugTeam(fixture.homeTeam);
  const away = slugTeam(fixture.awayTeam);
  if (!home || !away) return false;
  const text = `${market.question} ${market.eventTitle}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return text.includes(home) && text.includes(away);
}

/** A BO3/BO5 series is usually split into one market per individual
 *  map/game plus a separate overall series market (question has no
 *  "Map N"/"Game N" qualifier). Every market type below wants the overall
 *  one by default — none of our tipster markets carry a map number today
 *  (tipParser doesn't extract one), so there's nothing to disambiguate a
 *  per-map market against; preferring "overall" when present is the safe
 *  default rather than guessing which map. */
const PER_MAP_RE = /\b(?:map|game)\s*\d+\b/i;
function preferOverall(candidates: PolymarketMarket[]): PolymarketMarket[] {
  if (candidates.length <= 1) return candidates;
  const overall = candidates.filter((m) => !PER_MAP_RE.test(m.question));
  return overall.length === 1 ? overall : candidates;
}

/** Picks the outcome token for `selectionTeamSlug` (a team slug, as our
 *  1X2/HANDICAP picks carry) among a market's outcomes, by fuzzy name match
 *  against the outcome's own label. null when no outcome matches confidently. */
function pickTeamOutcome(outcomes: PolymarketOutcome[], selectionTeamSlug: string, fixture: Fixture): PolymarketOutcome | null {
  const wantHome = selectionTeamSlug === slugTeam(fixture.homeTeam);
  const wantAway = selectionTeamSlug === slugTeam(fixture.awayTeam);
  for (const o of outcomes) {
    const slug = slugTeam(o.name);
    if (slug === selectionTeamSlug) return o;
    if (wantHome && namesOverlap(o.name, fixture.homeTeam)) return o;
    if (wantAway && namesOverlap(o.name, fixture.awayTeam)) return o;
  }
  return null;
}

export interface PolymarketMatch {
  market: PolymarketMarket;
  outcome: PolymarketOutcome;
}

type MatchResult = { ok: true; match: PolymarketMatch } | { ok: false; reason: string };

/** market with a "Handicap" in its question is the line-based one — but
 *  NOT its "Rounds Handicap" cousin (a different underlying stat, rounds
 *  won rather than maps/series), which our tipParser HANDICAP pick was
 *  never describing. */
const HANDICAP_QUESTION_RE = /\bhandicap\b/i;
const ROUNDS_HANDICAP_RE = /\brounds?\s+handicap\b/i;

/** "TeamName (-1.5) vs OtherTeam (+1.5)" — captures both sides' names and
 *  signed lines. Declines (returns no captures) rather than guessing on any
 *  format it doesn't recognize. */
const HANDICAP_LINE_RE = /([\w .'-]+?)\s*\(([+-]\d+(?:\.\d+)?)\)\s*vs\.?\s*([\w .'-]+?)\s*\(([+-]\d+(?:\.\d+)?)\)/i;

export function resolveHandicap(fixture: Fixture, selection: string, markets: PolymarketMarket[]): MatchResult {
  const m = /^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/.exec(selection);
  if (!m) return { ok: false, reason: `handicap selection "${selection}" not in the expected HOME_/AWAY_<line> shape` };
  const side = m[1] as "HOME" | "AWAY";
  const wantedLine = Number.parseFloat(m[2]);
  const wantedSlug = side === "HOME" ? slugTeam(fixture.homeTeam) : slugTeam(fixture.awayTeam);

  let candidates = markets.filter(
    (mk) => questionMatchesFixture(mk, fixture) && HANDICAP_QUESTION_RE.test(mk.question) && !ROUNDS_HANDICAP_RE.test(mk.question) && mk.outcomes.length === 2,
  );
  candidates = preferOverall(candidates);

  for (const candidate of candidates) {
    const lineMatch = HANDICAP_LINE_RE.exec(candidate.question);
    if (!lineMatch) continue;
    const [, nameA, valA, nameB, valB] = lineMatch;
    const sides: { name: string; value: number }[] = [
      { name: nameA, value: Number.parseFloat(valA) },
      { name: nameB, value: Number.parseFloat(valB) },
    ];
    const wantedSide = sides.find((s) => namesOverlap(s.name, side === "HOME" ? fixture.homeTeam : fixture.awayTeam));
    // Exact line match only — a wrong-but-close line is a different bet
    // with different economics, not "close enough".
    if (!wantedSide || wantedSide.value !== wantedLine) continue;

    const outcome = pickTeamOutcome(candidate.outcomes, wantedSlug, fixture);
    if (!outcome?.tokenId) continue;
    return { ok: true, match: { market: candidate, outcome } };
  }
  return { ok: false, reason: `no Polymarket handicap market found with line ${wantedLine > 0 ? "+" : ""}${wantedLine} on the tipped side` };
}

const TOTALS_QUESTION_RE = /\b(?:total|o\/u)\b/i;
const TOTAL_LINE_RE = /(\d+(?:\.\d+)?)/;

export function resolveOverUnder(fixture: Fixture, market: string, selection: string, markets: PolymarketMarket[]): MatchResult {
  if (market === "OVER_UNDER_HT") {
    return { ok: false, reason: "OVER_UNDER_HT has no confirmed Polymarket esports equivalent yet (not built — no verified real example)" };
  }
  const wantedLine = parseOverUnderLine(selection);
  if (wantedLine == null) return { ok: false, reason: `could not parse a numeric line out of "${selection}"` };
  const isOver = selection.startsWith("OVER");

  let candidates = markets.filter(
    (mk) => questionMatchesFixture(mk, fixture) && TOTALS_QUESTION_RE.test(mk.question) && !PER_MAP_RE.test(mk.question) && mk.outcomes.length === 2 && mk.outcomes.some((o) => /^over$/i.test(o.name)) && mk.outcomes.some((o) => /^under$/i.test(o.name)),
  );

  for (const candidate of candidates) {
    const lineMatch = TOTAL_LINE_RE.exec(candidate.question);
    if (!lineMatch) continue;
    // Exact line match only, same reasoning as handicap.
    if (Number.parseFloat(lineMatch[1]) !== wantedLine) continue;
    const outcome = candidate.outcomes.find((o) => (isOver ? /^over$/i : /^under$/i).test(o.name));
    if (!outcome?.tokenId) continue;
    return { ok: true, match: { market: candidate, outcome } };
  }
  return { ok: false, reason: `no Polymarket totals market found with line ${wantedLine} for this fixture` };
}

function resolveMoneyline(fixture: Fixture, selection: string, markets: PolymarketMarket[]): MatchResult {
  // Only a plain two-way moneyline is a match: exactly 2 outcomes, each
  // clearly ONE of the two teams, from a question that isn't a
  // handicap/rounds/totals market. Outcome NAMES alone can't tell moneyline
  // and handicap apart — Polymarket labels a handicap outcome "LOUD" too,
  // the line only appears in the question text — so the exclusion has to
  // read the question.
  const NON_MONEYLINE_RE = /\b(?:handicap|rounds?|total|o\/u|over|under|spread)\b/i;
  const isMoneyline = (m: PolymarketMarket) => {
    if (m.outcomes.length !== 2) return false;
    if (NON_MONEYLINE_RE.test(m.question)) return false;
    const slugs = new Set(m.outcomes.map((o) => slugTeam(o.name)));
    return slugs.has(slugTeam(fixture.homeTeam)) && slugs.has(slugTeam(fixture.awayTeam));
  };

  let candidates = markets.filter((m) => questionMatchesFixture(m, fixture) && isMoneyline(m));
  if (candidates.length === 0) return { ok: false, reason: "no matching Polymarket moneyline market for this fixture" };
  candidates = preferOverall(candidates);
  if (candidates.length > 1) return { ok: false, reason: `ambiguous — ${candidates.length} Polymarket markets match this fixture` };

  const chosen = candidates[0];
  const outcome = pickTeamOutcome(chosen.outcomes, selection, fixture);
  if (!outcome) return { ok: false, reason: "fixture matched but no outcome token corresponds to the tipped side" };
  if (!outcome.tokenId) return { ok: false, reason: "matched outcome has no CLOB token id (market may be malformed)" };
  return { ok: true, match: { market: chosen, outcome } };
}

/** Resolves an esports pick to a Polymarket market + outcome token, for
 *  the market types our own tipParser vocabulary produces: 1X2
 *  (moneyline), HANDICAP, OVER_UNDER. BTTS/DOUBLE_CHANCE have no Polymarket
 *  esports equivalent and are rejected outright. Every branch declines
 *  (returns an explicit reason) rather than guessing on ambiguity — a wrong
 *  market/line here is real money on the wrong bet. */
export async function resolvePolymarketBet(fixture: Fixture, market: string, selection: string): Promise<MatchResult> {
  if (!["1X2", "HANDICAP", "OVER_UNDER", "OVER_UNDER_HT"].includes(market)) {
    return { ok: false, reason: `market ${market} has no Polymarket esports equivalent` };
  }

  // Search on the shorter/more distinctive team name — Gamma's full-text
  // search is a keyword match on the question text, so one solid team name
  // is enough to surface the market without over-constraining the query.
  const query = fixture.homeTeam.length <= fixture.awayTeam.length ? fixture.homeTeam : fixture.awayTeam;
  let markets: PolymarketMarket[];
  try {
    markets = await searchEsportsMarkets(query);
  } catch (err) {
    return { ok: false, reason: `Polymarket search failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (market === "1X2") return resolveMoneyline(fixture, selection, markets);
  if (market === "HANDICAP") return resolveHandicap(fixture, selection, markets);
  return resolveOverUnder(fixture, market, selection, markets);
}
