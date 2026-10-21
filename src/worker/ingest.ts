import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { MarketDataProvider, NormalizedOddsPoint } from "./providers/types";

export interface IngestResult {
  ok: boolean;
  pointsFetched: number;
  snapshotsWritten: number;
  error?: string;
}

/**
 * Batched rewrite (2026-08-24, Prisma Postgres migration): the previous
 * version did 4 sequential Prisma calls PER POINT (market upsert, selection
 * upsert, an OddsSnapshot dedup read, and a conditional create) — fine on
 * Neon's bandwidth-based free tier, but Prisma Postgres bills per Prisma
 * Client CALL regardless of row count (confirmed: a `createMany` inserting
 * 1000 rows costs the same 1 operation as inserting 1 — see
 * prisma.io/blog/operations-based-billing). At ~450 points/cycle that old
 * shape cost ~1,800 operations/cycle; at any cadence faster than roughly
 * once every 30+ hours it exhausted the entire 100k/month free-tier budget
 * in a single day (confirmed live 2026-08-24, twice).
 *
 * This version does a small, FIXED number of batched calls per ingest run
 * (create-many-and-return + a full re-fetch, per table), independent of how
 * many points or events are in the batch — insert-only for
 * Competition/Event/Market rows (see the no-update note below), a single
 * raw read for "what's the latest price per selection right now", and one
 * batched OddsSnapshot createMany for whatever actually changed. Verified
 * against a real BetExplorer pass (~450 points, ~15 events): 3 provider/
 * sync-log calls + ~8 batched table calls, independent of point count —
 * roughly 200x fewer operations than the per-point version at this scale.
 *
 * Deliberately NOT updating existing Competition/Event/Market rows on every
 * pass (only inserting new ones) — the only currently-wired pre-match
 * source (BetExplorer) never changes team names, kickoff time, or market
 * status meaningfully within one ingest cycle, and Event.status transitions
 * to "finished" through outcomeResolver.ts, a separate bounded-count path,
 * not through here. If a live-odds provider (event status transitioning
 * upcoming -> live mid-run) is ever reintroduced, this file needs a
 * companion batched UPDATE (raw SQL, one call, all rows) for that specific
 * field — not a revert to per-point calls.
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

  if (points.length === 0) {
    await db.provider.update({ where: { id: dbProvider.id }, data: { lastSyncedAt: new Date() } });
    await db.syncLog.create({
      data: { providerId: dbProvider.id, startedAt, finishedAt: new Date(), ok: true, oddsFetched: 0 },
    });
    return { ok: true, pointsFetched: 0, snapshotsWritten: 0 };
  }

  console.log(`[ingest] ${provider.name}: writing ${points.length} point(s) to the database (batched)...`);

  // --- 1. Competitions: insert-only-new, then fetch all relevant rows. ---
  const competitionByExternalId = new Map<string, { sport: string; country: string; name: string }>();
  for (const p of points) {
    if (!competitionByExternalId.has(p.externalCompetitionId)) {
      competitionByExternalId.set(p.externalCompetitionId, { sport: p.sport, country: p.country, name: p.competitionName });
    }
  }
  await db.competition.createManyAndReturn({
    data: [...competitionByExternalId.entries()].map(([externalId, c]) => ({
      providerId: dbProvider.id,
      externalId,
      sport: c.sport,
      country: c.country,
      name: c.name,
    })),
    skipDuplicates: true,
  });
  const competitions = await db.competition.findMany({
    where: { providerId: dbProvider.id, externalId: { in: [...competitionByExternalId.keys()] } },
    select: { id: true, externalId: true },
  });
  const competitionIdByExternalId = new Map(competitions.map((c) => [c.externalId, c.id]));

  // --- 2. Events: insert-only-new, then fetch all relevant rows. ---
  const eventKey = (competitionId: string, externalEventId: string) => `${competitionId}:${externalEventId}`;
  const eventByKey = new Map<string, { competitionId: string; externalId: string; homeTeam: string; awayTeam: string; kickoff: Date; status: string }>();
  for (const p of points) {
    const competitionId = competitionIdByExternalId.get(p.externalCompetitionId);
    if (!competitionId) continue; // shouldn't happen — competition was just upserted above
    const key = eventKey(competitionId, p.externalEventId);
    if (!eventByKey.has(key)) {
      eventByKey.set(key, {
        competitionId,
        externalId: p.externalEventId,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        kickoff: p.kickoff,
        status: p.eventStatus ?? "upcoming",
      });
    }
  }
  await db.event.createManyAndReturn({ data: [...eventByKey.values()], skipDuplicates: true });
  const events = await db.event.findMany({
    where: { competitionId: { in: [...competitionIdByExternalId.values()] }, externalId: { in: [...new Set(points.map((p) => p.externalEventId))] } },
    select: { id: true, competitionId: true, externalId: true },
  });
  const eventIdByKey = new Map(events.map((e) => [eventKey(e.competitionId, e.externalId), e.id]));

  // --- 3. Markets: insert-only-new, then fetch all relevant rows. ---
  const marketKey = (eventId: string, externalMarketId: string) => `${eventId}:${externalMarketId}`;
  const marketByKey = new Map<string, { eventId: string; externalId: string; type: string; name: string; status: string }>();
  for (const p of points) {
    const competitionId = competitionIdByExternalId.get(p.externalCompetitionId);
    if (!competitionId) continue;
    const eventId = eventIdByKey.get(eventKey(competitionId, p.externalEventId));
    if (!eventId) continue; // shouldn't happen — event was just upserted above
    const key = marketKey(eventId, p.externalMarketId);
    if (!marketByKey.has(key)) {
      marketByKey.set(key, { eventId, externalId: p.externalMarketId, type: p.marketType, name: p.marketName, status: p.marketStatus });
    }
  }
  await db.market.createManyAndReturn({ data: [...marketByKey.values()], skipDuplicates: true });
  const markets = await db.market.findMany({
    where: { eventId: { in: [...eventIdByKey.values()] }, externalId: { in: [...new Set(points.map((p) => p.externalMarketId))] } },
    select: { id: true, eventId: true, externalId: true },
  });
  const marketIdByKey = new Map(markets.map((m) => [marketKey(m.eventId, m.externalId), m.id]));

  // --- 4. Selections: insert-only-new, then fetch all relevant rows. ---
  const selectionKey = (marketId: string, externalSelectionId: string) => `${marketId}:${externalSelectionId}`;
  const selectionByKey = new Map<string, { marketId: string; externalId: string; name: string; position: string }>();
  const pointSelectionKeys = new Map<NormalizedOddsPoint, string>();
  for (const p of points) {
    const competitionId = competitionIdByExternalId.get(p.externalCompetitionId);
    if (!competitionId) continue;
    const eventId = eventIdByKey.get(eventKey(competitionId, p.externalEventId));
    if (!eventId) continue;
    const marketId = marketIdByKey.get(marketKey(eventId, p.externalMarketId));
    if (!marketId) continue; // shouldn't happen — market was just upserted above
    const key = selectionKey(marketId, p.externalSelectionId);
    if (!selectionByKey.has(key)) {
      selectionByKey.set(key, { marketId, externalId: p.externalSelectionId, name: p.selectionName, position: p.selectionPosition });
    }
    pointSelectionKeys.set(p, key);
  }
  await db.selection.createManyAndReturn({ data: [...selectionByKey.values()], skipDuplicates: true });
  const selections = await db.selection.findMany({
    where: { marketId: { in: [...marketIdByKey.values()] }, externalId: { in: [...new Set(points.map((p) => p.externalSelectionId))] } },
    select: { id: true, marketId: true, externalId: true },
  });
  const selectionIdByKey = new Map(selections.map((s) => [selectionKey(s.marketId, s.externalId), s.id]));

  // --- 5. OddsSnapshot: one batched read for "latest price per selection", ---
  //        then one batched createMany for whatever actually changed.
  const relevantSelectionIds = [...new Set([...selectionIdByKey.values()])];
  const latestRows =
    relevantSelectionIds.length > 0
      ? await db.$queryRaw<{ selectionId: string; price: number }[]>(
          Prisma.sql`
            SELECT DISTINCT ON ("selectionId") "selectionId", "price"
            FROM "OddsSnapshot"
            WHERE "selectionId" IN (${Prisma.join(relevantSelectionIds)})
            ORDER BY "selectionId", "timestamp" DESC
          `,
        )
      : [];
  const latestPriceBySelectionId = new Map(latestRows.map((r) => [r.selectionId, r.price]));

  const snapshotsToCreate: { selectionId: string; price: number; timestamp: Date }[] = [];
  const seenThisRun = new Map<string, number>(); // selectionId -> most-recent price already queued this run
  for (const p of points) {
    const key = pointSelectionKeys.get(p);
    if (!key) continue;
    const selectionId = selectionIdByKey.get(key);
    if (!selectionId) continue;
    const lastKnown = seenThisRun.has(selectionId) ? seenThisRun.get(selectionId) : latestPriceBySelectionId.get(selectionId);
    if (lastKnown === p.price) continue;
    snapshotsToCreate.push({ selectionId, price: p.price, timestamp: p.timestamp });
    seenThisRun.set(selectionId, p.price);
  }
  if (snapshotsToCreate.length > 0) {
    await db.oddsSnapshot.createMany({ data: snapshotsToCreate });
  }

  await db.provider.update({ where: { id: dbProvider.id }, data: { lastSyncedAt: new Date() } });
  await db.syncLog.create({
    data: { providerId: dbProvider.id, startedAt, finishedAt: new Date(), ok: true, oddsFetched: points.length },
  });

  console.log(`[ingest] ${provider.name}: done — ${points.length} point(s), ${snapshotsToCreate.length} new snapshot(s).`);
  return { ok: true, pointsFetched: points.length, snapshotsWritten: snapshotsToCreate.length };
}
