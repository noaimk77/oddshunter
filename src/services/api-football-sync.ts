import { db } from "@/lib/db";
import {
  ApiFootballError,
  getFixturesByDate,
  getLiveFixtures,
  getOddsByDate,
  isLiveStatus,
  type ApiFootballFixture,
} from "@/lib/api-football";

export const PROVIDER_NAME = "api-football";

// Free plan is 100 requests/day — this self-imposed cap leaves real margin
// so a manual sync can never lock the account out for the rest of the day.
// Tracked in Provider.requestsToday, reset on UTC day rollover.
const DAILY_BUDGET = 80;

// Odds are fetched via the paginated /odds?date= endpoint (10 fixtures per
// page), never one call per fixture — this caps how many pages one sync
// spends, not how many matches exist. Running the sync again later (same
// day, budget permitting) fetches further pages and fills in more real odds.
const MAX_ODDS_PAGES_PER_SYNC = 6;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function getOrCreateProvider() {
  return db.provider.upsert({ where: { name: PROVIDER_NAME }, create: { name: PROVIDER_NAME }, update: {} });
}

/** Atomically checks and reserves budget; returns how many of the requested calls are actually affordable today. */
async function reserveBudget(requested: number): Promise<number> {
  const provider = await getOrCreateProvider();
  const today = todayUTC();
  const spentToday = provider.requestsDate === today ? provider.requestsToday : 0;
  const affordable = Math.max(0, Math.min(requested, DAILY_BUDGET - spentToday));
  if (affordable > 0) {
    await db.provider.update({
      where: { id: provider.id },
      data: { requestsToday: spentToday + affordable, requestsDate: today },
    });
  }
  return affordable;
}

function mapEventStatus(short: string): "upcoming" | "live" | "finished" {
  if (isLiveStatus(short)) return "live";
  if (short === "NS" || short === "TBD") return "upcoming";
  return "finished";
}

/** Runs `fn` over `items` with at most `limit` in flight at once — keeps DB round-trips fast without opening hundreds of connections at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** One call reserved from the budget, or null if the budget is already exhausted — callers treat null as "skip this, don't fail the whole sync". */
async function tryReserve(requestsUsed: { count: number }): Promise<boolean> {
  const got = await reserveBudget(1);
  if (got < 1) return false;
  requestsUsed.count += 1;
  return true;
}

export interface SyncResult {
  ok: boolean;
  reason?: string;
  fixturesSynced: number;
  competitionsSynced: number;
  oddsFetched: number;
  requestsUsed: number;
}

/**
 * The only place this app ever calls the real API-Football API. No fixed
 * league allowlist: every competition the API returns for the fetched
 * dates gets stored, because curating a short list of "big" leagues was
 * the actual cause of near-empty results, not a real coverage limit.
 *
 * Sequence: today's fixtures (required) -> live fixtures (best-effort) ->
 * tomorrow's fixtures (best-effort) -> a capped number of paginated odds
 * pages for today. Each step reserves its own budget before calling, so a
 * budget shortfall degrades the sync (skips optional steps) instead of
 * failing it outright, and the sync can never spend past DAILY_BUDGET.
 * Every attempt — success or failure — is written to SyncLog.
 */
