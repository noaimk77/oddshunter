import type { PrismaClient } from "@/generated/prisma/client";

/**
 * One-shot backfill: pulls every finished fixture from API-Football for a
 * given (league, season) and persists them as Event rows with halftime +
 * fulltime scores. Feeds the strategy stats engine (computeStrategyStats
 * in strategyStats.ts) which needs a lot of resolved matches to compute
 * an honest per-league hit-rate.
 *
 * Cheap: `/fixtures?league=X&season=Y&status=FT` returns ALL finished
 * matches for the season in one paginated response (typically 100-500
 * per league-season). Ultra plan burns ~1-2 requests per (league × season).
 *
 * Idempotent: Event rows are upserted on (competitionId, externalId), so
 * re-running mid-season simply picks up fixtures that finished since the
 * last run without duplicating anything.
 */

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

interface ApiFootballFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { id: number; season: number };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

/**
 * Retries a 429 (rate limit) with exponential backoff — a burst of many
 * leagues seeded back-to-back can transiently exceed API-Football's
 * per-minute cap even with a fixed inter-call delay elsewhere, and a bare
 * 429 was previously treated as a hard failure (Noaim, 2026-08-24: the tail
 * end of a 44-league seed run lost 5 leagues entirely to unretried 429s).
 * Any other non-OK status still fails immediately — only rate limiting is
 * worth waiting out.
 */
async function fetchWithRetry(url: string, apiKey: string, maxRetries = 4): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
    if (res.status !== 429) return res;
    lastRes = res;
    const backoffMs = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s, 16s
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
  return lastRes!;
}

async function fetchFixtures(apiKey: string, leagueId: number, season: number): Promise<ApiFootballFixture[]> {
  const url = `${API_FOOTBALL_BASE}/fixtures?league=${leagueId}&season=${season}&status=FT`;
  const res = await fetchWithRetry(url, apiKey);
  if (!res.ok) throw new Error(`API-Football fixtures ${leagueId}/${season} failed: HTTP ${res.status}`);
  const data = (await res.json()) as { errors?: unknown; response?: ApiFootballFixture[] };
  const errors = data.errors as Record<string, string> | string[] | undefined;
  if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
    throw new Error(`API-Football fixtures ${leagueId}/${season} returned errors: ${JSON.stringify(errors)}`);
  }
  return data.response ?? [];
}

export interface HistoricalCollectorResult {
  leagueId: number;
  season: number;
  competitionId: string;
  fetched: number;
  upserted: number;
  skipped: number;
  errors: string[];
}

/**
 * `competitionId` is our internal Competition id — the caller is expected to
 * have already ensured the Competition + Provider rows exist (createOrGetCompetition
 * in ingest.ts already does this for the live pipeline; historicalCollector
 * consumes the same rows to avoid two parallel Competition sources).
 */
