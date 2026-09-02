// Next.js loads .env automatically at runtime; this standalone process
// doesn't go through Next, so it needs the same load explicitly — a no-op
// in production (Railway injects env vars directly, no .env file present).
import "dotenv/config";
import type { Bot } from "grammy";
import { db } from "@/lib/db";

// tesseract.js's underlying worker_threads Worker occasionally emits a raw
// "error" event (seen on truncated/corrupted image downloads) that bypasses
// the recognize() promise entirely — an ordinary try/catch around the OCR
// call never sees it, and Node's default behavior for an unhandled "error"
// event is to crash the process. One bad image shouldn't take down alert
// delivery and the odds engine along with it, so this is a deliberate,
// narrowly-justified safety net for a 24/7 background service — log and
// keep running rather than let a single-image quirk cause a full outage.
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception — logged, worker keeps running:", err);
});

// Same reasoning as uncaughtException above, but for the other crash path:
// since Node 15, an unhandled promise rejection terminates the process by
// default (it used to just print a deprecation warning) — confirmed this
// process was NOT catching that case (2026-08-25 reliability audit), only
// synchronous throws. Every async call site in this codebase is already
// wrapped in its own try/catch, but a single missed `await` or a
// fire-and-forget promise anywhere (including in a dependency) would still
// take the whole 24/7 worker down without this. Same policy: log, don't
// crash — an individual failed operation already has its own error
// handling; this is only the last-resort net under that.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled promise rejection — logged, worker keeps running:", reason);
});
import { withWorkerLock } from "./lib/lock";
import {
  getOddsDropConfig,
  getOddsRiseConfig,
  getVigExplosionConfig,
  getMultiBookConfirmationConfig,
  getValueBetConfig,
  getBetExplorerConfig,
  getScoreWeights,
  getFixingOddsRange,
  getMinScoreToAlert,
  WORKER_POLL_INTERVAL_MS,
  INGEST_POLL_INTERVAL_MS,
  SEND_LIVE_ALERTS,
  SEND_LEGACY_DETECTOR_ALERTS,
  SEND_SUSPICIOUS_ALERTS,
  SEND_TIP_CONSENSUS_ALERTS,
  BETEXPLORER_ENABLED,
  STRATEGY_POLL_INTERVAL_MS,
} from "./config";
import { detectOddsDrop, type OddsDropOutcome } from "./detectors/oddsDrop";
import { detectOddsRise, type OddsRiseOutcome } from "./detectors/oddsRise";
import { detectVigExplosion } from "./detectors/vigExplosion";
import { detectMarketLock, type MarketStatus } from "./detectors/marketLock";
import { detectMultiBookConfirmation, type BookmakerMove } from "./detectors/multiBookConfirmation";
import { detectValueBet, type BookmakerPrice } from "./detectors/valueBet";
import { scoreSignal, VALUE_BET_SCORE_WEIGHTS, type ScoreFactors, type ScoreWeights } from "./detectors/score";
import { ingestFromProvider } from "./ingest";
import { resolvePendingOutcomes } from "./outcomeResolver";
import { resolvePendingConsensusOutcomes } from "./telegram/consensusOutcomeResolver";
import type { TelegramClient } from "telegram";

