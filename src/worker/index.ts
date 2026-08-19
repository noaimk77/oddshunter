// Next.js loads .env automatically at runtime; this standalone process
// doesn't go through Next, so it needs the same load explicitly — a no-op
// in production (Railway injects env vars directly, no .env file present).
import "dotenv/config";
import type { Bot } from "grammy";
import { db } from "@/lib/db";
import { withWorkerLock } from "./lib/lock";
import {
  getOddsDropConfig,
  getOddsRiseConfig,
  getVigExplosionConfig,
  getMultiBookConfirmationConfig,
  getBetExplorerConfig,
  getScoreWeights,
  WORKER_POLL_INTERVAL_MS,
  INGEST_POLL_INTERVAL_MS,
  SEND_LIVE_ALERTS,
  BETEXPLORER_ENABLED,
} from "./config";
import { detectOddsDrop, type OddsDropOutcome } from "./detectors/oddsDrop";
import { detectOddsRise, type OddsRiseOutcome } from "./detectors/oddsRise";
import { detectVigExplosion } from "./detectors/vigExplosion";
import { detectMarketLock, type MarketStatus } from "./detectors/marketLock";
import { detectMultiBookConfirmation, type BookmakerMove } from "./detectors/multiBookConfirmation";
import { scoreSignal, type ScoreFactors, type ScoreWeights } from "./detectors/score";
import { ingestFromProvider } from "./ingest";
import type { MarketDataProvider } from "./providers/types";
import { createApiFootballOddsProvider } from "./providers/apiFootball";
import { createBetExplorerProvider } from "./providers/betexplorer";
import { createBot } from "./telegram/bot";
import { deliverSignal, type SignalWithContext } from "./telegram/sendAlert";

/**
 * Odds Hunter worker — the long-lived process (not a Netlify function).
 * Each cycle: fetch real odds from every configured provider (ingest.ts
 * normalizes them into Competition/Event/Market/Selection/OddsSnapshot),
 * then run the detection pass (ODDS_DROP, ODDS_RISE, VIG_EXPLOSION,
 * MARKET_LOCK — see runDetectionPass) and write explainable Signal rows.
 * It never invents a price series: with no provider key set,
 * `getConfiguredProviders()` returns an empty list and this loop is a
 * correct, silent no-op.
 *
 * Mode observation: SEND_LIVE_ALERTS defaults to false, so this only logs
 * and persists signals — nothing is delivered to Telegram until that's
 * explicitly turned on.
 */

