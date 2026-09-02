import type { LiveStateProvider, MarketDataProvider, NormalizedLiveState, NormalizedOddsPoint } from "./types";
import { ProviderNotConfiguredError } from "./types";
import { getIngestTargetCountries, getExcludedLeagueNames } from "../config";

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
 * Ultra plan (2026-08-22): 75,000 requests/day, 450/minute — target leagues
 * are resolved by country (GET_TARGET_COUNTRIES, see config.ts) via
 * `/leagues?country=`, cached in-process so that lookup only costs quota
 * once per country per run, not every ingest cycle.
 */

const API_HOST = "https://v3.football.api-sports.io";

/**
 * Daily request budget shared by every call in this module (pre-match odds,
 * live odds, fixture bulk lookup, outcome resolution). Upgraded from the
 * free tier's hard 100/day cap to the Ultra plan's 75,000/day (confirmed
 * active 2026-08-22) — default set below that ceiling, not at it, so a
 * miscounted or bursty pass can't actually hit API-Football's own limit and
 * start returning errors instead of the graceful in-process skip below.
 */
const DAILY_REQUEST_BUDGET = envInt("API_FOOTBALL_DAILY_LIMIT", 60_000);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * No fetch() call in this file previously carried a timeout — found live in
 * production 2026-08-22 when a single stalled request silently blocked the
 * entire worker loop for minutes (CPU near 0%, no crash, no log — nothing
 * left the outer `for(;;)` to log the next tick). One hung TCP connection
 * shouldn't be able to freeze detection AND alert delivery along with it.
 */
const FETCH_TIMEOUT_MS = 15_000;

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

// ---------------------------------------------------------------------------
// Live in-play odds — feeds `createApiFootballLiveOddsProvider()` below,
// which emits normalized live Over/Under snapshots (any handicap line, not
// one fixed value) into the SAME ingest pipeline the pre-match providers
// use. That's deliberate (Noaim, 2026-08-22): the mission is catching
// suspicious in-play movement — the exact thing ODDS_DROP/ODDS_RISE/
// VIG_EXPLOSION/MULTI_BOOK_CONFIRMATION already detect — not a bespoke
// "value bet" heuristic on one narrow market. Feeding live snapshots into
// Market/Selection/OddsSnapshot means those existing, already-tested
// detectors evaluate live movement automatically; no new detector needed.
//
// Verified live against a real key, 2026-08-22: `/odds/live` returns odds
// for every live fixture worldwide in ONE request (confirmed: 104 matches
// in one call, including lower-division leagues like Erovnuli Liga 2
// Georgia) — so the poll itself is cheap. `/fixtures?id=` (team names,
// league) is only called for fixtures that actually carry a relevant
// market, not every live fixture. Both share `checkAndConsumeBudget()`
// above with the pre-match ingestion — one real 100/day quota, not two
// independent counters.
// ---------------------------------------------------------------------------

export interface LiveOddsMarketValue {
  value: string;
  odd: number;
  handicap: string | null;
  suspended: boolean;
  /** The bookmaker's primary line for this market (vs. the 3-4 alternate
   *  handicaps also listed) — see createApiFootballLiveOddsProvider, which
   *  only ingests main lines: every handicap line ingested per live match
   *  (dozens) made a single poll's DB writes take minutes at Neon's ~1.1s
   *  per upsert (see ingest.ts), confirmed 2026-08-22. */
  main: boolean;
}
export interface LiveOddsMarket {
  name: string;
  values: LiveOddsMarketValue[];
}
export interface LiveOddsSnapshot {
  fixtureId: number;
  elapsedMinutes: number | null;
  homeGoals: number;
  awayGoals: number;
  markets: LiveOddsMarket[];
}

interface ApiFootballLiveOddsValue {
  value: string;
  odd: string;
  handicap: string | null;
  suspended: boolean;
  main: boolean;
}
interface ApiFootballLiveOddsMarket {
  id: number;
  name: string;
  values: ApiFootballLiveOddsValue[];
}
interface ApiFootballLiveOddsRow {
  fixture: { id: number; status: { elapsed: number | null } };
  teams: { home: { goals: number | null }; away: { goals: number | null } };
  odds: ApiFootballLiveOddsMarket[];
}

