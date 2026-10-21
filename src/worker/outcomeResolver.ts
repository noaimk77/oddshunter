import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import { fetchFixtureResults, isFixtureFinished } from "./providers/apiFootball";
import { fetchRecentResults } from "./providers/betexplorer";
import { resolveSelectionOutcome, type MatchResult } from "./detectors/signalOutcome";
import { getOutcomeResolutionConfig } from "./config";
import { formatSignalMessage, updateResultInMessage } from "./telegram/sendAlert";
import { buildSignalContext } from "./telegram/signalContext";

type EventWithMarkets = Prisma.EventGetPayload<{ include: { markets: { include: { selections: true } }; competition: true } }>;

/**
 * The missing feedback loop: without this, a Signal's score is never
 * checked against what actually happened, so there's no way to know
 * whether the scoring model means anything (Noaim, 2026-08-22).
 *
 * Two independent passes, since the two providers need completely
 * different fetch strategies:
 *  - API-Football: batched via `/fixtures?ids=` (up to 20 per request,
 *    unlocked on the Ultra plan 2026-08-22), capped per pass against the
 *    shared daily quota.
 *  - BetExplorer: no key, no quota — `/football/results/` (today +
 *    yesterday, 2 requests total) returns every finished match's score at
 *    once, so every pending BetExplorer event gets checked every pass.
 */
export async function resolvePendingOutcomes(db: PrismaClient, bot: Bot | null): Promise<void> {
  await resolveApiFootballOutcomes(db, bot);
  await resolveBetExplorerOutcomes(db, bot);
}

/** win/lose/void -> the same result line Suspicious Game appends to their
 *  original pick message once it's known (Noaim, 2026-08-23), edited into
 *  every user's copy of that signal's message. Best-effort: a delivery
 *  failing to edit doesn't stop the others or fail outcome resolution — the
 *  SignalOutcome row is already the source of truth either way. */
async function postResultToTelegram(
  db: PrismaClient,
  bot: Bot | null,
  signal: {
    id: string;
    type: string;
    score: number;
    reasons: unknown;
    openingPrice: number | null;
    currentPrice: number | null;
    priceChangePct: number | null;
    metadata: unknown;
    firstDetectedAt: Date;
    selectionId: string | null;
  },
  event: EventWithMarkets,
  market: EventWithMarkets["markets"][number],
  selection: EventWithMarkets["markets"][number]["selections"][number],
  selectionWon: boolean | null,
  matchResult: MatchResult,
): Promise<void> {
  if (!bot) return;
  const deliveries = await db.signalDelivery.findMany({ where: { signalId: signal.id, channel: "TELEGRAM" } });
  if (deliveries.length === 0) return;

  // SignalDelivery only stores userId, not the chat — resolve chat ids via
  // TelegramLink the same way deliverSignal() does for the initial send.
  const links = await db.telegramLink.findMany({ where: { userId: { in: deliveries.map((d) => d.userId) } } });
  const chatIdByUserId = new Map(links.map((l) => [l.userId, l.telegramChatId]));

  // Same enrichment as the initial delivery (buildSignalContext) so the
  // ✅/❌ edit doesn't silently strip velocity / late-move / cross-market /
  // league-hit-rate lines from the message the reader saw at send time.
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
    market: { name: market.name, type: market.type, status: market.status },
    event: {
      id: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      kickoff: event.kickoff,
      status: event.status,
    },
    competition: {
      id: event.competition.id,
      name: event.competition.name,
      sport: event.competition.sport,
      country: event.competition.country,
    },
    selection: { name: selection.name },
  });
  const originalText = formatSignalMessage(context);
  const outcome = selectionWon === true ? "won" : selectionWon === false ? "lost" : "void";
  const finalText = updateResultInMessage(originalText, outcome, {
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    homeScore: matchResult.fullTimeHomeGoals,
    awayScore: matchResult.fullTimeAwayGoals,
  });

  for (const delivery of deliveries) {
    const chatId = chatIdByUserId.get(delivery.userId);
    if (!delivery.messageRef || !chatId) continue;
    try {
      await bot.api.editMessageText(chatId, Number(delivery.messageRef), finalText, { parse_mode: "HTML" });
    } catch (err) {
      const isNoOpEdit = err instanceof GrammyError && err.error_code === 400 && err.description.includes("message is not modified");
      if (!isNoOpEdit) console.error(`[outcomeResolver] failed to post result for signal ${signal.id}`, err);
    }
  }
}