// Shared handle so the outcome resolver in the main loop can post replies
// via the same MTProto client the tip listener owns. Assigned once when
// startTipConsensusListener() successfully connects; stays null if that
// subsystem failed to boot (in which case the resolver just no-ops).
let tipUserClient: TelegramClient | null = null;
import type { MarketDataProvider } from "./providers/types";
import { createBetExplorerProvider } from "./providers/betexplorer";
import { createBot } from "./telegram/bot";
import { deliverSignal } from "./telegram/sendAlert";
import { deliverSuspiciousSignal } from "./telegram/suspiciousFeed";
import { buildSignalContext } from "./telegram/signalContext";
import { runLiveTriggerPass, runHTResultPass } from "./strategies/strategyRunner";
import { createUserClient, isUserClientConfigured } from "./telegram/userClient";
import { startTipListener } from "./telegram/tipListener";

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
  // BetExplorer only (2026-08-24, Neon->Prisma Postgres migration): both
  // API-Football odds providers were removed from ingestion.
  //
  // createApiFootballLiveOddsProvider() fetches every live fixture worldwide
  // (~100+ matches) and writes every handicap line into OddsSnapshot every
  // cycle. createApiFootballOddsProvider() (pre-match, 30 resolved leagues
  // across the target countries) is just as bad in practice — confirmed live
  // right after this migration: a single pass wrote 3,467 points, which at
  // even a slowed 15-minute cadence would exhaust Prisma Postgres's free-tier
  // 100k-operations/month quota in hours, not weeks (each point costs several
  // DB operations: market/selection upsert + an OddsSnapshot dedup read every
  // cycle regardless of whether the price changed).
  //
  // Neither one feeds anything currently delivered: that data only reaches
  // the legacy ODDS_DROP/ODDS_RISE/etc detectors, whose Telegram delivery has
  // been off since SEND_LEGACY_DETECTOR_ALERTS was introduced (2026-08-23
  // pivot). The actual live product (strategies/strategyRunner.ts) fetches
  // its own odds directly per-fixture (see strategies/liveOdds.ts) and never
  // reads OddsSnapshot at all.
  //
  // BetExplorer stays: it's explicitly bounded (maxDetailFetchesPerCycle: 8,
  // see providers/betexplorer.ts) rather than a blanket per-country/per-league
  // fetch, so its operation cost per cycle is in the hundreds, not thousands.
  //
  // If the legacy fixing-detection pipeline is wanted again as a real,
  // delivered feature (not just idle data collection), it needs its own
  // deliberately-bounded re-introduction (e.g. a handful of leagues, a much
  // longer cadence, or a points-per-cycle cap) — not just re-adding this
  // provider at face value.
  const providers: MarketDataProvider[] = [];
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
    console.log(`[worker] ingestion: starting ${provider.name}...`);
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

/** BetExplorer detail markets are named "1X2 (BookmakerName)" — extract the
 *  bookmaker label when present. Returns null when the name has no trailing
 *  `(...)` suffix (i.e. it's a consensus/aggregate market from a source
 *  that doesn't split by book, e.g. BetExplorer's dropping-odds triage feed
 *  or api-football-live). Never invent a name; the caller decides what to
 *  do with a null (e.g. skip from multi-book aggregation entirely — see
 *  bug 2026-08-23 where 3 different Over/Under handicap lines were falsely
 *  attributed as "3 confirming bookmakers" with placeholder market-<id>
 *  labels in the message). */
function bookmakerLabelFromMarketName(marketName: string): string | null {
  const m = marketName.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : null;
}

/** Strips the trailing `(BookmakerName)` from a market name so two markets
 *  that name the same real-world bet at different books ("1X2 (Marathonbet)"
 *  vs "1X2 (Pinnacle)") share a grouping key, while two markets that name
 *  genuinely different bets ("Over/Under Line 1.75" vs "Over/Under Line
 *  2.25") stay distinct. Used to build the multi-book / value-bet grouping
 *  key — the previous grouping key used only `market.type`, which for
 *  over_under_live merged every handicap line into one bucket and produced
 *  the false "Confirmé par 3 bookmakers" alert on Cesar Vallejo. */
function marketFamilyKey(marketName: string): string {
  return marketName.replace(/\s*\([^)]+\)\s*$/, "");
}

/**
 * Bookmaker pool restricted to books actually associated with syndicate/
 * fixing-related action (Noaim, 2026-08-23: "ce n'est pas là qu'on trouve
 * les paris truqués" re: Unibet/Stake). Western regulated retail books
 * (Unibet, bet365, William Hill, bwin, Fanduel, 888Sport, Superbet) KYC and
 * limit suspicious accounts fast — they're not where that money shows up.
 * Crypto casinos (Stake.com, Duelbits, Rainbet, Roobet, N1 Bet) are a
 * different, unverified profile, excluded for now pending confirmation.
 * Pinnacle stays in even though it's not "offshore" — it's the VALUE_BET
 * reference price, not a confirming book, and needs to survive this filter
 * for that comparison to work at all. Sourced from the actual bookmaker pool
 * seen in production 2026-08-23 (see chat) — SBO/1xBet/Dafabet/Marathonbet/
 * Megapari/Mozzartbet are the offshore, Asian-handicap-style books in that
 * pool historically tied to match-fixing investigations.
 */
