// Next.js loads .env automatically at runtime; this standalone process
// doesn't go through Next, so it needs the same load explicitly — a no-op
// in production (Railway injects env vars directly, no .env file present).
import "dotenv/config";
import { db } from "@/lib/db";
import { withWorkerLock } from "./lib/lock";
import { getOddsDropConfig, getScoreWeights, WORKER_POLL_INTERVAL_MS, INGEST_POLL_INTERVAL_MS, SEND_LIVE_ALERTS } from "./config";
import { detectOddsDrop } from "./detectors/oddsDrop";
import { scoreSignal, type ScoreFactors } from "./detectors/score";
import { ingestFromProvider } from "./ingest";
import type { MarketDataProvider } from "./providers/types";
import { createApiFootballOddsProvider } from "./providers/apiFootball";

/**
 * Odds Hunter worker — the "processus régulier et durable" from spec
 * section 11, deliberately not a Netlify function. Each cycle: fetch real
 * odds from every configured provider (ingest.ts normalizes them into
 * Competition/Event/Market/Selection/OddsSnapshot), then run the pre-match
 * ODDS_DROP detector (the only detector in the V1 acceptance criteria,
 * section 19) and write explainable Signal rows. It never invents a price
 * series: with no provider key set, `getConfiguredProviders()` returns an
 * empty list and this loop is a correct, silent no-op.
 *
 * Mode observation (section 15): SEND_LIVE_ALERTS defaults to false, so
 * this only logs and persists signals — it does not deliver anything to
 * Telegram until that's explicitly turned on and the delivery wiring
 * (bot instance + AlertRule filtering, see telegram/sendAlert.ts) is
 * connected here.
 */

function getConfiguredProviders(): MarketDataProvider[] {
  // Primary V1 source: API-Football, targeting low-scrutiny leagues (see
  // getIngestTargetCountries in config.ts) rather than major commercial
  // leagues (2026-08-18 scope change). Add further adapters here as
  // they're wired (Betfair exchange data arrives through a separate
  // ExchangeDataProvider, not this list; theOddsApi.ts exists but isn't
  // wired in — it only covers major leagues, which is no longer the goal).
  return [createApiFootballOddsProvider()].filter((p) => p.isConfigured());
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

async function runIngestion(): Promise<void> {
  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    console.log("[worker] no odds provider configured — skipping ingestion this cycle.");
    return;
  }
  for (const provider of providers) {
    const result = await ingestFromProvider(provider, "football");
    if (result.ok) {
      console.log(`[worker] ingested ${provider.name}: ${result.pointsFetched} points, ${result.snapshotsWritten} new snapshots`);
    } else {
      console.error(`[worker] ingestion failed for ${provider.name}: ${result.error}`);
    }
  }
}

async function runDetectionPass(): Promise<void> {
  const selections = await db.selection.findMany({
    where: { market: { event: { status: "upcoming" } } },
    include: {
      odds: { orderBy: { timestamp: "asc" } },
      market: { include: { event: true } },
    },
  });

  const oddsDropConfig = getOddsDropConfig();
  const scoreWeights = getScoreWeights();

  for (const selection of selections) {
    if (selection.odds.length < 2) continue;

    const outcome = detectOddsDrop(
      selection.odds.map((o) => ({ price: o.price, timestamp: o.timestamp })),
      oddsDropConfig,
    );
    if (!outcome.fires) continue;

    const hoursToKickoff = (selection.market.event.kickoff.getTime() - Date.now()) / 3_600_000;
    const persistenceMinutes = outcome.persistedForSec / 60;

    // Several factors are placeholder-neutral until their real data source
    // is connected (multi-book, Betfair volume/liquidity, competition
    // tiering, source-accuracy tracking) — logged explicitly in `reasons`
    // via scoreSignal so recalibration later is visible, not silent.
    const factors: ScoreFactors = {
      amplitude: clamp01(outcome.priceChangePct / 20),
      speed: clamp01(outcome.priceChangePct / Math.max(persistenceMinutes, 1) / 10),
      persistence: clamp01(outcome.persistedForSec / (30 * 60)),
      multiBookAgreement: 0,
      volume: 0,
      liquidity: 0,
      proximityToKickoff: clamp01(1 - hoursToKickoff / 48),
      competitionQuality: 0.5,
      marketStatus: 0,
      explainability: 1, // pre-match: no live event context applies
      sourceQuality: 0.5,
    };

    const { score, reasons } = scoreSignal(factors, scoreWeights);
    // Prisma's Json input type doesn't structurally accept a typed array of
    // ScoreReason objects directly — round-tripping through JSON gives a
    // plain value that satisfies it without weakening ScoreReason's type
    // everywhere else it's used.
    const reasonsJson = JSON.parse(JSON.stringify(reasons));
    const dedupKey = `ODDS_DROP:${selection.marketId}:${selection.id}`;

    const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });

    if (existing) {
      await db.signal.update({
        where: { id: existing.id },
        data: { status: "UPDATED", score, reasons: reasonsJson, currentPrice: outcome.currentPrice, priceChangePct: outcome.priceChangePct },
      });
    } else {
      await db.signal.create({
        data: {
          type: "ODDS_DROP",
          marketId: selection.marketId,
          selectionId: selection.id,
          dedupKey,
          score,
          reasons: reasonsJson,
          openingPrice: outcome.openingPrice,
          currentPrice: outcome.currentPrice,
          priceChangePct: outcome.priceChangePct,
        },
      });
    }

    console.log(
      `[worker] ODDS_DROP selection=${selection.id} ${outcome.openingPrice} -> ${outcome.currentPrice} ` +
        `(${outcome.priceChangePct.toFixed(1)}%, score ${score})`,
    );

    if (SEND_LIVE_ALERTS) {
      console.warn("[worker] SEND_LIVE_ALERTS=true but delivery wiring is not connected in this pass yet — no-op.");
    }
  }
}

async function main() {
  console.log(
    `[worker] Odds Hunter worker starting — detection every ${WORKER_POLL_INTERVAL_MS}ms, ` +
      `ingestion every ${INGEST_POLL_INTERVAL_MS}ms, ` +
      `${SEND_LIVE_ALERTS ? "LIVE ALERTS ON" : "mode observation (no alerts sent)"}.`,
  );

  let lastIngestAt = 0;

  for (;;) {
    try {
      const result = await withWorkerLock(async () => {
        // Ingestion hits the real provider API and has a tight daily quota
        // (see apiFootball.ts) — it runs on its own, much slower cadence.
        // Detection just re-reads what's already in the DB, so it can run
        // every cycle for free.
        if (Date.now() - lastIngestAt >= INGEST_POLL_INTERVAL_MS) {
          await runIngestion();
          lastIngestAt = Date.now();
        }
        await runDetectionPass();
      });
      if (typeof result === "object" && "skipped" in result) {
        console.log("[worker] lock held by another instance — skipping this cycle.");
      }
    } catch (err) {
      console.error("[worker] detection pass failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, WORKER_POLL_INTERVAL_MS));
  }
}

main();
