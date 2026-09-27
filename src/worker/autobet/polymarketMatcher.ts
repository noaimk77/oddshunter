import { slugTeam, type Fixture } from "../telegram/tipParser";
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
 *  structured home/away fields like PS3838's fixtures. We just require
 *  both team names to appear (in either order) somewhere in the question. */
function questionMatchesFixture(question: string, fixture: Fixture): boolean {
  const home = slugTeam(fixture.homeTeam);
  const away = slugTeam(fixture.awayTeam);
  if (!home || !away) return false;
  const q = question.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const homeHit = q.includes(home) || home.length >= 4 && q.split(/(?=[a-z])/).some((w) => namesOverlap(w, fixture.homeTeam));
  // Simpler, more reliable check: substring containment on the slug form.
  const contains = (slug: string) => q.includes(slug);
  return contains(home) && contains(away);
}

/** Picks the outcome token for `selectionTeamSlug` (a team slug, as our
 *  1X2 picks carry) among a market's outcomes, by fuzzy name match against
 *  the outcome's own label ("Team A", "Team B", or occasionally the full
 *  team name). Returns null when no single outcome matches confidently. */
function pickOutcome(outcomes: PolymarketOutcome[], selectionTeamSlug: string, fixture: Fixture): PolymarketOutcome | null {
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

/** Resolves a 1X2 esports pick to a Polymarket market + outcome token.
 *  Only handles moneyline-shaped picks (market "1X2", selection = a team
 *  slug) — Polymarket's esports markets are essentially all moneyline
 *  (map/series winner), so other markets (OVER_UNDER, HANDICAP, …) simply
 *  aren't attempted here; the caller treats an unsupported market the same
 *  as "not found". Declines on ambiguity (>1 candidate market) rather than
 *  guessing which of several markets for the same two teams (e.g. "Map 1"
 *  vs "Map 2" vs "Series winner") is the one that was actually tipped. */
export async function resolvePolymarketBet(
  fixture: Fixture,
  market: string,
  selection: string,
): Promise<{ ok: true; match: PolymarketMatch } | { ok: false; reason: string }> {
  if (market !== "1X2") {
    return { ok: false, reason: `market ${market} has no Polymarket moneyline equivalent (esports markets there are moneyline-only)` };
  }

  // Search on the shorter/more distinctive team name — Gamma's `search`
  // param is a keyword match on the question text, so one solid team name
  // is enough to surface the market without over-constraining the query.
  const query = fixture.homeTeam.length <= fixture.awayTeam.length ? fixture.homeTeam : fixture.awayTeam;
  let markets: PolymarketMarket[];
  try {
    markets = await searchEsportsMarkets(query);
  } catch (err) {
    return { ok: false, reason: `Polymarket search failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Only a plain two-way moneyline is a match for a "1X2" pick: exactly 2
  // outcomes, each one clearly ONE of the two teams, from a question that
  // isn't a handicap/rounds/totals market. Outcome NAMES alone can't tell
  // moneyline and handicap apart — Polymarket labels a handicap outcome
  // "LOUD" too, the line only appears in the question text ("Map Handicap:
  // LOUD (-1.5) vs …") — so the exclusion has to read the question.
  const NON_MONEYLINE_RE = /\b(?:handicap|rounds?|total|o\/u|over|under|spread)\b/i;
  const isMoneyline = (m: PolymarketMarket) => {
    if (m.outcomes.length !== 2) return false;
    if (NON_MONEYLINE_RE.test(m.question)) return false;
    const slugs = new Set(m.outcomes.map((o) => slugTeam(o.name)));
    return slugs.has(slugTeam(fixture.homeTeam)) && slugs.has(slugTeam(fixture.awayTeam));
  };

  let candidates = markets.filter((m) => questionMatchesFixture(m.question, fixture) && isMoneyline(m));
  if (candidates.length === 0) return { ok: false, reason: "no matching Polymarket moneyline market for this fixture" };

  if (candidates.length > 1) {
    // A BO3/BO5 series is usually split into one market per individual
    // map/game plus a separate overall series-winner market (question has
    // no "Map N"/"Game N" qualifier) — a tipster's plain "1X2" pick means
    // the series/match, not one specific map, so prefer that market when
    // it's present rather than declining outright.
    const PER_MAP_RE = /\b(?:map|game)\s*\d+\b/i;
    const overall = candidates.filter((m) => !PER_MAP_RE.test(m.question));
    if (overall.length === 1) candidates = overall;
  }
  if (candidates.length > 1) return { ok: false, reason: `ambiguous — ${candidates.length} Polymarket markets match this fixture` };

  const chosen = candidates[0];
  const outcome = pickOutcome(chosen.outcomes, selection, fixture);
  if (!outcome) return { ok: false, reason: "fixture matched but no outcome token corresponds to the tipped side" };
  if (!outcome.tokenId) return { ok: false, reason: "matched outcome has no CLOB token id (market may be malformed)" };

  return { ok: true, match: { market: chosen, outcome } };
}
