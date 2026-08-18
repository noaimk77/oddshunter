import type { LiveStateProvider, MarketDataProvider, NormalizedLiveState, NormalizedOddsPoint } from "./types";
import { ProviderNotConfiguredError } from "./types";
import { getIngestTargetCountries } from "../config";

/**
 * API-Football (api-sports.io) — two roles here:
 *
 * 1. `createApiFootballProvider()` — live match state (score/minute/events)
 *    for the Live detector family (GAME_STATE_FILTER, UNEXPLAINED_LIVE_MOVE).
 *
 * 2. `createApiFootballOddsProvider()` — pre-match odds, promoted to the
 *    PRIMARY V1 odds source after a scope change (2026-08-18): Noaim wants
 *    obscure/low-scrutiny leagues (India top-to-3rd tier, smaller Latin
 *    American leagues), not the major commercial leagues aggregators like
 *    TheOddsAPI/The Odds API cover — a heavily-watched league like the EPL
 *    is the least likely place for an undetected suspicious move. The
 *    original spec's caution about API-Football's update frequency being
 *    "too coarse" was specifically about FAST pre-match drops on liquid
 *    major-league markets; it matters less for low-liquidity leagues that
 *    don't move fast in the first place.
 *
 * Free tier: 100 requests/day, 10/minute — target leagues are resolved by
 * country (GET_TARGET_COUNTRIES, see config.ts) via `/leagues?country=`,
 * cached in-process so that lookup only costs quota once per country per
 * run, not every ingest cycle. `API_FOOTBALL_KEY` is a placeholder as of
 * 2026-08-18, so both providers throw instead of fabricating data.
 */

const API_HOST = "https://v3.football.api-sports.io";
const FREE_TIER_DAILY_LIMIT = 100;

function authHeaders(): Record<string, string> {
  return { "x-apisports-key": process.env.API_FOOTBALL_KEY! };
}

export function createApiFootballProvider(): LiveStateProvider {
  const isConfigured = () => Boolean(process.env.API_FOOTBALL_KEY);

  return {
    name: "api-football",
    isConfigured,
    async fetchLiveState(_externalEventId: string): Promise<NormalizedLiveState | null> {
      if (!isConfigured()) throw new ProviderNotConfiguredError("API-Football");
      throw new Error("API-Football live-state adapter not implemented yet — isConfigured() passed, wire the real API call here.");
    },
  };
}

interface ApiFootballLeague {
  league: { id: number; name: string; type: string };
  country: { name: string };
  seasons: { year: number; current: boolean }[];
}

interface ApiFootballOddsValue {
  value: string;
  odd: string;
}
interface ApiFootballBet {
  name: string;
  values: ApiFootballOddsValue[];
}
interface ApiFootballBookmaker {
  id: number;
  name: string;
  bets: ApiFootballBet[];
}
interface ApiFootballFixtureInfo {
  id: number;
  date: string;
}
interface ApiFootballOddsRow {
  fixture: ApiFootballFixtureInfo;
  league: { id: number; name: string; country: string };
  bookmakers: ApiFootballBookmaker[];
  update: string;
}
interface ApiFootballFixtureRow {
  fixture: { id: number; date: string };
  teams: { home: { name: string }; away: { name: string } };
}

/** Module-level: resolved once per process, not persisted (a worker
 * restart just re-resolves — an accepted V1 simplification, cheap since
 * it's one request per target country, not per poll). */
let resolvedLeaguesCache: { id: number; name: string; country: string; season: number }[] | null = null;

/** Module-level daily request counter — resets on UTC day change. A worker
 * restart resets it early too; acceptable for V1, tighten with a DB-backed
 * counter (Provider.requestsToday already exists for this) if it proves
 * to matter in practice. */
let requestsToday = 0;
let requestsDate = "";

function checkAndConsumeBudget(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== requestsDate) {
    requestsDate = today;
    requestsToday = 0;
  }
  if (requestsToday >= FREE_TIER_DAILY_LIMIT) return false;
  requestsToday += 1;
  return true;
}

async function resolveTargetLeagues(): Promise<{ id: number; name: string; country: string; season: number }[]> {
  if (resolvedLeaguesCache) return resolvedLeaguesCache;

  const leagues: { id: number; name: string; country: string; season: number }[] = [];
  for (const country of getIngestTargetCountries()) {
    if (!checkAndConsumeBudget()) {
      console.warn(`[api-football] daily quota exhausted while resolving leagues — stopped at "${country}".`);
      break;
    }
    const url = new URL(`${API_HOST}/leagues`);
    url.searchParams.set("country", country);
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      console.error(`[api-football] failed to list leagues for ${country}: ${res.status} ${res.statusText}`);
      continue;
    }
    const body = (await res.json()) as { response: ApiFootballLeague[] };
    for (const entry of body.response ?? []) {
      const currentSeason = entry.seasons.find((s) => s.current);
      if (!currentSeason) continue; // no active season — nothing to fetch odds for
      leagues.push({ id: entry.league.id, name: entry.league.name, country: entry.country.name, season: currentSeason.year });
    }
  }

  resolvedLeaguesCache = leagues;
  return leagues;
}

