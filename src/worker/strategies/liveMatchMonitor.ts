import type { PrismaClient } from "@/generated/prisma/client";
import { TARGET_LEAGUES } from "../lib/targetLeagues";

/**
 * Live fixture monitor — polls API-Football's `/fixtures?live=all&league=X,Y`
 * for every strategy target league, exposes the current (minute, score,
 * first-goal-minute) state per fixture so the strategy runner can decide
 * whether to fire an alert.
 *
 * Batching: /fixtures accepts a comma-separated league list in one request,
 * so all 10 target leagues fit in a single API call per cycle. At a 45s
 * cycle → ~2000 requests/day → well under Ultra's 75k/day budget.
 *
 * Returns only fixtures in a strategy-useful state — currently: 1H (first
 * half) matches at minute ≤ 30 (a pick fired after minute 30 leaves the
 * subscriber too little time before HT to place the bet). Filter values
 * live here rather than in the strategy so ALL strategies inherit the same
 * safety window.
 */

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

export interface LiveFixtureState {
  fixtureId: number;
  leagueId: number;
  competitionExternalId: string;
  homeTeam: string;
  awayTeam: string;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  /** null when 0-0 (no goal yet) */
  firstGoalMinute: number | null;
  kickoff: Date;
}

interface ApiFootballLiveFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
  };
  league: { id: number };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
  events?: Array<{ time: { elapsed: number }; type: string; team?: { id: number } }>;
}

async function fetchLiveFixtures(apiKey: string, leagueIds: number[]): Promise<ApiFootballLiveFixture[]> {
  const leaguesParam = leagueIds.join("-");
  const url = `${API_FOOTBALL_BASE}/fixtures?live=${leaguesParam}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) throw new Error(`API-Football live fixtures failed: HTTP ${res.status}`);
  const data = (await res.json()) as { errors?: unknown; response?: ApiFootballLiveFixture[] };
  const errors = data.errors as Record<string, string> | string[] | undefined;
  if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
    throw new Error(`API-Football live fixtures returned errors: ${JSON.stringify(errors)}`);
  }
  return data.response ?? [];
}

/**
 * Filters for "usable state" — a strategy fires early in the first half or
 * not at all. `1H` = first half, `HT` = half-time break (nothing to bet on
 * HT goals anymore), `2H`/`ET`/`P`/`FT` all past the HT window.
 *
 * `maxMinute` gates how late in the first half we accept — most InPlay
 * Alerts picks land between minute 1 and 15 (verified live 2026-08-23);
 * we stop at 20 by default to keep the subscriber some placing time.
 */
export interface LiveMonitorConfig {
  maxMinute: number;
}

export const DEFAULT_LIVE_MONITOR_CONFIG: LiveMonitorConfig = {
  maxMinute: 20,
};

/**
 * Returns the current strategy-relevant live fixture states for our target
 * leagues, or `null` when the API is unreachable (caller keeps the last
 * known state instead of thinking "no matches live" and dropping alerts).
 */
export async function fetchStrategyLiveFixtures(
  apiKey: string,
  config: LiveMonitorConfig = DEFAULT_LIVE_MONITOR_CONFIG,
): Promise<LiveFixtureState[] | null> {
  const leagueIds = TARGET_LEAGUES.map((l) => l.leagueId);
  let fixtures: ApiFootballLiveFixture[];
  try {
    fixtures = await fetchLiveFixtures(apiKey, leagueIds);
  } catch (err) {
    console.error("[liveMatchMonitor] fetch failed", err);
    return null;
  }

  const out: LiveFixtureState[] = [];
  for (const f of fixtures) {
    if (f.fixture.status.short !== "1H") continue; // outside first half — irrelevant to HT strategies
    const minute = f.fixture.status.elapsed;
    if (minute == null || minute > config.maxMinute) continue;

    const homeGoals = f.goals.home ?? 0;
    const awayGoals = f.goals.away ?? 0;

    // First-goal minute — API-Football's `events` array (when available on
    // the live payload) has an entry per goal with time.elapsed. Some early
    // fixture responses omit `events` until at least one is registered,
    // hence the nullable field.
    let firstGoalMinute: number | null = null;
    if (Array.isArray(f.events) && f.events.length > 0) {
      const goals = f.events.filter((e) => e.type === "Goal").sort((a, b) => a.time.elapsed - b.time.elapsed);
      if (goals.length > 0) firstGoalMinute = goals[0].time.elapsed;
    }

    out.push({
      fixtureId: f.fixture.id,
      leagueId: f.league.id,
      competitionExternalId: String(f.league.id),
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      minute,
      homeGoals,
      awayGoals,
      firstGoalMinute,
      kickoff: new Date(f.fixture.date),
    });
  }
  return out;
}

/**
 * Fetches half-time score for a fixture — used by the HT result tracker to
 * decide whether a pick landed. Kept in the same file since it's the same
 * `/fixtures?id=` endpoint the live monitor implicitly relies on.
 */
export interface FixtureHTResult {
  fixtureId: number;
  status: string;
  htHomeGoals: number | null;
  htAwayGoals: number | null;
  firstGoalMinute: number | null;
}

export async function fetchFixtureHTResult(apiKey: string, fixtureId: number): Promise<FixtureHTResult | null> {
  const url = `${API_FOOTBALL_BASE}/fixtures?id=${fixtureId}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    response?: Array<{
      fixture: { status: { short: string } };
      score: { halftime: { home: number | null; away: number | null } };
      events?: Array<{ time: { elapsed: number }; type: string }>;
    }>;
  };
  const f = data.response?.[0];
  if (!f) return null;

  const goals = (f.events ?? []).filter((e) => e.type === "Goal").sort((a, b) => a.time.elapsed - b.time.elapsed);
  const firstGoalMinute = goals[0]?.time.elapsed ?? null;

  return {
    fixtureId,
    status: f.fixture.status.short,
    htHomeGoals: f.score.halftime.home,
    htAwayGoals: f.score.halftime.away,
    firstGoalMinute,
  };
}

/** True once a fixture has reached at least half-time — mirrors the
 *  isFixtureFinished helper in apiFootball.ts for the outcome resolver,
 *  but broadened to include any status past 1H so HT resolution fires as
 *  soon as the whistle blows, not only after full-time. */
export function isFixtureAtOrPastHT(statusShort: string): boolean {
  return ["HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN", "PST", "CANC", "ABD", "AWD", "WO"].includes(statusShort);
}