const SHARP_BOOKMAKER_LABELS = new Set(["SBO", "1xBet", "Dafabet", "Marathonbet", "Megapari", "Mozzartbet", "Pinnacle"]);

/**
 * True only when this market names a specific, non-sharp bookmaker — e.g.
 * "1X2 (Unibet)". BetExplorer's triage-level markets (plain "1X2", no
 * parens — the dropping-odds consensus feed that most ODDS_DROP signals
 * come from) have no single bookmaker attached and must NOT be filtered
 * here; bookmakerLabelFromMarketName's `market-<id>` fallback for those
 * would otherwise never match the whitelist and silently kill that whole
 * detection path.
 */
function isExcludedBookmakerMarket(marketName: string): boolean {
  const m = marketName.match(/\(([^)]+)\)\s*$/);
  return m !== null && !SHARP_BOOKMAKER_LABELS.has(m[1]);
}

/**
 * MULTI_BOOK_CONFIRMATION — spec point I. Not tied to one bookmaker's
 * Market row like the price-move signals: it confirms across several
 * independent ones, so it's scored and stored after the main per-market
 * loop has seen every bookmaker's ODDS_DROP outcome for this pass.
 *
 * `speed` here is the real substitute for a staked-amount figure we can't
 * get (no exchange/matched-volume access in France) — several independent
 * books moving the same way AND fast is the closest legitimate proxy for
 * "real money, not noise" (Noaim, 2026-08-22). Faster = higher speed, so
 * this inverts fastestPersistedForSec rather than reusing ODDS_DROP's
 * per-minute-rate formula, which would reward a slow-but-huge move instead.
 */
async function upsertMultiBookConfirmationSignal(
  eventId: string,
  outcome: {
    confirmingCount: number;
    bookmakers: string[];
    averagePriceChangePct: number;
    anchor: BookmakerMove;
    fastestPersistedForSec: number;
    firstMoverBookmaker: string;
    firstMoverPersistedForSec: number;
  },
  hoursToKickoff: number,
  scoreWeights: ScoreWeights,
): Promise<string> {
  const factors: ScoreFactors = {
    amplitude: clamp01(Math.abs(outcome.averagePriceChangePct) / 20),
    speed: clamp01(1 - outcome.fastestPersistedForSec / (15 * 60)),
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
    fastestPersistedForSec: outcome.fastestPersistedForSec,
    firstMoverBookmaker: outcome.firstMoverBookmaker,
    firstMoverPersistedForSec: outcome.firstMoverPersistedForSec,
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
      `(${outcome.bookmakers.join(", ")}), avg ${outcome.averagePriceChangePct.toFixed(1)}% in ` +
      `${(outcome.fastestPersistedForSec / 60).toFixed(1)}min (score ${score})`,
  );
  return signalId;
}

/**
 * VALUE_BET — a bookmaker priced meaningfully above Pinnacle's reference on
 * the same real-world outcome. Grouped the same way as MULTI_BOOK_CONFIRMATION
 * (by event/marketType/position, not tied to one bookmaker's Market row),
 * since finding Pinnacle's price for the same outcome across separate
 * per-bookmaker Market rows needs the same cross-referencing. `amplitude`
 * is the edge itself; every other factor stays at the same V1 placeholder
 * every other detector uses until real outcome data justifies a different
 * weighting (Noaim, 2026-08-22 — "les meilleures, tu n'en vas pas trop":
 * enforced downstream by getMinScoreToAlert(), not a hardcoded count here).
 */