/** One request, every live fixture worldwide — see header comment above. */
export async function fetchLiveOddsSnapshot(): Promise<LiveOddsSnapshot[]> {
  if (!process.env.API_FOOTBALL_KEY) throw new ProviderNotConfiguredError("API-Football");
  if (!checkAndConsumeBudget()) {
    console.warn("[api-football] daily quota exhausted — skipping this live-odds poll.");
    return [];
  }

  const res = await fetch(`${API_HOST}/odds/live`, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`API-Football live-odds request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { response: ApiFootballLiveOddsRow[] };

  return (body.response ?? []).map((row) => ({
    fixtureId: row.fixture.id,
    elapsedMinutes: row.fixture.status.elapsed,
    homeGoals: row.teams.home.goals ?? 0,
    awayGoals: row.teams.away.goals ?? 0,
    markets: row.odds.map((m) => ({
      name: m.name,
      values: m.values.map((v) => ({ value: v.value, odd: Number.parseFloat(v.odd), handicap: v.handicap, suspended: v.suspended, main: v.main })),
    })),
  }));
}

export interface BulkFixtureInfo {
  homeTeam: string;
  awayTeam: string;
  leagueExternalId: number;
  leagueName: string;
  leagueCountry: string;
}

/** One request for every live fixture's team names + league — /odds/live
 *  itself carries neither, only fixture IDs and team goal counts. Fetched
 *  once per poll and joined locally by fixture ID, so the live-odds
 *  provider's total cost stays at 2 requests/poll regardless of how many
 *  matches are live (confirmed: a per-fixture lookup instead burned 33/100
 *  of the daily quota in one poll on 2026-08-22 — this is the fix). Exported
 *  for momentumPicks.ts too, which needs the same live-fixture/league list
 *  to find matches in the momentum-covered leagues (getMomentumTargetLeagueIds). */
export async function fetchLiveFixturesBulk(): Promise<Map<number, BulkFixtureInfo>> {
  const map = new Map<number, BulkFixtureInfo>();
  if (!checkAndConsumeBudget()) {
    console.warn("[api-football] daily quota exhausted — skipping live fixtures lookup.");
    return map;
  }

  const res = await fetch(`${API_HOST}/fixtures?live=all`, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    console.error(`[api-football] failed to fetch live fixtures: ${res.status} ${res.statusText}`);
    return map;
  }
  const body = (await res.json()) as {
    response: {
      fixture: { id: number };
      league: { id: number; name: string; country: string };
      teams: { home: { name: string }; away: { name: string } };
    }[];
  };
  for (const row of body.response ?? []) {
    map.set(row.fixture.id, {
      homeTeam: row.teams.home.name,
      awayTeam: row.teams.away.name,
      leagueExternalId: row.league.id,
      leagueName: row.league.name,
      leagueCountry: row.league.country,
    });
  }
  return map;
}

export interface FixtureResult {
  statusShort: string;
  fullTimeHomeGoals: number | null;
  fullTimeAwayGoals: number | null;
  halftimeHomeGoals: number | null;
  halftimeAwayGoals: number | null;
}

/** Match statuses meaning "the result is final" — API-Football's set for
 *  finished matches (FT/AET/PEN) vs. abandoned ones counted the same way
 *  for our purposes: nothing more will change, safe to resolve outcomes
 *  against whatever score is there. */
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO", "ABD", "CANC", "PST"]);

export function isFixtureFinished(statusShort: string): boolean {
  return FINISHED_STATUSES.has(statusShort);
}

/**
 * Single-fixture lookup for the outcome-resolution pass — kept for callers
 * that only ever need one fixture at a time. Prefer `fetchFixtureResults`
 * (batched) when checking several pending fixtures in the same pass.
 */
export async function fetchFixtureResult(fixtureId: number): Promise<FixtureResult | null> {
  const results = await fetchFixtureResults([fixtureId]);
  return results.get(fixtureId) ?? null;
}

interface ApiFootballFixtureResultRow {
  fixture: { id: number; status: { short: string } };
  goals: { home: number | null; away: number | null };
  score: { halftime: { home: number | null; away: number | null } };
}

export interface FixtureTeamStats {
  shotsOnGoal: number;
  totalShots: number;
  cornerKicks: number;
  possessionPct: number;
  expectedGoals: number;
  goals: number;
}
export interface FixtureWithStats {
  fixtureId: number;
  elapsedMinutes: number;
  homeStats: FixtureTeamStats;
  awayStats: FixtureTeamStats;
}

interface ApiFootballStatValue {
  type: string;
  value: string | number | null;
}
interface ApiFootballTeamStatistics {
  team: { id: number };
  statistics: ApiFootballStatValue[];
}
interface ApiFootballIdsFixtureRow {
  fixture: { id: number; status: { elapsed: number | null } };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
  statistics: ApiFootballTeamStatistics[];
}

function statNumber(stats: ApiFootballStatValue[], type: string): number {
  const raw = stats.find((s) => s.type === type)?.value;
  if (raw == null) return 0;
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTeamStats(teamStats: ApiFootballTeamStatistics | undefined, goals: number | null): FixtureTeamStats {
  const stats = teamStats?.statistics ?? [];
  return {
    shotsOnGoal: statNumber(stats, "Shots on Goal"),
    totalShots: statNumber(stats, "Total Shots"),
    cornerKicks: statNumber(stats, "Corner Kicks"),
    possessionPct: statNumber(stats, "Ball Possession"),
    expectedGoals: statNumber(stats, "expected_goals"),
    goals: goals ?? 0,
  };
}

/**
 * Batched live-fixture statistics (shots, xG, possession, corners) via
 * `/fixtures?ids=` — confirmed 2026-08-23 that this single endpoint embeds
 * full per-team `statistics` alongside the fixture, avoiding one
 * `/fixtures/statistics?fixture=` request per match. Feeds the live-momentum
 * pick detector (src/worker/detectors/momentum.ts) — NOT the fixing-detection
 * engine, which stays on the obscure-league target countries.
 *
 * Coverage gap confirmed empirically the same day: this data simply doesn't
 * exist for the obscure leagues the rest of this file targets (India,
 * Bolivia, Paraguay, Peru, Ecuador, Venezuela all returned zero stats, as
 * did Brazil's actual top flight) — only mainstream European leagues and
 * UEFA competitions reliably have it. A fixture with no stats coverage
 * simply comes back with all-zero `FixtureTeamStats` here; the caller
 * (momentumPicks.ts) treats that the same as "nothing to report", not an
 * error — no separate handling needed.
 */
export async function fetchFixturesWithStats(fixtureIds: number[]): Promise<FixtureWithStats[]> {
  const results: FixtureWithStats[] = [];
  if (fixtureIds.length === 0) return results;
  if (!process.env.API_FOOTBALL_KEY) throw new ProviderNotConfiguredError("API-Football");

  const CHUNK_SIZE = 20;
  for (let i = 0; i < fixtureIds.length; i += CHUNK_SIZE) {
    const chunk = fixtureIds.slice(i, i + CHUNK_SIZE);
    if (!checkAndConsumeBudget()) {
      console.warn(`[api-football] daily quota exhausted — cannot check stats for ${chunk.length} fixture(s).`);
      break;
    }

    const url = new URL(`${API_HOST}/fixtures`);
    url.searchParams.set("ids", chunk.join("-"));
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`[api-football] failed to fetch stats for fixtures [${chunk.join(",")}]: ${res.status} ${res.statusText}`);
      continue;
    }
    const body = (await res.json()) as { response: ApiFootballIdsFixtureRow[] };
    for (const row of body.response ?? []) {
      const homeTeamStats = row.statistics.find((s) => s.team.id === row.teams.home.id);
      const awayTeamStats = row.statistics.find((s) => s.team.id === row.teams.away.id);
      results.push({
        fixtureId: row.fixture.id,
        elapsedMinutes: row.fixture.status.elapsed ?? 0,
        homeStats: toTeamStats(homeTeamStats, row.goals.home),
        awayStats: toTeamStats(awayTeamStats, row.goals.away),
      });
    }
  }
  return results;
}

/**
 * Batched fixture-result lookup via the `ids=` parameter — unlocked on paid
 * plans (confirmed blocked on the free tier 2026-08-22: "Free plans do not
 * have access to the Ids parameter"; confirmed available on Ultra the same
 * day). Up to 20 fixture IDs per request, hyphen-separated
 * (`ids=1-2-3-...`), per API-Football's documented limit — chunked here so
 * callers can pass an arbitrary list.
 */
export async function fetchFixtureResults(fixtureIds: number[]): Promise<Map<number, FixtureResult>> {
  const results = new Map<number, FixtureResult>();
  if (fixtureIds.length === 0) return results;
  if (!process.env.API_FOOTBALL_KEY) throw new ProviderNotConfiguredError("API-Football");

  const CHUNK_SIZE = 20;
  for (let i = 0; i < fixtureIds.length; i += CHUNK_SIZE) {
    const chunk = fixtureIds.slice(i, i + CHUNK_SIZE);
    if (!checkAndConsumeBudget()) {
      console.warn(`[api-football] daily quota exhausted — cannot check ${chunk.length} fixture(s) result.`);
      break;
    }

    const url = new URL(`${API_HOST}/fixtures`);
    url.searchParams.set("ids", chunk.join("-"));
    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.error(`[api-football] failed to fetch fixtures [${chunk.join(",")}] result: ${res.status} ${res.statusText}`);
      continue;
    }
    const body = (await res.json()) as { response: ApiFootballFixtureResultRow[] };
    for (const row of body.response ?? []) {
      results.set(row.fixture.id, {
        statusShort: row.fixture.status.short,
        fullTimeHomeGoals: row.goals.home,
        fullTimeAwayGoals: row.goals.away,
        halftimeHomeGoals: row.score.halftime.home,
        halftimeAwayGoals: row.score.halftime.away,
      });
    }
  }
  return results;
}

/** Any-line, any-half Over/Under — matches the mission (catch suspicious
 *  in-play movement wherever it shows up), not one fixed handicap. */
const LIVE_OVER_UNDER_MARKETS = ["Over/Under Line", "Over/Under (1st Half)"];

/**
 * Normalizes live Over/Under odds (every handicap line found, both markets
 * above) into the same NormalizedOddsPoint shape pre-match providers use —
 * see the header comment above fetchLiveOddsSnapshot for why. Exactly 2
 * requests per poll (live odds + live fixtures, both bulk), independent of
 * how many matches are live.
 */
export function createApiFootballLiveOddsProvider(): MarketDataProvider {
  const isConfigured = () => Boolean(process.env.API_FOOTBALL_KEY);

  return {
    name: "api-football-live",
    isConfigured,
    // Method name is the shared MarketDataProvider interface's — this
    // adapter's odds are in-play, not pre-match; see eventStatus below.
    async fetchPreMatchOdds(sport: string): Promise<NormalizedOddsPoint[]> {
      console.log("[api-football-live] fetchPreMatchOdds: starting");
      if (!isConfigured()) throw new ProviderNotConfiguredError("API-Football (live)");
      if (sport !== "football") return [];

      // Same target leagues as the pre-match provider (India, Bolivia,
      // Paraguay...) — not just for quota, but because a Neon connection
      // dropped mid-write when this ran unfiltered against every live match
      // worldwide (40-100+ matches, confirmed 2026-08-22): the sequential
      // per-point upsert cost in ingest.ts was never sized for that volume.
      // Scoping to the already-chosen low-scrutiny leagues keeps both the
      // product focus and the write volume sane.
      const targetLeagues = await resolveTargetLeagues();
      const targetLeagueIds = new Set(targetLeagues.map((l) => l.id));
      console.log(`[api-football-live] resolved ${targetLeagues.length} target leagues, fetching live odds + fixtures...`);

      const [snapshots, fixtureInfoById] = await Promise.all([fetchLiveOddsSnapshot(), fetchLiveFixturesBulk()]);
      console.log(`[api-football-live] got ${snapshots.length} live odds snapshots, ${fixtureInfoById.size} fixtures`);
      const points: NormalizedOddsPoint[] = [];

      for (const snapshot of snapshots) {
        const details = fixtureInfoById.get(snapshot.fixtureId);
        if (!details || !targetLeagueIds.has(details.leagueExternalId)) continue;

        const relevantMarkets = snapshot.markets.filter((m) => LIVE_OVER_UNDER_MARKETS.includes(m.name));
        if (relevantMarkets.length === 0) continue;

        // Approximate kickoff from elapsed minutes — /odds/live carries no
        // kickoff timestamp, and this keeps proximityToKickoff meaningful
        // in the scoring engine instead of drifting to "now" every poll.
        const kickoff =
          snapshot.elapsedMinutes !== null ? new Date(Date.now() - snapshot.elapsedMinutes * 60_000) : new Date();

        for (const market of relevantMarkets) {
          // Only the bookmaker's main line — see the `main` field comment
          // on LiveOddsMarketValue for why every alternate handicap isn't
          // ingested too.
          const mainValues = market.values.filter((v) => v.main && v.handicap !== null);
          const handicapLines = new Set(mainValues.map((v) => v.handicap as string));
          for (const handicap of handicapLines) {
            const marketKey = `${snapshot.fixtureId}:${market.name}:${handicap}`;
            for (const value of mainValues.filter((v) => v.handicap === handicap)) {
              points.push({
                providerName: "api-football-live",
                externalCompetitionId: String(details.leagueExternalId),
                externalEventId: String(snapshot.fixtureId),
                externalMarketId: marketKey,
                externalSelectionId: `${marketKey}:${value.value}`,
                sport: "football",
                country: details.leagueCountry,
                competitionName: details.leagueName,
                homeTeam: details.homeTeam,
                awayTeam: details.awayTeam,
                kickoff,
                marketType: "over_under_live",
                marketName: `${market.name} ${handicap}`,
                marketStatus: value.suspended ? "suspended" : "open",
                selectionName: value.value,
                selectionPosition: value.value.toLowerCase(),
                price: value.odd,
                timestamp: new Date(),
                eventStatus: "live",
              });
            }
          }
        }
      }
      return points;
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
  if (requestsToday >= DAILY_REQUEST_BUDGET) return false;
  requestsToday += 1;
  return true;
}

export async function resolveTargetLeagues(): Promise<{ id: number; name: string; country: string; season: number }[]> {
  if (resolvedLeaguesCache) return resolvedLeaguesCache;

  const leagues: { id: number; name: string; country: string; season: number }[] = [];
  for (const country of getIngestTargetCountries()) {
    if (!checkAndConsumeBudget()) {
      console.warn(`[api-football] daily quota exhausted while resolving leagues — stopped at "${country}".`);
      break;
    }
    console.log(`[api-football] resolveTargetLeagues: fetching leagues for ${country}...`);
    const url = new URL(`${API_HOST}/leagues`);
    url.searchParams.set("country", country);
    let res: Response;
    try {
      res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      console.error(`[api-football] request for ${country} leagues threw (timeout or network error):`, err);
      continue;
    }
    console.log(`[api-football] resolveTargetLeagues: got response for ${country} (status ${res.status})`);
    if (!res.ok) {
      console.error(`[api-football] failed to list leagues for ${country}: ${res.status} ${res.statusText}`);
      continue;
    }
    const body = (await res.json()) as { response: ApiFootballLeague[] };
    const excluded = getExcludedLeagueNames();
    for (const entry of body.response ?? []) {
      const currentSeason = entry.seasons.find((s) => s.current);
      if (!currentSeason) continue; // no active season — nothing to fetch odds for
      // The whole point of targeting these countries is picking leagues too
      // obscure to get real scrutiny — a country's actual top flight (e.g.
      // Indian Super League) defeats that, so it's excluded by name rather
      // than an automatic tier heuristic (API-Football's `type` field is
      // just "League"/"Cup", not a division-level number to filter on).
      // Noaim, 2026-08-22 — flagged "première division" alerts as useless.
      if (excluded.includes(entry.league.name)) continue;
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

    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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

    const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
            // Bookmaker name suffix matches bookmakerLabelFromMarketName's
            // parsing in index.ts — without it, MULTI_BOOK_CONFIRMATION (and
            // the new VALUE_BET detector, which needs to find Pinnacle's
            // price specifically) can't tell which bookmaker a price came
            // from. This was silently missing before 2026-08-22: every
            // API-Football signal fell back to a generic "market-{id}"
            // label instead of a real bookmaker name.
            marketName: `1X2 (${bookmaker.name})`,
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
      console.log("[api-football] fetchPreMatchOdds: starting");
      if (!isConfigured()) throw new ProviderNotConfiguredError("API-Football");
      if (sport !== "football") return [];

      const leagues = await resolveTargetLeagues();
      console.log(`[api-football] resolved ${leagues.length} target leagues, fetching odds per league...`);
      const results: NormalizedOddsPoint[] = [];
      for (const league of leagues) {
        try {
          results.push(...(await fetchLeagueOdds(league)));
        } catch (err) {
          console.error(`[api-football] failed to fetch odds for ${league.name} (${league.country})`, err);
        }
      }
      console.log(`[api-football] fetchPreMatchOdds: done, ${results.length} points`);
      return results;
    },
  };
}