export async function collectHistoricalFixtures(
  db: PrismaClient,
  apiKey: string,
  competitionId: string,
  leagueId: number,
  season: number,
): Promise<HistoricalCollectorResult> {
  const result: HistoricalCollectorResult = {
    leagueId,
    season,
    competitionId,
    fetched: 0,
    upserted: 0,
    skipped: 0,
    errors: [],
  };

  let fixtures: ApiFootballFixture[];
  try {
    fixtures = await fetchFixtures(apiKey, leagueId, season);
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
  result.fetched = fixtures.length;

  for (const f of fixtures) {
    // Only ingest matches with a real halftime score — the strategy engine's
    // whole premise is "did this hit at HT?", so a fixture with no HT data
    // is worthless and shouldn't inflate the sample count.
    if (f.score.halftime.home === null || f.score.halftime.away === null) {
      result.skipped++;
      continue;
    }

    try {
      await db.event.upsert({
        where: { competitionId_externalId: { competitionId, externalId: String(f.fixture.id) } },
        create: {
          competitionId,
          externalId: String(f.fixture.id),
          homeTeam: f.teams.home.name,
          awayTeam: f.teams.away.name,
          kickoff: new Date(f.fixture.date),
          status: "finished",
          homeScore: f.score.fulltime.home,
          awayScore: f.score.fulltime.away,
          halftimeHomeScore: f.score.halftime.home,
          halftimeAwayScore: f.score.halftime.away,
        },
        update: {
          status: "finished",
          homeScore: f.score.fulltime.home,
          awayScore: f.score.fulltime.away,
          halftimeHomeScore: f.score.halftime.home,
          halftimeAwayScore: f.score.halftime.away,
        },
      });
      result.upserted++;
    } catch (err) {
      result.errors.push(`fixture ${f.fixture.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

interface ApiFootballEvent {
  time: { elapsed: number; extra: number | null };
  type: string;
}

/**
 * Fetches the goal-minute list for one fixture via the dedicated
 * `/fixtures/events` endpoint (the bulk /fixtures list used above omits
 * `events` entirely — confirmed live 2026-08-23). Returns first-half goals
 * only (elapsed ≤ 45; stoppage-time goals still report elapsed ≤45 with the
 * extra minutes in a separate `extra` field, so this cutoff is correct for
 * "did this happen before the half ended" without needing `extra`).
 */
async function fetchFirstHalfGoalMinutes(apiKey: string, fixtureExternalId: string): Promise<number[]> {
  const url = `${API_FOOTBALL_BASE}/fixtures/events?fixture=${fixtureExternalId}`;
  const res = await fetchWithRetry(url, apiKey);
  if (!res.ok) throw new Error(`API-Football events ${fixtureExternalId} failed: HTTP ${res.status}`);
  const data = (await res.json()) as { response?: ApiFootballEvent[] };
  const goals = (data.response ?? [])
    .filter((e) => e.type === "Goal" && e.time.elapsed <= 45)
    .map((e) => e.time.elapsed)
    .sort((a, b) => a - b);
  return goals;
}

export interface BackfillGoalMinutesResult {
  competitionId: string;
  candidates: number;
  backfilled: number;
  errors: string[];
}

/**
 * Second pass over already-seeded Event rows: fills `firstHalfGoalMinutes`
 * for every finished event that doesn't have it yet, one API call per
 * fixture. This is what unlocks the conditional ("this league, when still
 * 0-0 through minute 15") hit-rate calculation in strategyStats.ts — the
 * bulk fixtures endpoint used by collectHistoricalFixtures only gives the
 * final HT score, not when goals actually happened.
 *
 * Rate-limited to stay under API-Football's 450 req/min cap (confirmed live
 * via the `x-ratelimit-limit` response header, 2026-08-23) — a fixed delay
 * between calls rather than a token bucket, since this is a one-shot batch
 * job, not a long-running service.
 */
export async function backfillGoalMinutes(
  db: PrismaClient,
  apiKey: string,
  competitionId: string,
  minDelayMs = 150,
): Promise<BackfillGoalMinutesResult> {
  const result: BackfillGoalMinutesResult = { competitionId, candidates: 0, backfilled: 0, errors: [] };

  // Prisma's JSON-null filtering is finicky (DbNull vs JsonNull) — simpler
  // and just as cheap at this data size to fetch every finished event and
  // filter in JS for the ones not yet backfilled.
  const events = await db.event.findMany({
    where: { competitionId, status: "finished" },
    select: { id: true, externalId: true, firstHalfGoalMinutes: true },
  });
  const candidates = events.filter((e) => e.firstHalfGoalMinutes === null);
  result.candidates = candidates.length;

  for (const event of candidates) {
    try {
      const minutes = await fetchFirstHalfGoalMinutes(apiKey, event.externalId);
      await db.event.update({ where: { id: event.id }, data: { firstHalfGoalMinutes: minutes } });
      result.backfilled++;
    } catch (err) {
      result.errors.push(`event ${event.id} (fixture ${event.externalId}): ${err instanceof Error ? err.message : String(err)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, minDelayMs));
  }

  return result;
}

/**
 * Ensures a Competition row exists for (providerName, externalLeagueId) —
 * the historical seed and the live monitor share the same Competition rows,
 * so this must produce the SAME id `ingest.ts` would (which upserts on the
 * same (provider, externalId) unique key). Country/name are stored so the
 * alert message can render "Peru - Liga 1" without a second lookup.
 */
export async function ensureCompetition(
  db: PrismaClient,
  providerName: string,
  externalLeagueId: number,
  country: string,
  leagueName: string,
): Promise<string> {
  const provider = await db.provider.upsert({
    where: { name: providerName },
    create: { name: providerName },
    update: {},
  });
  const comp = await db.competition.upsert({
    where: { providerId_externalId: { providerId: provider.id, externalId: String(externalLeagueId) } },
    create: {
      providerId: provider.id,
      externalId: String(externalLeagueId),
      sport: "football",
      country,
      name: leagueName,
    },
    update: { country, name: leagueName },
  });
  return comp.id;
}
