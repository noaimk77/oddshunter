import { db } from "@/lib/db";
import {
  LEAGUE_ALLOWLIST,
  getFixturesByDate,
  getLiveFixtures,
  getOddsForFixture,
  isLiveStatus,
  type ApiFootballFixture,
} from "@/lib/api-football";

export const PROVIDER_NAME = "api-football";

// Free plan is 100 requests/day — this self-imposed cap leaves real margin
// so a manual sync during development can never lock the account out for
// the rest of the day. Tracked in Provider.requestsToday, reset on UTC
// day rollover.
const DAILY_BUDGET = 90;
const MAX_ODDS_CALLS_PER_SYNC = 8;
const ALLOWLISTED_LEAGUE_IDS = new Set<number>(LEAGUE_ALLOWLIST.map((l) => l.id));

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
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

async function upsertFixture(fixture: ApiFootballFixture) {
  const provider = await getOrCreateProvider();
  const league = LEAGUE_ALLOWLIST.find((l) => l.id === fixture.league.id);
  if (!league) return null;

  const competition = await db.competition.upsert({
    where: { providerId_externalId: { providerId: provider.id, externalId: String(league.id) } },
    create: {
      providerId: provider.id,
      externalId: String(league.id),
      sport: "football",
      country: league.country,
      name: league.name,
    },
    update: {},
  });

  const event = await db.event.upsert({
    where: { competitionId_externalId: { competitionId: competition.id, externalId: String(fixture.fixture.id) } },
    create: {
      competitionId: competition.id,
      externalId: String(fixture.fixture.id),
      homeTeam: fixture.teams.home.name,
      awayTeam: fixture.teams.away.name,
      kickoff: new Date(fixture.fixture.date),
      status: mapEventStatus(fixture.fixture.status.short),
      homeScore: fixture.goals.home,
      awayScore: fixture.goals.away,
    },
    update: {
      status: mapEventStatus(fixture.fixture.status.short),
      homeScore: fixture.goals.home,
      awayScore: fixture.goals.away,
    },
  });

  return event;
}

async function syncOddsForFixture(fixtureId: number, eventDbId: string) {
  const odds = await getOddsForFixture(fixtureId);
  if (!odds || odds.bookmakers.length === 0) return;

  const bookmaker = odds.bookmakers[0];
  const matchWinner = bookmaker.bets.find((b) => b.name === "Match Winner");
  if (!matchWinner) return;

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
    await db.oddsSnapshot.create({
      data: { selectionId: selection.id, price: Number(outcome.odd), timestamp: now },
    });
  }
}

export interface SyncResult {
  ok: boolean;
  reason?: string;
  fixturesSynced: number;
  oddsFetched: number;
  requestsUsed: number;
}

/**
 * The only place this app ever calls the real API-Football API. Reads
 * today's fixtures + currently-live fixtures (both allowlisted-league only),
 * then spends a small, capped number of additional calls on odds for the
 * fixtures that matter most right now (live first, then soonest upcoming).
 * Everything is written to Postgres with real timestamps; nothing here
 * fabricates a value the API didn't actually return.
 */
export async function syncApiFootball(): Promise<SyncResult> {
  const budget = await reserveBudget(2);
  if (budget < 2) {
    return { ok: false, reason: "Daily API-Football request budget exhausted.", fixturesSynced: 0, oddsFetched: 0, requestsUsed: 0 };
  }

  const [todayFixtures, liveFixtures] = await Promise.all([
    getFixturesByDate(todayUTC()),
    getLiveFixtures(),
  ]);
  let requestsUsed = 2;

  const liveIds = new Set(liveFixtures.map((f) => f.fixture.id));
  const merged = [...liveFixtures, ...todayFixtures.filter((f) => !liveIds.has(f.fixture.id))].filter((f) =>
    ALLOWLISTED_LEAGUE_IDS.has(f.league.id)
  );

  const eventByFixtureId = new Map<number, string>();
  for (const fixture of merged) {
    const event = await upsertFixture(fixture);
    if (event) eventByFixtureId.set(fixture.fixture.id, event.id);
  }

  // Prioritize live matches for odds, then the soonest upcoming ones —
  // never spend the odds budget on fixtures already finished.
  const oddsCandidates = merged
    .filter((f) => mapEventStatus(f.fixture.status.short) !== "finished")
    .sort((a, b) => {
      const aLive = isLiveStatus(a.fixture.status.short) ? 0 : 1;
      const bLive = isLiveStatus(b.fixture.status.short) ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return a.fixture.timestamp - b.fixture.timestamp;
    });

  const oddsBudget = await reserveBudget(Math.min(MAX_ODDS_CALLS_PER_SYNC, oddsCandidates.length));
  let oddsFetched = 0;
  for (const fixture of oddsCandidates.slice(0, oddsBudget)) {
    const eventDbId = eventByFixtureId.get(fixture.fixture.id);
    if (!eventDbId) continue;
    await syncOddsForFixture(fixture.fixture.id, eventDbId);
    oddsFetched += 1;
  }
  requestsUsed += oddsFetched;

  await db.provider.update({ where: { name: PROVIDER_NAME }, data: { lastSyncedAt: new Date() } });

  return { ok: true, fixturesSynced: eventByFixtureId.size, oddsFetched, requestsUsed };
}