function getConfiguredProviders(): MarketDataProvider[] {
  // BetExplorer: free, no key, no account — the primary odds source as of
  // 2026-08-19 after API-Football's /odds endpoint turned out to be
  // historical-only on the free tier (see providers/apiFootball.ts header).
  // API-Football stays wired for whenever its current-odds data unlocks.
  const providers: MarketDataProvider[] = [createApiFootballOddsProvider()];
  if (BETEXPLORER_ENABLED) providers.push(createBetExplorerProvider(getBetExplorerConfig()));
  return providers.filter((p) => p.isConfigured());
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

/**
 * Shared scoring for ODDS_DROP / ODDS_RISE — both are the same shape of
 * signal (a persistent, sufficiently large move away from the opening
 * price), just in opposite directions, so they share one upsert path.
 * Several factors are placeholder-neutral until their real data source is
 * connected (multi-book, Betfair volume/liquidity, competition tiering,
 * source-accuracy tracking) — logged explicitly in `reasons` via
 * scoreSignal so recalibration later is visible, not silent.
 */
async function upsertPriceMoveSignal(
  type: "ODDS_DROP" | "ODDS_RISE",
  marketId: string,
  selectionId: string,
  outcome: { openingPrice: number; currentPrice: number; priceChangePct: number; persistedForSec: number },
  hoursToKickoff: number,
  scoreWeights: ScoreWeights,
): Promise<string> {
  const persistenceMinutes = outcome.persistedForSec / 60;
  const factors: ScoreFactors = {
    amplitude: clamp01(Math.abs(outcome.priceChangePct) / 20),
    speed: clamp01(Math.abs(outcome.priceChangePct) / Math.max(persistenceMinutes, 1) / 10),
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
  const reasonsJson = JSON.parse(JSON.stringify(reasons));
  const dedupKey = `${type}:${marketId}:${selectionId}`;

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });

  let signalId: string;
  if (existing) {
    await db.signal.update({
      where: { id: existing.id },
      data: { status: "UPDATED", score, reasons: reasonsJson, currentPrice: outcome.currentPrice, priceChangePct: outcome.priceChangePct },
    });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: {
        type,
        marketId,
        selectionId,
        dedupKey,
        score,
        reasons: reasonsJson,
        openingPrice: outcome.openingPrice,
        currentPrice: outcome.currentPrice,
        priceChangePct: outcome.priceChangePct,
      },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] ${type} selection=${selectionId} ${outcome.openingPrice} -> ${outcome.currentPrice} ` +
      `(${outcome.priceChangePct.toFixed(1)}%, score ${score})`,
  );
  return signalId;
}

/**
 * VIG_EXPLOSION — market-wide, not per-selection (overround only means
 * something as a sum across a market's outcomes). V1 simplification: no
 * time-window/speed tracking yet (see vigExplosion.ts header) — `speed` and
 * `persistence` factors are left at 0 rather than guessed.
 */
async function upsertVigExplosionSignal(
  marketId: string,
  outcome: { openingOverroundPct: number; currentOverroundPct: number; increasePercentPoints: number },
  hoursToKickoff: number,
  scoreWeights: ScoreWeights,
): Promise<string> {
  const factors: ScoreFactors = {
    amplitude: clamp01(outcome.increasePercentPoints / 30),
    speed: 0,
    persistence: 0,
    multiBookAgreement: 0,
    volume: 0,
    liquidity: 0,
    proximityToKickoff: clamp01(1 - hoursToKickoff / 48),
    competitionQuality: 0.5,
    marketStatus: 0,
    explainability: 1,
    sourceQuality: 0.5,
  };

  const { score, reasons } = scoreSignal(factors, scoreWeights);
  const reasonsJson = JSON.parse(JSON.stringify(reasons));
  const dedupKey = `VIG_EXPLOSION:${marketId}`;
  const metadata = { openingOverroundPct: outcome.openingOverroundPct, currentOverroundPct: outcome.currentOverroundPct };

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });

  let signalId: string;
  if (existing) {
    await db.signal.update({ where: { id: existing.id }, data: { status: "UPDATED", score, reasons: reasonsJson, metadata } });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: { type: "VIG_EXPLOSION", marketId, dedupKey, score, reasons: reasonsJson, metadata },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] VIG_EXPLOSION market=${marketId} overround ${outcome.openingOverroundPct.toFixed(1)}% -> ` +
      `${outcome.currentOverroundPct.toFixed(1)}% (score ${score})`,
  );
  return signalId;
}

/**
 * MARKET_LOCK — a pure status signal, not a price movement, so most of the
 * generic ScoreFactors shape doesn't apply (amplitude/speed/persistence are
 * all 0). `marketStatus` is set to its max (1) since the lock IS the
 * signal. With the generic price-move weight profile (marketStatus's
 * default weight is only 0.05) this produces a low score by design — the
 * weights aren't yet split per signal-type; recalibrate once real lock
 * events are observed rather than inventing a second profile now.
 */
async function openMarketLockSignal(
  marketId: string,
  status: MarketStatus,
  hoursToKickoff: number,
  scoreWeights: ScoreWeights,
): Promise<string> {
  const factors: ScoreFactors = {
    amplitude: 0,
    speed: 0,
    persistence: 0,
    multiBookAgreement: 0,
    volume: 0,
    liquidity: 0,
    proximityToKickoff: clamp01(1 - hoursToKickoff / 48),
    competitionQuality: 0.5,
    marketStatus: 1,
    explainability: 1,
    sourceQuality: 0.5,
  };

  const { score, reasons } = scoreSignal(factors, scoreWeights);
  const reasonsJson = JSON.parse(JSON.stringify(reasons));
  const dedupKey = `MARKET_LOCK:${marketId}`;

  const created = await db.signal.create({
    data: { type: "MARKET_LOCK", marketId, dedupKey, score, reasons: reasonsJson, metadata: { status } },
  });

  console.log(`[worker] MARKET_LOCK market=${marketId} status=${status} (score ${score})`);
  return created.id;
}

/** BetExplorer detail markets are named "1X2 (BookmakerName)" — extract the human label when present. */
function bookmakerLabelFromMarketName(marketName: string, fallbackMarketId: string): string {
  const m = marketName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : `market-${fallbackMarketId}`;
}

/**
 * MULTI_BOOK_CONFIRMATION — spec point I. Not tied to one bookmaker's
 * Market row like the price-move signals: it confirms across several
 * independent ones, so it's scored and stored after the main per-market
 * loop has seen every bookmaker's ODDS_DROP outcome for this pass.
 * `multiBookAgreement` is the one real factor here (the others stay at
 * their documented V1 placeholders, same pattern as the other detectors).
 */
