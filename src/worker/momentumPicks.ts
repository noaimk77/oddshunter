import { db } from "@/lib/db";
import { fetchLiveFixturesBulk, fetchFixturesWithStats } from "./providers/apiFootball";
import { detectMomentumPick, type MomentumOutcome } from "./detectors/momentum";
import { getMomentumTargetLeagueIds, getMomentumConfig } from "./config";

/**
 * Live-momentum "good tips" pass — separate from runIngestion()/
 * runDetectionPass() in index.ts because it doesn't fit the
 * Competition/Event/Market/Selection/OddsSnapshot odds pipeline those use
 * (see momentum.ts header for why): there's no bookmaker price here, just
 * live match statistics. Still creates a minimal Event/Market row per
 * fixture so the resulting Signal can reuse the existing FK shape, delivery
 * pipeline, and Telegram formatting rather than needing a schema migration.
 */

const PROVIDER_NAME = "api-football-momentum";

function buildDedupKey(fixtureId: number, market: "OVER" | "BTTS"): string {
  return `MOMENTUM_PICK:${fixtureId}:${market}`;
}

async function upsertMomentumSignal(
  fixtureId: number,
  fixtureInfo: { homeTeam: string; awayTeam: string; leagueExternalId: number; leagueName: string; leagueCountry: string },
  outcome: Extract<MomentumOutcome, { fires: true }>,
): Promise<string> {
  const dbProvider = await db.provider.upsert({
    where: { name: PROVIDER_NAME },
    create: { name: PROVIDER_NAME },
    update: {},
  });

  const competition = await db.competition.upsert({
    where: { providerId_externalId: { providerId: dbProvider.id, externalId: String(fixtureInfo.leagueExternalId) } },
    create: {
      providerId: dbProvider.id,
      externalId: String(fixtureInfo.leagueExternalId),
      sport: "football",
      country: fixtureInfo.leagueCountry,
      name: fixtureInfo.leagueName,
    },
    update: {},
  });

  // Kickoff can't be read directly from this payload (no timestamp) —
  // approximated from elapsed time, same as the live-odds provider does.
  // Only meaningful at creation: left untouched on update rather than
  // recomputed every tick, since recomputing from "now - elapsed" on every
  // pass would make a stored kickoff drift forward as the match goes on.
  const elapsedMinutes = 90 - outcome.minutesRemaining;
  const event = await db.event.upsert({
    where: { competitionId_externalId: { competitionId: competition.id, externalId: String(fixtureId) } },
    create: {
      competitionId: competition.id,
      externalId: String(fixtureId),
      homeTeam: fixtureInfo.homeTeam,
      awayTeam: fixtureInfo.awayTeam,
      kickoff: new Date(Date.now() - elapsedMinutes * 60_000),
      status: "live",
    },
    update: { status: "live" },
  });

  const marketName = "Pronostic live (stats)";
  const market = await db.market.upsert({
    where: { eventId_externalId: { eventId: event.id, externalId: `${fixtureId}:momentum` } },
    create: { eventId: event.id, externalId: `${fixtureId}:momentum`, type: "momentum_pick", name: marketName, status: "open" },
    update: { lastUpdated: new Date() },
  });

  const marketLabel = outcome.market === "OVER" ? `Over ${outcome.line}` : "BTTS (les deux marquent)";
  const dedupKey = buildDedupKey(fixtureId, outcome.market);
  const score = Math.round(Math.max(0, Math.min(1, outcome.confidence)) * 100);
  const reasonsJson = JSON.parse(JSON.stringify(outcome.reasons));
  const metadata = JSON.parse(
    JSON.stringify({
      market: marketLabel,
      elapsedMinutes: 90 - outcome.minutesRemaining,
      combinedXg: outcome.combinedXg,
      actualGoals: outcome.actualGoals,
      homeTeam: fixtureInfo.homeTeam,
      awayTeam: fixtureInfo.awayTeam,
      homeStats: outcome.homeStats,
      awayStats: outcome.awayStats,
    }),
  );

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });
  let signalId: string;
  if (existing) {
    await db.signal.update({ where: { id: existing.id }, data: { status: "UPDATED", score, reasons: reasonsJson, metadata } });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: { type: "MOMENTUM_PICK", marketId: market.id, dedupKey, score, reasons: reasonsJson, metadata },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] MOMENTUM_PICK ${fixtureInfo.homeTeam} vs ${fixtureInfo.awayTeam} (${fixtureInfo.leagueName}) — ` +
      `${marketLabel}, score ${score}`,
  );
  return signalId;
}

export async function runMomentumPass(): Promise<string[]> {
  console.log("[worker] momentumPass: starting");
  const targetLeagueIds = new Set(getMomentumTargetLeagueIds());
  const config = getMomentumConfig();

  const fixtureInfoById = await fetchLiveFixturesBulk();
  const relevantFixtureIds = [...fixtureInfoById.entries()]
    .filter(([, info]) => targetLeagueIds.has(info.leagueExternalId))
    .map(([fixtureId]) => fixtureId);
  console.log(`[worker] momentumPass: ${fixtureInfoById.size} live fixtures worldwide, ${relevantFixtureIds.length} in target leagues`);

  if (relevantFixtureIds.length === 0) return [];

  const statsRows = await fetchFixturesWithStats(relevantFixtureIds);
  console.log(`[worker] momentumPass: got stats for ${statsRows.length} fixture(s)`);
  const touchedSignalIds: string[] = [];

  for (const row of statsRows) {
    const fixtureInfo = fixtureInfoById.get(row.fixtureId);
    if (!fixtureInfo) continue;

    const outcome = detectMomentumPick(
      { elapsedMinutes: row.elapsedMinutes, home: row.homeStats, away: row.awayStats },
      config,
    );
    if (!outcome.fires) continue;

    touchedSignalIds.push(await upsertMomentumSignal(row.fixtureId, fixtureInfo, outcome));
  }

  console.log(`[worker] momentumPass: done, ${touchedSignalIds.length} pick(s) fired`);
  return touchedSignalIds;
}
