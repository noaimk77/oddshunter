/**
 * Thin client for API-Football / API-Sports (direct subscription, not
 * RapidAPI) — https://v3.football.api-sports.io, auth via the
 * `x-apisports-key` header. Every shape here was verified against real
 * responses during setup, not assumed from documentation alone.
 *
 * Free plan (verified empirically, not just from docs):
 * - 100 requests/day (resets 00:00 UTC, unused requests are lost), 10
 *   requests/minute — this module serializes every call at least
 *   MIN_INTERVAL_MS apart so a caller making several requests in a row can
 *   never trip the per-minute limit.
 * - `/fixtures?date=` only accepts a rolling 3-day window (yesterday, today,
 *   tomorrow) — confirmed by the API's own error message, not assumed.
 * - Any endpoint that takes a `season` parameter (league+season fixture
 *   queries, standings, `next=`) is restricted to seasons 2022-2024 —
 *   useless for the current season, so this client never uses `season`.
 * - There is no fixed league allowlist here on purpose: the free plan's
 *   `/fixtures?date=` and `/odds?date=` endpoints already return every
 *   competition with real coverage for that date (293 competitions, 1217+
 *   fixtures observed on a single day) — curating a short list of "big"
 *   leagues was the actual cause of near-empty results, not a real API
 *   limitation. Callers (the sync job) decide what to store; this module
 *   just exposes what the API actually returns.
 */

const BASE_URL = "https://v3.football.api-sports.io";

/** Minimum spacing between outgoing requests — keeps every caller under the 10/minute cap without needing to coordinate. */
const MIN_INTERVAL_MS = 6200;
let lastRequestAt = 0;

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
  paging?: { current: number; total: number };
  response: T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  path: string,
  params: Record<string, string | number>
): Promise<{ response: T; paging?: { current: number; total: number } }> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new ApiFootballError("API_FOOTBALL_KEY is not set.");

  const waitFor = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (waitFor > 0) await sleep(waitFor);
  lastRequestAt = Date.now();

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
  return { response: body.response, paging: body.paging };
}

export interface ApiFootballStatus {
  account: { firstname: string; lastname: string; email: string };
  subscription: { plan: string; end: string; active: boolean };
  requests: { current: number; limit_day: number };
}

export async function getAccountStatus(): Promise<ApiFootballStatus> {
  const { response } = await request<ApiFootballStatus>("/status", {});
  return response;
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

/**
 * All fixtures for a given date (YYYY-MM-DD), across every competition —
 * one call regardless of volume. The free plan only accepts dates within a
 * rolling 3-day window (yesterday/today/tomorrow); anything outside that
 * throws an ApiFootballError with the plan's own message.
 */
export async function getFixturesByDate(date: string): Promise<ApiFootballFixture[]> {
  const { response } = await request<ApiFootballFixture[]>("/fixtures", { date });
  return response;
}

/** Every fixture API-Football currently considers live, across all competitions — one call. */
export async function getLiveFixtures(): Promise<ApiFootballFixture[]> {
  const { response } = await request<ApiFootballFixture[]>("/fixtures", { live: "all" });
  return response;
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

export interface OddsPage {
  entries: ApiFootballOdds[];
  currentPage: number;
  totalPages: number;
}

/**
 * Pre-match bookmaker odds for every fixture on a given date, paginated
 * (10 fixtures per page) — one call per page, not one call per fixture.
 * This is the only odds endpoint this app uses: fetching odds "match by
 * match" would burn the daily budget almost immediately, so callers page
 * through this instead and stop whenever their own budget runs out.
 */
export async function getOddsByDate(date: string, page: number): Promise<OddsPage> {
  const { response, paging } = await request<ApiFootballOdds[]>("/odds", { date, page });
  return { entries: response, currentPage: paging?.current ?? page, totalPages: paging?.total ?? 1 };
}