async function applyResult(db: PrismaClient, bot: Bot | null, event: EventWithMarkets, matchResult: MatchResult): Promise<void> {
  await db.event.update({
    where: { id: event.id },
    data: {
      status: "finished",
      homeScore: matchResult.fullTimeHomeGoals,
      awayScore: matchResult.fullTimeAwayGoals,
      halftimeHomeScore: matchResult.halftimeHomeGoals,
      halftimeAwayScore: matchResult.halftimeAwayGoals,
    },
  });

  let resolvedCount = 0;
  for (const market of event.markets) {
    for (const selection of market.selections) {
      const signals = await db.signal.findMany({
        where: { marketId: market.id, selectionId: selection.id, outcome: { is: null } },
      });
      for (const signal of signals) {
        const selectionWon = resolveSelectionOutcome(market.type, market.name, selection.position, matchResult);
        await db.signalOutcome.create({
          data: {
            signalId: signal.id,
            finalHomeScore: matchResult.fullTimeHomeGoals,
            finalAwayScore: matchResult.fullTimeAwayGoals,
            selectionWon,
          },
        });
        await postResultToTelegram(db, bot, signal, event, market, selection, selectionWon, matchResult);
        resolvedCount++;
      }
    }
  }

  console.log(
    `[outcomeResolver] ${event.homeTeam} vs ${event.awayTeam} finished ` +
      `${matchResult.fullTimeHomeGoals}-${matchResult.fullTimeAwayGoals} — ${resolvedCount} signal(s) resolved.`,
  );
}

async function resolveApiFootballOutcomes(db: PrismaClient, bot: Bot | null): Promise<void> {
  const { bufferMinutes, maxFixturesPerPass } = getOutcomeResolutionConfig();
  const cutoff = new Date(Date.now() - bufferMinutes * 60_000);

  const events = await db.event.findMany({
    where: {
      status: { not: "finished" },
      kickoff: { lt: cutoff },
      competition: { provider: { name: { in: ["api-football", "api-football-live"] } } },
    },
    take: maxFixturesPerPass,
    include: { markets: { include: { selections: true } }, competition: true },
  });

  const eventsByFixtureId = new Map<number, EventWithMarkets>();
  for (const event of events) {
    const fixtureId = Number(event.externalId);
    if (Number.isFinite(fixtureId)) eventsByFixtureId.set(fixtureId, event);
  }

  let resultsByFixtureId;
  try {
    resultsByFixtureId = await fetchFixtureResults([...eventsByFixtureId.keys()]);
  } catch (err) {
    console.error("[outcomeResolver] failed to fetch API-Football fixture results", err);
    return;
  }

  for (const [fixtureId, event] of eventsByFixtureId) {
    const fixtureResult = resultsByFixtureId.get(fixtureId);
    if (!fixtureResult) continue; // quota exhausted, fetch failed, or not returned — retry next pass
    if (!isFixtureFinished(fixtureResult.statusShort)) continue; // not over yet — retry later
    if (fixtureResult.fullTimeHomeGoals === null || fixtureResult.fullTimeAwayGoals === null) {
      console.log(`[outcomeResolver] event ${event.id} finished (${fixtureResult.statusShort}) with no score to resolve against.`);
      await db.event.update({ where: { id: event.id }, data: { status: "finished" } });
      continue;
    }

    await applyResult(db, bot, event, {
      fullTimeHomeGoals: fixtureResult.fullTimeHomeGoals,
      fullTimeAwayGoals: fixtureResult.fullTimeAwayGoals,
      halftimeHomeGoals: fixtureResult.halftimeHomeGoals,
      halftimeAwayGoals: fixtureResult.halftimeAwayGoals,
    });
  }
}

async function resolveBetExplorerOutcomes(db: PrismaClient, bot: Bot | null): Promise<void> {
  const { bufferMinutes } = getOutcomeResolutionConfig();
  const cutoff = new Date(Date.now() - bufferMinutes * 60_000);

  const events = await db.event.findMany({
    where: {
      status: { not: "finished" },
      kickoff: { lt: cutoff },
      // Both the cheap "summary" points and the per-bookmaker detail points
      // share one Provider row named "betexplorer" (see ingest.ts — it's
      // provider.name, not the per-point providerName field, that's used).
      competition: { provider: { name: "betexplorer" } },
    },
    include: { markets: { include: { selections: true } }, competition: true },
  });
  if (events.length === 0) return;

  let resultsByMatchId;
  try {
    resultsByMatchId = await fetchRecentResults();
  } catch (err) {
    console.error("[outcomeResolver] failed to fetch BetExplorer results", err);
    return;
  }

  for (const event of events) {
    const result = resultsByMatchId.get(event.externalId);
    if (!result) continue; // not finished yet (or outside today/yesterday) — retry later

    await applyResult(db, bot, event, {
      fullTimeHomeGoals: result.fullTimeHomeGoals,
      fullTimeAwayGoals: result.fullTimeAwayGoals,
      halftimeHomeGoals: result.halftimeHomeGoals,
      halftimeAwayGoals: result.halftimeAwayGoals,
    });
  }
}