export async function syncApiFootball(): Promise<SyncResult> {
  const provider = await getOrCreateProvider();
  const requestsUsed = { count: 0 };
  const startedAt = new Date();

  try {
    if (!(await tryReserve(requestsUsed))) {
      return await finish({ ok: false, reason: "Daily API-Football request budget already exhausted." });
    }
    const todayFixtures = await getFixturesByDate(todayUTC());

    let liveFixtures: ApiFootballFixture[] = [];
    if (await tryReserve(requestsUsed)) {
      try {
        liveFixtures = await getLiveFixtures();
      } catch {
        liveFixtures = []; // best-effort — a failed live check shouldn't sink the whole sync
      }
    }

    let tomorrowFixtures: ApiFootballFixture[] = [];
    if (await tryReserve(requestsUsed)) {
      try {
        tomorrowFixtures = await getFixturesByDate(tomorrowUTC());
      } catch {
        tomorrowFixtures = []; // e.g. right at UTC day rollover — skip, don't fail
      }
    }

    const byFixtureId = new Map<number, ApiFootballFixture>();
    // Live status is the most current — apply it last so it wins over the plain date-listing entry for the same fixture.
    for (const f of [...todayFixtures, ...tomorrowFixtures, ...liveFixtures]) byFixtureId.set(f.fixture.id, f);
    const merged = [...byFixtureId.values()];

    // One upsert per distinct competition first, so events can reference a real Competition id.
    const leaguesById = new Map<number, ApiFootballFixture["league"]>();
    for (const f of merged) leaguesById.set(f.league.id, f.league);

    const competitionIdByLeagueId = new Map<number, string>();
    await mapLimit([...leaguesById.values()], 10, async (league) => {
      const competition = await db.competition.upsert({
        where: { providerId_externalId: { providerId: provider.id, externalId: String(league.id) } },
        create: { providerId: provider.id, externalId: String(league.id), sport: "football", country: league.country, name: league.name },
        update: { name: league.name, country: league.country },
      });
      competitionIdByLeagueId.set(league.id, competition.id);
    });

    const eventByFixtureId = new Map<number, string>();
    await mapLimit(merged, 20, async (fixture) => {
      const competitionId = competitionIdByLeagueId.get(fixture.league.id);
      if (!competitionId) return;
      const event = await db.event.upsert({
        where: { competitionId_externalId: { competitionId, externalId: String(fixture.fixture.id) } },
        create: {
          competitionId,
          externalId: String(fixture.fixture.id),
          homeTeam: fixture.teams.home.name,
          awayTeam: fixture.teams.away.name,
          kickoff: new Date(fixture.fixture.date),
          status: mapEventStatus(fixture.fixture.status.short),
          homeScore: fixture.goals.home,
          awayScore: fixture.goals.away,
        },
        update: {
          kickoff: new Date(fixture.fixture.date),
          status: mapEventStatus(fixture.fixture.status.short),
          homeScore: fixture.goals.home,
          awayScore: fixture.goals.away,
        },
      });
      eventByFixtureId.set(fixture.fixture.id, event.id);
    });

    // Odds: paginated bulk endpoint only, never one call per fixture. Stop
    // as soon as the daily budget or the per-sync page cap is reached.
    let oddsFetched = 0;
    for (let page = 1; page <= MAX_ODDS_PAGES_PER_SYNC; page++) {
      if (!(await tryReserve(requestsUsed))) break;
      let oddsPage;
      try {
        oddsPage = await getOddsByDate(todayUTC(), page);
      } catch {
        break; // stop paging on any error rather than risk burning budget on repeats of the same failure
      }
      for (const odds of oddsPage.entries) {
        const eventDbId = eventByFixtureId.get(odds.fixture.id);
        if (!eventDbId) continue; // odds for a fixture we didn't store (shouldn't normally happen for `date=today`)
        const synced = await syncOddsForFixture(eventDbId, odds);
        if (synced) oddsFetched += 1;
      }
      if (page >= oddsPage.totalPages) break;
    }

    await db.provider.update({ where: { id: provider.id }, data: { lastSyncedAt: new Date() } });

    return await finish({
      ok: true,
      fixturesSynced: eventByFixtureId.size,
      competitionsSynced: competitionIdByLeagueId.size,
      oddsFetched,
    });
  } catch (error) {
    const message = error instanceof ApiFootballError ? error.message : "Unexpected error during sync.";
    return await finish({ ok: false, reason: message });
  }

  async function finish(partial: {
    ok: boolean;
    reason?: string;
    fixturesSynced?: number;
    competitionsSynced?: number;
    oddsFetched?: number;
  }): Promise<SyncResult> {
    await db.syncLog.create({
      data: {
        providerId: provider.id,
        startedAt,
        finishedAt: new Date(),
        ok: partial.ok,
        fixturesSynced: partial.fixturesSynced ?? 0,
        competitionsSynced: partial.competitionsSynced ?? 0,
        oddsFetched: partial.oddsFetched ?? 0,
        requestsUsed: requestsUsed.count,
        errorMessage: partial.reason,
      },
    });
    return {
      ok: partial.ok,
      reason: partial.reason,
      fixturesSynced: partial.fixturesSynced ?? 0,
      competitionsSynced: partial.competitionsSynced ?? 0,
      oddsFetched: partial.oddsFetched ?? 0,
      requestsUsed: requestsUsed.count,
    };
  }
}

async function syncOddsForFixture(eventDbId: string, odds: Awaited<ReturnType<typeof getOddsByDate>>["entries"][number]): Promise<boolean> {
  if (!odds.bookmakers.length) return false;
  const bookmaker = odds.bookmakers[0];
  const matchWinner = bookmaker.bets.find((b) => b.name === "Match Winner");
  if (!matchWinner) return false;

  const market = await db.market.upsert({
    where: { eventId_externalId: { eventId: eventDbId, externalId: `${bookmaker.id}-${matchWinner.id}` } },
    create: {
      eventId: eventDbId,
      externalId: `${bookmaker.id}-${matchWinner.id}`,
      type: "match-odds",
      name: `Match Winner (${bookmaker.name})`,
      status: "open",
      lastUpdated: new Date(),
    },
    update: { lastUpdated: new Date() },
  });

  const positionByValue: Record<string, string> = { Home: "home", Draw: "draw", Away: "away" };
  const now = new Date();
  let wroteAny = false;

  for (const outcome of matchWinner.values) {
    const position = positionByValue[outcome.value];
    if (!position) continue; // skip anything outside the plain 1X2 outcomes

    const selection = await db.selection.upsert({
      where: { marketId_externalId: { marketId: market.id, externalId: outcome.value } },
      create: { marketId: market.id, externalId: outcome.value, name: outcome.value, position },
      update: {},
    });

    // A real snapshot of a real bookmaker price, timestamped to when we
    // actually fetched it — never backdated or interpolated.
    await db.oddsSnapshot.create({ data: { selectionId: selection.id, price: Number(outcome.odd), timestamp: now } });
    wroteAny = true;
  }

  return wroteAny;
}