async function upsertValueBetSignal(
  eventId: string,
  outcome: { referenceBookmaker: string; referencePrice: number; bestBookmaker: string; bestPrice: number; edgePercent: number; marketId: string; selectionId: string },
  hoursToKickoff: number,
): Promise<string> {
  const factors: ScoreFactors = {
    amplitude: clamp01(outcome.edgePercent / 30),
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

  const { score, reasons } = scoreSignal(factors, VALUE_BET_SCORE_WEIGHTS);
  const reasonsJson = JSON.parse(JSON.stringify(reasons));
  const dedupKey = `VALUE_BET:${eventId}:${outcome.bestBookmaker}`;
  const metadata = {
    referenceBookmaker: outcome.referenceBookmaker,
    referencePrice: outcome.referencePrice,
    bestBookmaker: outcome.bestBookmaker,
    bestPrice: outcome.bestPrice,
    edgePercent: outcome.edgePercent,
  };

  const existing = await db.signal.findFirst({ where: { dedupKey, status: { in: ["OPEN", "UPDATED"] } } });

  let signalId: string;
  if (existing) {
    await db.signal.update({
      where: { id: existing.id },
      data: { status: "UPDATED", score, reasons: reasonsJson, currentPrice: outcome.bestPrice, metadata },
    });
    signalId = existing.id;
  } else {
    const created = await db.signal.create({
      data: {
        type: "VALUE_BET",
        marketId: outcome.marketId,
        selectionId: outcome.selectionId,
        dedupKey,
        score,
        reasons: reasonsJson,
        currentPrice: outcome.bestPrice,
        metadata,
      },
    });
    signalId = created.id;
  }

  console.log(
    `[worker] VALUE_BET event=${eventId} ${outcome.bestBookmaker} @ ${outcome.bestPrice} vs ` +
      `${outcome.referenceBookmaker} @ ${outcome.referencePrice} (+${outcome.edgePercent.toFixed(1)}%, score ${score})`,
  );
  return signalId;
}

async function runDetectionPass(): Promise<string[]> {
  const markets = await db.market.findMany({
    // "live" added 2026-08-22 — the live-odds provider (apiFootball.ts)
    // writes in-play Over/Under snapshots tagged eventStatus: "live", but
    // this query excluded anything not "upcoming" from the moment that
    // shipped, so every live snapshot was stored and never once evaluated
    // by a detector. Confirmed and fixed same day, no live signal had
    // fired yet.
    where: { event: { status: { in: ["upcoming", "live"] } } },
    include: {
      event: { include: { competition: true } },
      selections: { include: { odds: { orderBy: { timestamp: "asc" } } } },
    },
  });

  const oddsDropConfig = getOddsDropConfig();
  const oddsRiseConfig = getOddsRiseConfig();
  const vigExplosionConfig = getVigExplosionConfig();
  const multiBookConfig = getMultiBookConfirmationConfig();
  const valueBetConfig = getValueBetConfig();
  const scoreWeights = getScoreWeights();
  const fixingOddsRange = getFixingOddsRange();

  // Grouped by (eventId, marketType, position) so bookmaker-independent
  // moves on "the same real-world outcome" can be cross-referenced after
  // every market has been visited — see upsertMultiBookConfirmationSignal.
  const dropsByEventPosition = new Map<string, { eventId: string; kickoff: Date; moves: BookmakerMove[] }>();

  // Same grouping key, but every bookmaker's CURRENT price (not just ones
  // with a drop this pass) — VALUE_BET needs the whole group to find
  // Pinnacle's price and compare it against every other book at once.
  const currentPricesByEventPosition = new Map<string, { eventId: string; kickoff: Date; prices: BookmakerPrice[] }>();

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
    if (isExcludedBookmakerMarket(market.name)) {
      countRejection("ALL", "non_sharp_bookmaker");
      continue;
    }
    const hoursToKickoff = (market.event.kickoff.getTime() - Date.now()) / 3_600_000;

    // Groups per real bet, not per market row. `marketFamilyKey` strips the
    // trailing "(BookmakerName)" so per-bookmaker rows on the same 1X2/OU
    // line converge, while different OU handicap lines (Over 1.75 vs Over
    // 2.25) stay in distinct groups — see the fix comment on marketFamilyKey.
    const bookmakerLabel = bookmakerLabelFromMarketName(market.name);
    const familyKey = marketFamilyKey(market.name);

    for (const selection of market.selections) {
      if (selection.odds.length === 0) continue;

      const valueGroupKey = `${market.event.id}:${market.type}:${familyKey}:${selection.position}`;
      const valueGroup =
        currentPricesByEventPosition.get(valueGroupKey) ?? { eventId: market.event.id, kickoff: market.event.kickoff, prices: [] };
      // VALUE_BET compares real bookmakers against Pinnacle's reference —
      // consensus/aggregate rows (no identifiable book) would poison that
      // comparison, so they don't enter the pool.
      if (bookmakerLabel !== null) {
        valueGroup.prices.push({
          bookmakerLabel,
          marketId: market.id,
          selectionId: selection.id,
          price: selection.odds[selection.odds.length - 1].price,
        });
        currentPricesByEventPosition.set(valueGroupKey, valueGroup);
      }

      if (selection.odds.length < 2) continue;
      const priceHistory = selection.odds.map((o) => ({ price: o.price, timestamp: o.timestamp }));

      const openingPrice = [...priceHistory].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0].price;
      if (openingPrice < fixingOddsRange.min || openingPrice > fixingOddsRange.max) {
        countRejection("PRICE_MOVE", "odds_outside_fixing_range");
        continue;
      }

      const dropOutcome: OddsDropOutcome = detectOddsDrop(priceHistory, oddsDropConfig);
      if (dropOutcome.fires) {
        touchedSignalIds.push(
          await upsertPriceMoveSignal("ODDS_DROP", market.id, selection.id, dropOutcome, hoursToKickoff, scoreWeights),
        );

        // Multi-book confirmation only counts markets with an IDENTIFIABLE
        // bookmaker. Consensus rows have no bookmaker attribution, so
        // aggregating N of them into "Confirmé par N bookmakers" would be
        // false — they aren't independent evidence at all.
        if (bookmakerLabel !== null) {
          const groupKey = `${market.event.id}:${market.type}:${familyKey}:${selection.position}`;
          const group = dropsByEventPosition.get(groupKey) ?? { eventId: market.event.id, kickoff: market.event.kickoff, moves: [] };
          group.moves.push({
            marketId: market.id,
            selectionId: selection.id,
            bookmakerLabel,
            priceChangePct: dropOutcome.priceChangePct,
            persistedForSec: dropOutcome.persistedForSec,
          });
          dropsByEventPosition.set(groupKey, group);
        }
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

  for (const group of currentPricesByEventPosition.values()) {
    const outcome = detectValueBet(group.prices, valueBetConfig);
    if (outcome.fires) {
      const hoursToKickoff = (group.kickoff.getTime() - Date.now()) / 3_600_000;
      touchedSignalIds.push(await upsertValueBetSignal(group.eventId, outcome, hoursToKickoff));
    } else {
      countRejection("VALUE_BET", outcome.reason);
    }
  }

  const rejectionSummary = Object.entries(rejectionCounts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  if (rejectionSummary) console.log(`[worker] detection pass rejections — ${rejectionSummary}`);

  return touchedSignalIds;
}

// Single shared instance: created once and long-polled from main() so
// incoming commands (/start, /status, /help...) are actually received —
// creating a Bot object alone only registers handlers, it does not listen
// until .start() is called. This same instance is reused for outbound
// delivery below, rather than constructing a second one, since Telegram
// only allows one active getUpdates connection per bot token at a time.
let sharedBot: Bot | null = null;

async function startTelegramBot(): Promise<void> {
  try {
    sharedBot = createBot();
  } catch (err) {
    console.error(
      "[worker] Telegram bot could not be created (TELEGRAM_BOT_TOKEN missing/invalid) — " +
        "/start and alert delivery are both unavailable this run.",
      err,
    );
    return;
  }

  // Long-polls Telegram indefinitely — deliberately not awaited, so this
  // runs alongside the detection loop rather than blocking it. Errors here
  // (e.g. a transient network drop) are logged, not fatal to the worker.
  sharedBot
    .start({ onStart: () => console.log("[worker] Telegram bot listening for commands (long polling).") })
    .catch((err) => console.error("[worker] Telegram bot polling stopped unexpectedly", err));
}

function getBotForDelivery(): Bot | null {
  return sharedBot;
}

/**
 * Separate pipeline from the odds-movement bot above: connects as Noaim's
 * personal Telegram account (MTProto, not the bot API) and listens across
 * every group it belongs to. A no-op when the session isn't configured, so
 * a deploy without TELEGRAM_USER_SESSION set just skips this feature rather
 * than crashing the whole worker.
 */
async function startTipConsensusListener(): Promise<void> {
  if (!isUserClientConfigured()) {
    console.log("[worker] tip consensus listener disabled — TELEGRAM_USER_SESSION not configured.");
    return;
  }
  try {
    const client = createUserClient();
    // Wrap the whole bootstrap in a hard 45s timeout: gramjs's connect()
    // + getDialogs() silently hangs on an invalidated / stale session
    // (Noaim, 2026-08-28 — AUTH_KEY_DUPLICATED cases where the client
    // never errored, never resolved, and blocked main() from reaching the
    // detection loop). We'd rather log a startup failure and let the rest
    // of the worker run than lose delivery entirely because of one dead
    // subsystem.
    const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
      ]);

    await withTimeout(client.connect(), 15_000, "gramjs connect");
    // gramjs needs each channel's entity/access_hash cached before it can
    // deliver live NewMessage updates for it — a channel the client has
    // never resolved (freshly joined, or just never queried since this
    // process started) silently drops its updates instead of erroring, so
    // this went unnoticed until real picks from newly-added channels never
    // reached consensus. getDialogs() resolves and caches every joined
    // chat/channel up front so none of them are missed (Noaim, 2026-08-26 —
    // confirmed via a manual getMessages() pull showing real posts in
    // FixOdds888/STRANGE GAME FINDER that the live listener never saw).
    const dialogs = await withTimeout(client.getDialogs({ limit: 500 }), 30_000, "gramjs getDialogs");
    startTipListener(client, db);
    tipUserClient = client;
    console.log(
      `[worker] tip consensus listener connected — ${dialogs.length} chats/channels cached — ${SEND_TIP_CONSENSUS_ALERTS ? "LIVE" : "mode observation (no repost)"}.`,
    );

    // Watchdog + dialog-cache refresh on one timer (every 5 min). Two jobs:
    //   1) Reliability — verify the listener is actually alive. gramjs's
    //      own autoReconnect handles the common case, but if the client
    //      ends up wedged (disconnected and not recovering), getDialogs()
    //      throws. Three consecutive failures (~15 min dead) means the
    //      subsystem is unrecoverable in place, so we exit(1) and let Fly
    //      restart the machine with a fresh connection — far better than a
    //      "healthy" process that silently ingests nothing for hours.
    //   2) Freshness — Noaim keeps adding tip channels between deploys; a
    //      channel joined after connect stays uncached (its updates silently
    //      dropped) until getDialogs() resolves it, so refreshing here picks
    //      up new channels within 5 min instead of needing a redeploy.
    let watchdogFailures = 0;
    setInterval(async () => {
      try {
        if (!client.connected) {
          console.warn("[worker] tip listener disconnected — reconnecting…");
          await withTimeout(client.connect(), 15_000, "gramjs reconnect");
        }
        await withTimeout(client.getDialogs({ limit: 500 }), 30_000, "gramjs getDialogs refresh");
        watchdogFailures = 0;
      } catch (err) {
        watchdogFailures += 1;
        console.error(`[worker] tip listener watchdog failure ${watchdogFailures}/3`, err);
        if (watchdogFailures >= 3) {
          console.error("[worker] tip listener unrecoverable — exiting so Fly restarts the machine with a fresh connection");
          process.exit(1);
        }
      }
    }, 5 * 60_000);
  } catch (err) {
    console.error("[worker] tip consensus listener failed to start", err);
  }
}

/**
 * Delivers only the signals actually created/updated THIS pass — not every
 * open signal in the database. Re-running deliverSignal for an unchanged
 * signal every cycle would either spam an identical Telegram edit (harmless
 * but noisy) or hit Telegram's "message not modified" error; scoping to
 * touched signals keeps delivery exactly aligned with real changes.
 *
 * Below `getMinScoreToAlert()`, a signal is detected, scored, and stored
 * like any other — it's just not worth interrupting a paying subscriber
 * for. Filtering here (not earlier) means a weak signal that later
 * strengthens past the threshold on a subsequent pass still gets delivered
 * once it's actually worth sending.
 *
 * ODDS_RISE is excluded from delivery entirely (still detected and stored,
 * same as anything below the score bar) — a price rising on one side of a
 * market is just the mirror of the corresponding ODDS_DROP on the other
 * side of the same market; it's not independent information, just the same
 * real move reported twice (Noaim, 2026-08-22: "ça n'a aucun intérêt si la
 * cote augmente").
 */
async function deliverTouchedSignals(signalIds: string[]): Promise<void> {
  const bot = getBotForDelivery();
  if (!bot) return;

  const minScore = getMinScoreToAlert();
  const signals = await db.signal.findMany({
    where: { id: { in: signalIds }, score: { gte: minScore }, type: { not: "ODDS_RISE" } },
    include: {
      market: { include: { event: { include: { competition: true } } } },
      selection: true,
    },
  });

  for (const signal of signals) {
    const context = await buildSignalContext(db, {
      signal: {
        id: signal.id,
        type: signal.type,
        score: signal.score,
        reasons: signal.reasons,
        openingPrice: signal.openingPrice,
        currentPrice: signal.currentPrice,
        priceChangePct: signal.priceChangePct,
        metadata: signal.metadata,
        firstDetectedAt: signal.firstDetectedAt,
        selectionId: signal.selectionId,
      },
      market: { name: signal.market.name, type: signal.market.type, status: signal.market.status },
      event: {
        id: signal.market.event.id,
        homeTeam: signal.market.event.homeTeam,
        awayTeam: signal.market.event.awayTeam,
        kickoff: signal.market.event.kickoff,
        status: signal.market.event.status,
      },
      competition: {
        id: signal.market.event.competition.id,
        name: signal.market.event.competition.name,
        sport: signal.market.event.competition.sport,
        country: signal.market.event.competition.country,
      },
      selection: signal.selection ? { name: signal.selection.name } : null,
    });
    if (SEND_SUSPICIOUS_ALERTS) {
      // New product path (2026-08-28 pivot): OddsNotifier-lite feed —
      // suspicious-league whitelist + Sofascore context filter. Runs
      // BEFORE the legacy per-user deliverSignal so a rejection here
      // ("explained_by_recent_event", "not_suspicious_league") short-
      // circuits the legacy path too — the two feeds are mutually
      // exclusive by design, not complementary.
      const result = await deliverSuspiciousSignal(db, bot, context);
      if (!result.accepted) continue;
    } else {
      await deliverSignal(db, bot, context);
    }
  }
}

/**
 * Strategy runner runs on its OWN loop — deliberately NOT wrapped in
 * withWorkerLock, and NOT interleaved with the detection/ingestion pass —
 * because pre-match odds ingestion is slow (thousands of Neon upserts,
 * ~1s each) and the strategy runner is time-critical (a live-match alert
 * fired at minute 20 is worthless; must fire in the minute-1-to-15 window).
 * The unique index on (strategyName, eventId) is enough to keep two racing
 * instances from double-inserting a pick.
 */
async function startStrategyLoop(): Promise<void> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    console.log("[worker] strategy loop skipped — API_FOOTBALL_KEY not set.");
    return;
  }

  const loop = async () => {
    while (true) {
      try {
        const bot = SEND_LIVE_ALERTS ? getBotForDelivery() : null;
        try {
          const fired = await runLiveTriggerPass(db, bot, apiKey);
          if (fired > 0) console.log(`[worker] strategy pass fired ${fired} pick(s).`);
        } catch (err) {
          console.error("[worker] strategy trigger pass failed", err);
        }
        try {
          const resolved = await runHTResultPass(db, bot, apiKey);
          if (resolved > 0) console.log(`[worker] strategy pass resolved ${resolved} pick(s).`);
        } catch (err) {
          console.error("[worker] strategy HT result pass failed", err);
        }
      } catch (err) {
        console.error("[worker] strategy loop iteration failed", err);
      }
      await new Promise((resolve) => setTimeout(resolve, STRATEGY_POLL_INTERVAL_MS));
    }
  };
  // Fire-and-forget on purpose — a top-level `await` here would block the
  // main function's for-loop from ever starting.
  loop().catch((err) => console.error("[worker] strategy loop crashed", err));
}

