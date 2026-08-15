/**
 * Thin client for API-Football / API-Sports (direct subscription, not
 * RapidAPI) — https://v3.football.api-sports.io, auth via the
 * `x-apisports-key` header. Every shape here was verified against real
 * responses during setup, not assumed from documentation alone.
 *
 * Free plan: 100 requests/day (resets 00:00 UTC, unused requests are lost),
 * 10 requests/minute. Every function here is a single real HTTP call —
 * callers (the sync job) are responsible for staying inside that budget by
 * calling sparingly, not this module.
 */

const BASE_URL = "https://v3.football.api-sports.io";

/**
 * Curated set of well-known, high-coverage competitions. Verified against
 * the real API during setup (id -> name/country all confirmed). Keeps the
 * daily request budget predictable: fixtures/live cost one call each
 * regardless of league count, but odds are fetched per fixture, so a small
 * curated set of leagues keeps that bounded.
 */
export const LEAGUE_ALLOWLIST = [
  { id: 39, name: "Premier League", country: "England" },
  { id: 140, name: "La Liga", country: "Spain" },
  { id: 61, name: "Ligue 1", country: "France" },
  { id: 78, name: "Bundesliga", country: "Germany" },
  { id: 135, name: "Serie A", country: "Italy" },
  { id: 2, name: "UEFA Champions League", country: "World" },
] as const;

export class ApiFootballError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

interface ApiFootballEnvelope<T> {
  errors: unknown;
  results: number;
  response: T;
}

async function request<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new ApiFootballError("API_FOOTBALL_KEY is not set.");

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) {
    throw new ApiFootballError(`API-Football request failed: ${res.status} ${res.statusText}`, res.status);
  }

  const body = (await res.json()) as ApiFootballEnvelope<T>;
  const errors = body.errors;
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : Boolean(errors && Object.keys(errors).length > 0);
  if (hasErrors) {
    throw new ApiFootballError(`API-Football returned an error: ${JSON.stringify(body.errors)}`);
  }
  return body.response;
}

export interface ApiFootballStatus {
  account: { firstname: string; lastname: string; email: string };
  subscription: { plan: string; end: string; active: boolean };
  requests: { current: number; limit_day: number };
}

export function getAccountStatus(): Promise<ApiFootballStatus> {
  return request<ApiFootballStatus>("/status", {});
}

export interface ApiFootballFixture {
  fixture: {
    id: number;
    date: string; // ISO 8601, real kickoff time
    timestamp: number;
    status: { long: string; short: string; elapsed: number | null };
  };
  league: { id: number; name: string; country: string; season: number; round: string };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}

/**
 * Fixture statuses API-Football itself considers "in play" — this is the
 * only thing allowed to drive a "Live" label anywhere in the UI. NS (not
 * started), FT/AET/PEN (finished), and PST/CANC/ABD/AWD/WO (not running)
 * are deliberately excluded.
 */
export const LIVE_STATUS_CODES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"]);

export function isLiveStatus(statusShort: string): boolean {
  return LIVE_STATUS_CODES.has(statusShort);
}

/** All fixtures for a given date (YYYY-MM-DD), across every league — one call regardless of volume. */
export function getFixturesByDate(date: string): Promise<ApiFootballFixture[]> {
  return request<ApiFootballFixture[]>("/fixtures", { date });
}

/** Every fixture API-Football currently considers live, across all leagues — one call. */
export function getLiveFixtures(): Promise<ApiFootballFixture[]> {
  return request<ApiFootballFixture[]>("/fixtures", { live: "all" });
}

export interface ApiFootballOdds {
  fixture: { id: number };
  update: string; // ISO 8601 — when this bookmaker last updated these odds, per the API itself
  bookmakers: {
    id: number;
    name: string;
    bets: { id: number; name: string; values: { value: string; odd: string }[] }[];
  }[];
}

/** Pre-match bookmaker odds for one fixture. Costs one call per fixture — call sparingly. */
export async function getOddsForFixture(fixtureId: number): Promise<ApiFootballOdds | null> {
  const response = await request<ApiFootballOdds[]>("/odds", { fixture: fixtureId });
  return response[0] ?? null;
}
