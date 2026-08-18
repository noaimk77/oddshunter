import { db } from "@/lib/db";
import type { MarketDataProvider, NormalizedOddsPoint } from "./providers/types";

export interface IngestResult {
  ok: boolean;
  pointsFetched: number;
  snapshotsWritten: number;
  error?: string;
}

/**
 * Pulls one provider's current odds and writes them into the normalized
 * Competition/Event/Market/Selection/OddsSnapshot tables the detectors read
 * from (spec section 11: providers → normalized snapshots → detection
 * engine). Every provider run is logged to SyncLog (already modeled in the
 * schema) so a human can see what happened without ever seeing an API key.
 */
export async function ingestFromProvider(provider: MarketDataProvider, sport: string): Promise<IngestResult> {
  const startedAt = new Date();
  const dbProvider = await db.provider.upsert({
    where: { name: provider.name },
    create: { name: provider.name },
    update: {},
  });

  let points: NormalizedOddsPoint[];
  try {
    points = await provider.fetchPreMatchOdds(sport);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await db.syncLog.create({
      data: { providerId: dbProvider.id, startedAt, finishedAt: new Date(), ok: false, errorMessage },
    });
    return { ok: false, pointsFetched: 0, snapshotsWritten: 0, error: errorMessage };
  }

  let snapshotsWritten = 0;
  for (const point of points) {
    const competition = await db.competition.upsert({
      where: { providerId_externalId: { providerId: dbProvider.id, externalId: point.externalCompetitionId } },
      create: {
        providerId: dbProvider.id,
        externalId: point.externalCompetitionId,
        sport: point.sport,
        country: point.country,
        name: point.competitionName,
      },
      update: {},
    });

    const event = await db.event.upsert({
      where: { competitionId_externalId: { competitionId: competition.id, externalId: point.externalEventId } },
      create: {
        competitionId: competition.id,
        externalId: point.externalEventId,
        homeTeam: point.homeTeam,
        awayTeam: point.awayTeam,
        kickoff: point.kickoff,
        status: "upcoming",
      },
      update: { homeTeam: point.homeTeam, awayTeam: point.awayTeam, kickoff: point.kickoff },
    });

    const market = await db.market.upsert({
      where: { eventId_externalId: { eventId: event.id, externalId: point.externalMarketId } },
      create: {
        eventId: event.id,
        externalId: point.externalMarketId,
        type: point.marketType,
        name: point.marketName,
        status: point.marketStatus,
      },
      update: { status: point.marketStatus, lastUpdated: new Date() },
    });

    const selection = await db.selection.upsert({
      where: { marketId_externalId: { marketId: market.id, externalId: point.externalSelectionId } },
      create: {
        marketId: market.id,
        externalId: point.externalSelectionId,
        name: point.selectionName,
        position: point.selectionPosition,
      },
      update: {},
    });

    // Only snapshot on an actual price change — otherwise a poll every
    // WORKER_POLL_INTERVAL_MS would flood OddsSnapshot with identical rows,
    // and the persistence/correction-filter logic in oddsDrop.ts assumes
    // the history reflects real movement, not poll noise.
    const lastSnapshot = await db.oddsSnapshot.findFirst({
      where: { selectionId: selection.id },
      orderBy: { timestamp: "desc" },
    });
    if (!lastSnapshot || lastSnapshot.price !== point.price) {
      await db.oddsSnapshot.create({ data: { selectionId: selection.id, price: point.price, timestamp: point.timestamp } });
      snapshotsWritten++;
    }
  }

  await db.provider.update({ where: { id: dbProvider.id }, data: { lastSyncedAt: new Date() } });
  await db.syncLog.create({
    data: { providerId: dbProvider.id, startedAt, finishedAt: new Date(), ok: true, oddsFetched: points.length },
  });

  return { ok: true, pointsFetched: points.length, snapshotsWritten };
}