async function main() {
  console.log(
    `[worker] Odds Hunter worker starting — detection every ${WORKER_POLL_INTERVAL_MS}ms, ` +
      `ingestion every ${INGEST_POLL_INTERVAL_MS}ms, strategy every ${STRATEGY_POLL_INTERVAL_MS}ms, ` +
      `${SEND_LIVE_ALERTS ? "LIVE ALERTS ON" : "mode observation (no alerts sent)"}, ` +
      `${SEND_LEGACY_DETECTOR_ALERTS ? "LEGACY DETECTOR ALERTS ON" : "legacy detector alerts OFF (product pivot 2026-08-23)"}, ` +
      `${SEND_SUSPICIOUS_ALERTS ? "SUSPICIOUS-LITE FEED ON" : "suspicious-lite feed OFF"}.`,
  );

  // Started unconditionally (not just when SEND_LIVE_ALERTS is on) — account
  // linking (/start <token>) and status commands must work even while the
  // worker is only observing, not yet delivering alerts.
  await startTelegramBot();
  await startTipConsensusListener();
  await startStrategyLoop();

  let lastIngestAt = 0;

  for (;;) {
    try {
      const result = await withWorkerLock(async () => {
        // Ingestion hits the real provider API and has a tight daily quota
        // (see apiFootball.ts) — it runs on its own, much slower cadence.
        // Detection just re-reads what's already in the DB, so it can run
        // every cycle for free.
        const touchedSignalIds = await runDetectionPass();
        if (Date.now() - lastIngestAt >= INGEST_POLL_INTERVAL_MS) {
          await runIngestion();
          try {
            await resolvePendingOutcomes(db, getBotForDelivery());
          } catch (err) {
            console.error("[worker] outcome resolution failed", err);
          }
          // Consensus alerts get their own outcome pass: they're graded off
          // Sofascore (free, no key) since API-Football is dead, and reply
          // to the original VIP message with ✅ Passé / ❌ Perdu once the
          // match ends. Runs every ingest cycle (15 min in prod) — plenty
          // often for match-length feedback, gentle enough on Sofascore.
          if (tipUserClient) {
            try {
              const r = await resolvePendingConsensusOutcomes(db, tipUserClient);
              if (r.resolved || r.unresolved) {
                console.log(`[worker] consensus outcomes: ${r.resolved} graded, ${r.unresolved} given up, ${r.skipped} still waiting`);
              }
            } catch (err) {
              console.error("[worker] consensus outcome resolution failed", err);
            }
          }
          // Momentum picks (stats-based live tips) turned off (Noaim,
          // 2026-08-23): the product targets match-fixing in obscure,
          // unwatched leagues, not statistically-good tips on mainstream
          // ones — running this on Premier League/Ligue 1/etc. was off-thesis
          // by construction, not just low-value. It only ever ran on those
          // leagues because API-Football has zero live-stats coverage for
          // the actual target leagues (confirmed empirically 2026-08-23).
          // momentumPicks.ts is left in place in case a future stats source
          // covers the real target leagues, but it's not invoked here.
          //
          // runLivePicksPass() (livePicks.ts) also disabled here (2026-08-24,
          // Neon->Prisma Postgres migration): it's an earlier (2026-08-23),
          // un-validated "Over 0.5 HT, no league filter" prototype of the
          // same idea strategies/strategyRunner.ts now implements properly
          // (44 curated leagues, real historical hit-rate backing via
          // strategyStats.ts) — superseded, not a distinct product surface.
          // It called fetchLiveOddsSnapshot() itself (same worldwide
          // every-live-fixture fetch removed from getConfiguredProviders()
          // above), so leaving it running would have kept paying that same
          // cost under a different name. Re-enable only if strategyRunner.ts
          // is deliberately being replaced, not alongside it.
          lastIngestAt = Date.now();
        }
        // Legacy detector alerts are gated behind SEND_LEGACY_DETECTOR_ALERTS
        // since the 2026-08-23 pivot to InPlay-Alerts-style strategy picks
        // (see config.ts). Detection still runs and stores Signal rows —
        // just no Telegram delivery unless the flag is turned back on.
        // Detection-pass delivery fires when EITHER product path is active:
        //  - legacy per-user feed (SEND_LEGACY_DETECTOR_ALERTS, off since 2026-08-23)
        //  - suspicious-lite channel feed (SEND_SUSPICIOUS_ALERTS, added 2026-08-28)
        // deliverTouchedSignals routes internally between the two.
        if (
          SEND_LIVE_ALERTS &&
          (SEND_LEGACY_DETECTOR_ALERTS || SEND_SUSPICIOUS_ALERTS) &&
          touchedSignalIds.length > 0
        ) {
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
