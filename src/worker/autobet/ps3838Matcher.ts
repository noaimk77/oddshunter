import { slugTeam, parseOverUnderLine, type Fixture } from "../telegram/tipParser";
import { getFixtures, getLine, type Ps3838BetType, type Ps3838Team, type Ps3838Side, type Ps3838League2, type Ps3838Event } from "./ps3838Client";

/**
 * Which PS3838 sportId to search. Same numbering as the existing Pinnacle
 * guest feed (PS3838 is a Pinnacle-network white label — see pinnacle.ts,
 * sportId 29 = soccer, 4 = basketball) — DOUBLE_CHANCE/BTTS have no PS3838
 * straight-bet equivalent (their v4 place-bet only supports SPREAD /
 * MONEYLINE / TOTAL_POINTS / TEAM_TOTAL_POINTS) so those markets are simply
 * unsupported here, not guessed at.
 */
const SPORT_ID_FOOTBALL = 29;

const CACHE_TTL_MS = 60_000;
let fixturesCache: { at: number; leagues: Ps3838League2[] } | null = null;

async function footballFixtures(): Promise<Ps3838League2[]> {
  if (fixturesCache && Date.now() - fixturesCache.at < CACHE_TTL_MS) return fixturesCache.leagues;
  const leagues = await getFixtures(SPORT_ID_FOOTBALL);
  fixturesCache = { at: Date.now(), leagues };
  return leagues;
}

/** Same lightweight name-overlap heuristic as tipParser's team matching —
 *  duplicated narrowly (not imported) because PS3838's own naming
 *  convention ("Manchester United" vs a tipster's "Man Utd") needs the same
 *  forgiving match, but this file has no reason to depend on tipParser's
 *  internal fuzzy-match implementation details. */
function namesOverlap(a: string, b: string): boolean {
  const sa = slugTeam(a);
  const sb = slugTeam(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  return sa.length >= 4 && sb.length >= 4 && (sa.includes(sb) || sb.includes(sa));
}

export interface Ps3838MatchedFixture {
  leagueId: number;
  eventId: number;
  team1IsHome: boolean; // PS3838's Team1/Team2 order, vs our home/away
}

/** Finds the PS3838 event for a fixture by team-name overlap across every
 *  football league currently offered. No search-by-name endpoint exists —
 *  the full /v3/fixtures list is pulled (cached 60s) and scanned, same
 *  approach as fixtureResolver.ts / pinnacle.ts already use against other
 *  providers. Declines (returns null) on ambiguity rather than guessing. */
export async function matchPs3838Fixture(fixture: Fixture): Promise<Ps3838MatchedFixture | null> {
  const leagues = await footballFixtures();
  let best: { leagueId: number; ev: Ps3838Event; team1IsHome: boolean } | null = null;
  let ambiguous = false;

  for (const league of leagues) {
    for (const ev of league.events ?? []) {
      const straight = namesOverlap(fixture.homeTeam, ev.home) && namesOverlap(fixture.awayTeam, ev.away);
      const swapped = namesOverlap(fixture.homeTeam, ev.away) && namesOverlap(fixture.awayTeam, ev.home);
      if (!straight && !swapped) continue;
      if (best) {
        ambiguous = true;
        continue;
      }
      best = { leagueId: league.id, ev, team1IsHome: straight };
    }
  }

  if (!best || ambiguous) return null;
  return { leagueId: best.leagueId, eventId: best.ev.id, team1IsHome: best.team1IsHome };
}

export interface Ps3838BetSpec {
  betType: Ps3838BetType;
  periodNumber: number;
  team?: Ps3838Team;
  side?: Ps3838Side;
  handicap?: number;
}

/** Translates our own ParsedTip market/selection vocabulary into a PS3838
 *  bet spec. Returns null for markets PS3838 straight bets don't support
 *  (DOUBLE_CHANCE, BTTS) — the caller logs this as a clean "unsupported"
 *  rejection rather than attempting a guess. */
export function toPs3838BetSpec(market: string, selection: string, team1IsHome: boolean): Ps3838BetSpec | null {
  const flip = <T,>(home: T, away: T): T => (team1IsHome ? home : away);

  if (market === "1X2") {
    if (selection === "DRAW") return { betType: "MONEYLINE", periodNumber: 0, team: "Draw" };
    // selection is a team slug (home or away side, order-independent) —
    // figure out which side it names by re-slugging isn't possible here
    // (we don't have the raw team names, only the slug); callers must pass
    // the resolved home/away slug comparison in — see router.ts.
    return null;
  }

  if (market === "HANDICAP") {
    const m = /^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/.exec(selection);
    if (!m) return null;
    const side = m[1] as "HOME" | "AWAY";
    const handicap = Number.parseFloat(m[2]);
    return {
      betType: "SPREAD",
      periodNumber: 0,
      team: side === "HOME" ? flip<Ps3838Team>("Team1", "Team2") : flip<Ps3838Team>("Team2", "Team1"),
      handicap,
    };
  }

  if (market === "OVER_UNDER" || market === "OVER_UNDER_HT") {
    const line = parseOverUnderLine(selection);
    if (line == null) return null;
    const side: Ps3838Side = selection.startsWith("OVER") ? "OVER" : "UNDER";
    return {
      betType: "TOTAL_POINTS",
      periodNumber: market === "OVER_UNDER_HT" ? 1 : 0,
      side,
      handicap: line,
    };
  }

  // DOUBLE_CHANCE, BTTS: no PS3838 straight-bet equivalent.
  return null;
}

/** Full resolve: fixture on PS3838 + a live, bettable lineId for the exact
 *  selection. Returns null (with a reason) at any step that can't be
 *  resolved — the router logs the reason and records a REJECTED ticket. */
export async function resolvePs3838Bet(
  fixture: Fixture,
  market: string,
  selection: string,
): Promise<{ ok: true; leagueId: number; eventId: number; spec: Ps3838BetSpec; lineId: number; price: number } | { ok: false; reason: string }> {
  const matched = await matchPs3838Fixture(fixture);
  if (!matched) return { ok: false, reason: "fixture not found or ambiguous on PS3838" };

  let spec: Ps3838BetSpec | null;
  if (market === "1X2") {
    const homeSlug = slugTeam(fixture.homeTeam);
    const isHomeSelection = selection === homeSlug;
    const isAwaySelection = selection === slugTeam(fixture.awayTeam);
    if (!isHomeSelection && !isAwaySelection) {
      spec = selection === "DRAW" ? { betType: "MONEYLINE", periodNumber: 0, team: "Draw" } : null;
    } else {
      const wantsTeam1 = isHomeSelection ? matched.team1IsHome : !matched.team1IsHome;
      spec = { betType: "MONEYLINE", periodNumber: 0, team: wantsTeam1 ? "Team1" : "Team2" };
    }
  } else {
    spec = toPs3838BetSpec(market, selection, matched.team1IsHome);
  }
  if (!spec) return { ok: false, reason: `market ${market}/${selection} has no PS3838 straight-bet equivalent` };

  try {
    const line = await getLine({
      sportId: SPORT_ID_FOOTBALL,
      leagueId: matched.leagueId,
      eventId: matched.eventId,
      periodNumber: spec.periodNumber,
      betType: spec.betType,
      handicap: spec.handicap,
      team: spec.team,
      side: spec.side,
    });
    return { ok: true, leagueId: matched.leagueId, eventId: matched.eventId, spec, lineId: line.lineId, price: line.price };
  } catch (err) {
    return { ok: false, reason: `PS3838 line lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