async function upsertMultiBookConfirmationSignal(
  eventId: string,
  outcome: { confirmingCount: number; bookmakers: string[]; averagePriceChangePct: number; anchor: BookmakerMove },
  hoursToKickoff: number,
  scoreWeights: ScoreWeights,
): Promise<string> {
  const factors: ScoreFactors = {
    amplitude: clamp01(Math.abs(outcome.averagePriceChangePct) / 20),
    speed: 0,
    persistence: 0,
    multiBookAgreement: clamp01(outcome.confirmingCount / 5),
    volume: 0,
    liquidity: 0,
    proximityToKickoff: clamp01(1 - hoursToKickoff / 48),
    competitionQuality: 0.5,
    marketStatus: 0,
    explainability: 1,
    sourceQuality: 0.5,
  };

  const { score, reasons } = scoreSignal(factors, scoreWeights);
  const reasonsJson = JSON.parse(JSON.stringify(reasons));
  const dedupKey = `MULTI_BOOK_CONFIRMATION:${eventId}`;
  const metadata = {
    confirmingCount: outcome.confirmingCount,
    bookmakers: outcome.bookmakers,
    averagePriceChangePct: outcome.averagePriceChangePct,
  };

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });

  let signalId: string;
  if (existing) {
    await db.signal.update({ where: { id: existing.id }, data: { status: "UPDATED", score, reasons: reasonsJson, metadata } });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: {
        type: "MULTI_BOOK_CONFIRMATION",
        marketId: outcome.anchor.marketId,
        selectionId: outcome.anchor.selectionId,
        dedupKey,
        score,
        reasons: reasonsJson,
        metadata,
      },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] MULTI_BOOK_CONFIRMATION event=${eventId} confirmed by ${outcome.confirmingCount} books ` +
      `(${outcome.bookmakers.join(", ")}), avg ${outcome.averagePriceChangePct.toFixed(1)}% (score ${score})`,
  );
  return signalId;
}

async function runDetectionPass(): Promise<string[]> {
  const markets = await db.market.findMany({
    where: { event: { status: "upcoming" } },
    include: {
      event: { include: { competition: true } },
      selections: { include: { odds: { orderBy: { timestamp: "asc" } } } },
    },
  });

  const oddsDropConfig = getOddsDropConfig();
  const oddsRiseConfig = getOddsRiseConfig();
  const vigExplosionConfig = getVigExplosionConfig();
  const multiBookConfig = getMultiBookConfirmationConfig();
  const scoreWeights = getScoreWeights();

  // Grouped by (eventId, marketType, position) so bookmaker-independent
  // moves on "the same real-world outcome" can be cross-referenced after
  // every market has been visited — see upsertMultiBookConfirmationSignal.
  const dropsByEventPosition = new Map<string, { eventId: string; kickoff: Date; moves: BookmakerMove[] }>();

  // Rejected-by-filter counts (spec: quality stats even without a schema
  // change for a full rejected-signal table) — one summary line per pass
  // rather than a log line per selection, so it stays readable.
  const rejectionCounts: Record<string, number> = {};
  const countRejection = (detector: string, reason: string) => {
    const key = `${detector}:${reason}`;
    rejectionCounts[key] = (rejectionCounts[key] ?? 0) + 1;
  };

  const touchedSignalIds: string[] = [];

  for (const market of markets) {
    const hoursToKickoff = (market.event.kickoff.getTime() - Date.now()) / 3_600_000;

    for (const selection of market.selections) {
      if (selection.odds.length < 2) continue;
      const priceHistory = selection.odds.map((o) => ({ price: o.price, timestamp: o.timestamp }));

      const dropOutcome: OddsDropOutcome = detectOddsDrop(priceHistory, oddsDropConfig);
      if (dropOutcome.fires) {
        touchedSignalIds.push(
          await upsertPriceMoveSignal("ODDS_DROP", market.id, selection.id, dropOutcome, hoursToKickoff, scoreWeights),
        );

        const groupKey = `${market.event.id}:${market.type}:${selection.position}`;
        const group = dropsByEventPosition.get(groupKey) ?? { eventId: market.event.id, kickoff: market.event.kickoff, moves: [] };
        group.moves.push({
          marketId: market.id,
          selectionId: selection.id,
          bookmakerLabel: bookmakerLabelFromMarketName(market.name, market.id),
          priceChangePct: dropOutcome.priceChangePct,
        });
        dropsByEventPosition.set(groupKey, group);
      } else {
        countRejection("ODDS_DROP", dropOutcome.reason);
      }

      const riseOutcome: OddsRiseOutcome = detectOddsRise(priceHistory, oddsRiseConfig);
      if (riseOutcome.fires) {
        touchedSignalIds.push(
          await upsertPriceMoveSignal("ODDS_RISE", market.id, selection.id, riseOutcome, hoursToKickoff, scoreWeights),
        );
      } else {
        countRejection("ODDS_RISE", riseOutcome.reason);
      }
    }

    const selectionHistories = market.selections
      .filter((s) => s.odds.length > 0)
      .map((s) => ({ selectionId: s.id, history: s.odds.map((o) => ({ price: o.price, timestamp: o.timestamp })) }));
    const vigOutcome = detectVigExplosion(selectionHistories, vigExplosionConfig);
    if (vigOutcome.fires) {
      touchedSignalIds.push(await upsertVigExplosionSignal(market.id, vigOutcome, hoursToKickoff, scoreWeights));
    } else {
      countRejection("VIG_EXPLOSION", vigOutcome.reason);
    }

    const existingLock = await db.signal.findFirst({
      where: { type: "MARKET_LOCK", marketId: market.id, status: { in: ["OPEN", "UPDATED"] } },
    });
    const lockAction = detectMarketLock(market.status as MarketStatus, Boolean(existingLock));
    if (lockAction.action === "open_signal") {
      touchedSignalIds.push(await openMarketLockSignal(market.id, market.status as MarketStatus, hoursToKickoff, scoreWeights));
    } else if (lockAction.action === "resolve_signal" && existingLock) {
      await db.signal.update({ where: { id: existingLock.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
      console.log(`[worker] MARKET_LOCK resolved market=${market.id} (status back to open)`);
    }
  }

  for (const group of dropsByEventPosition.values()) {
    const outcome = detectMultiBookConfirmation(group.moves, multiBookConfig);
    if (outcome.fires) {
      const hoursToKickoff = (group.kickoff.getTime() - Date.now()) / 3_600_000;
      touchedSignalIds.push(
        await upsertMultiBookConfirmationSignal(group.eventId, outcome, hoursToKickoff, scoreWeights),
      );
    } else {
      countRejection("MULTI_BOOK_CONFIRMATION", outcome.reason);
    }
  }

  const rejectionSummary = Object.entries(rejectionCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (rejectionSummary) console.log(`[worker] detection pass rejections — ${rejectionSummary}`);

  return touchedSignalIds;
}

// Lazily constructed so mode observation (the default) never requires a
// valid TELEGRAM_BOT_TOKEN — the same "fail soft, never crash the loop"
// pattern as getConfiguredProviders() above.
let cachedBot: Bot | null | undefined;
function getBotForDelivery(): Bot | null {
  if (cachedBot !== undefined) return cachedBot;
  try {
    cachedBot = createBot();
  } catch (err) {
    console.error(
      "[worker] SEND_LIVE_ALERTS is true but the Telegram bot could not be created — alerts will not be delivered this cycle.",
      err,
    );
    cachedBot = null;
  }
  return cachedBot;
}

/**
 * Delivers only the signals actually created/updated THIS pass — not every
 * open signal in the database. Re-running deliverSignal for an unchanged
 * signal every cycle would either spam an identical Telegram edit (harmless
 * but noisy) or hit Telegram's "message not modified" error; scoping to
 * touched signals keeps delivery exactly aligned with real changes.
 */
async function deliverTouchedSignals(signalIds: string[]): Promise<void> {
  const bot = getBotForDelivery();
  if (!bot) return;

  const signals = await db.signal.findMany({
    where: { id: { in: signalIds } },
    include: {
      market: { include: { event: { include: { competition: true } } } },
      selection: true,
    },
  });

  for (const signal of signals) {
    const context: SignalWithContext = {
      id: signal.id,
      type: signal.type,
      score: signal.score,
      reasons: (signal.reasons as { label: string; contribution: number }[] | null) ?? [],
      openingPrice: signal.openingPrice,
      currentPrice: signal.currentPrice,
      priceChangePct: signal.priceChangePct,
      firstDetectedAt: signal.firstDetectedAt,
      market: {
        name: signal.market.name,
        type: signal.market.type,
        status: signal.market.status,
        event: {
          homeTeam: signal.market.event.homeTeam,
          awayTeam: signal.market.event.awayTeam,
          kickoff: signal.market.event.kickoff,
          status: signal.market.event.status,
          competition: { name: signal.market.event.competition.name, sport: signal.market.event.competition.sport },
        },
      },
      selection: signal.selection ? { name: signal.selection.name } : null,
    };
    await deliverSignal(db, bot, context);
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
        const touchedSignalIds = await runDetectionPass();
        if (SEND_LIVE_ALERTS && touchedSignalIds.length > 0) {
          await deliverTouchedSignals(touchedSignalIds);
        }
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
