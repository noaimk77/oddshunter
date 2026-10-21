import { db } from "@/lib/db";
import { fetchLiveOddsSnapshot, fetchLiveFixturesBulk, resolveTargetLeagues } from "./providers/apiFootball";
import { detectLiveScorelessPick, type LiveScorelessOutcome } from "./detectors/liveScorelessPick";
import { getLiveScorelessConfig } from "./config";

/**
 * "Still scoreless" live picks (Noaim, 2026-08-23 — inspired by InPlay
 * Alerts' "Timer 6 / Over 0.5 HT all league" format). Deliberately NOT a
 * fixing-detection signal (see liveScorelessPick.ts header) — a plain
 * in-play statistical angle, but run on the SAME target leagues as the real
 * fixing-detection pipeline (India, Bolivia, Paraguay... via
 * resolveTargetLeagues/getIngestTargetCountries), not the mainstream
 * leagues momentum.ts was wrongly scoped to. Reuses api-football-live's own
 * data (fetchLiveOddsSnapshot already carries elapsed minute + live score +
 * live Over/Under prices in one request) so a real price can be attached
 * instead of a placeholder — omitted entirely when we don't have one rather
 * than inventing a number.
 */

const PROVIDER_NAME = "api-football-live-picks";

function buildDedupKey(fixtureId: number, market: "OVER_0_5_HT" | "OVER_0_5_FT"): string {
  return `LIVE_SCORELESS:${fixtureId}:${market}`;
}

/** Real price for this pick's market, if our own live-odds snapshot has it
 *  this pass — never fabricated when absent. */
function findRealPrice(
  markets: { name: string; values: { value: string; odd: number; handicap: string | null; suspended: boolean; main: boolean }[] }[],
  market: "OVER_0_5_HT" | "OVER_0_5_FT",
): number | null {
  const marketName = market === "OVER_0_5_HT" ? "Over/Under (1st Half)" : "Over/Under Line";
  const target = markets.find((m) => m.name === marketName);
  if (!target) return null;
  const value = target.values.find((v) => v.main && v.handicap === "0.5" && v.value === "Over" && !v.suspended);
  return value?.odd ?? null;
}

async function upsertLiveScorelessSignal(
  fixtureId: number,
  fixtureInfo: { homeTeam: string; awayTeam: string; leagueExternalId: number; leagueName: string; leagueCountry: string },
  outcome: Extract<LiveScorelessOutcome, { fires: true }>,
  realPrice: number | null,
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

  const elapsedMinutes = outcome.elapsedMinutes;
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

  const marketLabel = outcome.market === "OVER_0_5_HT" ? "Over 0.5 (mi-temps)" : "Over 0.5 (temps réglementaire)";
  const market = await db.market.upsert({
    where: { eventId_externalId: { eventId: event.id, externalId: `${fixtureId}:live_scoreless:${outcome.market}` } },
    create: {
      eventId: event.id,
      externalId: `${fixtureId}:live_scoreless:${outcome.market}`,
      type: "live_scoreless_pick",
      name: marketLabel,
      status: "open",
    },
    update: { lastUpdated: new Date() },
  });

  const dedupKey = buildDedupKey(fixtureId, outcome.market);
  const score = Math.round(Math.max(0, Math.min(1, outcome.confidence)) * 100);
  const metadata = JSON.parse(
    JSON.stringify({
      market: marketLabel,
      elapsedMinutes,
      homeTeam: fixtureInfo.homeTeam,
      awayTeam: fixtureInfo.awayTeam,
      leagueName: fixtureInfo.leagueName,
      leagueCountry: fixtureInfo.leagueCountry,
      price: realPrice,
    }),
  );

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });
  let signalId: string;
  if (existing) {
    await db.signal.update({
      where: { id: existing.id },
      data: { status: "UPDATED", score, currentPrice: realPrice, metadata },
    });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: { type: "LIVE_SCORELESS_PICK", marketId: market.id, dedupKey, score, reasons: [], currentPrice: realPrice, metadata },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] LIVE_SCORELESS_PICK ${fixtureInfo.homeTeam} vs ${fixtureInfo.awayTeam} (${fixtureInfo.leagueName}) — ` +
      `${marketLabel} @ ${realPrice ?? "?"}, score ${score}`,
  );
  return signalId;
}

export async function runLivePicksPass(): Promise<string[]> {
  console.log("[worker] livePicksPass: starting");
  const config = getLiveScorelessConfig();

  const targetLeagues = await resolveTargetLeagues();
  const targetLeagueIds = new Set(targetLeagues.map((l) => l.id));

  const [snapshots, fixtureInfoById] = await Promise.all([fetchLiveOddsSnapshot(), fetchLiveFixturesBulk()]);
  const relevant = snapshots.filter((s) => {
    const info = fixtureInfoById.get(s.fixtureId);
    return info && targetLeagueIds.has(info.leagueExternalId) && s.elapsedMinutes !== null;
  });
  console.log(`[worker] livePicksPass: ${snapshots.length} live fixtures worldwide, ${relevant.length} in target (obscure) leagues`);

  const touchedSignalIds: string[] = [];
  for (const snapshot of relevant) {
    const fixtureInfo = fixtureInfoById.get(snapshot.fixtureId);
    if (!fixtureInfo || snapshot.elapsedMinutes === null) continue;

    const outcome = detectLiveScorelessPick(
      { elapsedMinutes: snapshot.elapsedMinutes, homeGoals: snapshot.homeGoals, awayGoals: snapshot.awayGoals },
      config,
    );
    if (!outcome.fires) continue;

    const realPrice = findRealPrice(snapshot.markets, outcome.market);
    touchedSignalIds.push(await upsertLiveScorelessSignal(snapshot.fixtureId, fixtureInfo, outcome, realPrice));
  }

  console.log(`[worker] livePicksPass: done, ${touchedSignalIds.length} pick(s) fired`);
  return touchedSignalIds;
}