function selectionPosition(betName: string, value: string): string {
  const v = value.toLowerCase();
  if (v === "home" || v === "1") return "home";
  if (v === "away" || v === "2") return "away";
  if (v === "draw" || v === "x") return "draw";
  return value; // totals/handicaps carry their own value label (e.g. "Over 2.5")
}

export function createApiFootballOddsProvider(): MarketDataProvider {
  const isConfigured = () => Boolean(process.env.API_FOOTBALL_KEY);

  async function fetchUpcomingFixtures(league: { id: number; season: number }): Promise<Map<number, { homeTeam: string; awayTeam: string }>> {
    const map = new Map<number, { homeTeam: string; awayTeam: string }>();
    if (!checkAndConsumeBudget()) return map;

    const url = new URL(`${API_HOST}/fixtures`);
    url.searchParams.set("league", String(league.id));
    url.searchParams.set("season", String(league.season));
    url.searchParams.set("next", "20"); // team names only needed for fixtures odds will actually cover

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      console.error(`[api-football] failed to fetch fixtures for league ${league.id}: ${res.status} ${res.statusText}`);
      return map;
    }
    const body = (await res.json()) as { response: ApiFootballFixtureRow[] };
    for (const row of body.response ?? []) {
      map.set(row.fixture.id, { homeTeam: row.teams.home.name, awayTeam: row.teams.away.name });
    }
    return map;
  }

  async function fetchLeagueOdds(league: { id: number; name: string; country: string; season: number }): Promise<NormalizedOddsPoint[]> {
    const fixtureNames = await fetchUpcomingFixtures(league);

    if (!checkAndConsumeBudget()) {
      console.warn(`[api-football] daily quota exhausted — skipping odds for ${league.name} (${league.country}).`);
      return [];
    }

    const url = new URL(`${API_HOST}/odds`);
    url.searchParams.set("league", String(league.id));
    url.searchParams.set("season", String(league.season));

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`API-Football odds request failed for league ${league.id}: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { response: ApiFootballOddsRow[] };

    const points: NormalizedOddsPoint[] = [];
    for (const row of body.response ?? []) {
      const names = fixtureNames.get(row.fixture.id);
      for (const bookmaker of row.bookmakers) {
        const matchWinner = bookmaker.bets.find((b) => b.name === "Match Winner");
        if (!matchWinner) continue;
        for (const value of matchWinner.values) {
          points.push({
            providerName: "api-football",
            externalCompetitionId: String(row.league.id),
            externalEventId: String(row.fixture.id),
            externalMarketId: `${row.fixture.id}:match_winner:${bookmaker.id}`,
            externalSelectionId: `${row.fixture.id}:match_winner:${bookmaker.id}:${value.value}`,
            sport: "football",
            country: row.league.country,
            competitionName: row.league.name,
            // Odds payload alone doesn't carry team names — joined from a
            // separate /fixtures call above. Falls back to a placeholder
            // rather than an empty string if the fixture fell outside the
            // `next=20` window (kept, not dropped: the odds are still real).
            homeTeam: names?.homeTeam ?? `Fixture #${row.fixture.id} (home)`,
            awayTeam: names?.awayTeam ?? `Fixture #${row.fixture.id} (away)`,
            kickoff: new Date(row.fixture.date),
            marketType: "match_winner",
            marketName: "1X2",
            marketStatus: "open",
            selectionName: value.value,
            selectionPosition: selectionPosition(matchWinner.name, value.value),
            price: Number.parseFloat(value.odd),
            timestamp: new Date(row.update),
          });
        }
      }
    }
    return points;
  }

  return {
    name: "api-football",
    isConfigured,
    async fetchPreMatchOdds(sport: string): Promise<NormalizedOddsPoint[]> {
      if (!isConfigured()) throw new ProviderNotConfiguredError("API-Football");
      if (sport !== "football") return [];

      const leagues = await resolveTargetLeagues();
      const results: NormalizedOddsPoint[] = [];
      for (const league of leagues) {
        try {
          results.push(...(await fetchLeagueOdds(league)));
        } catch (err) {
          console.error(`[api-football] failed to fetch odds for ${league.name} (${league.country})`, err);
        }
      }
      return results;
    },
  };
}
