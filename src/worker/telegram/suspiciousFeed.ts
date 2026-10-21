import type { PrismaClient } from "@/generated/prisma/client";
import type { Bot } from "grammy";
import { GrammyError } from "grammy";
import { matchSuspiciousLeague, suspiciousLeagueScoreBonus } from "../lib/suspiciousLeagues";
import { createSofascoreLiveStateProvider, hasRecentExplanatoryEvent, resolveSofascoreEventId } from "../providers/sofascore";
import { getSuspiciousChannels, getSuspiciousMinScore, SUSPICIOUS_FILTER_EXPLAINED_MOVES } from "../config";
import { formatSignalMessage, type SignalWithContext } from "./sendAlert";

/**
 * OddsNotifier-lite delivery path (Noaim, 2026-08-28). Distinct from
 * deliverSignal() in sendAlert.ts:
 *  - Filters to whitelisted "suspicious" leagues (matchSuspiciousLeague)
 *  - Boosts score with the league weight (5/10/15 pts)
 *  - Requires score >= SUSPICIOUS_MIN_SCORE after boost
 *  - Skips signals whose price move is explained by a recent on-pitch event
 *    (Sofascore state, gated on SUSPICIOUS_FILTER_EXPLAINED_MOVES)
 *  - Routes MARKET_LOCK to its own channel, everything else to alerts channel
 *
 * Per-user (paying) delivery still uses SignalDelivery for its own edit-in-
 * place semantics and dedupe (userId is a real FK). Broadcast channels use
 * an in-memory dedupe map — good enough for a single worker process, since
 * the alert bar (score >= 55) is high enough that duplicate broadcasts
 * across a restart would be a rare, minor annoyance, not a firehose.
 */

const sofascore = createSofascoreLiveStateProvider();

/** signalId -> { chatId, messageRef } for the current process lifetime.
 *  A restart re-sends channel messages once; per-user delivery is unaffected
 *  because it goes through the DB-backed SignalDelivery path. */
const broadcastMemory = new Map<string, { chatId: string; messageRef: string }>();

async function sendOrEdit(
  bot: Bot,
  chatId: string,
  text: string,
  existingMessageRef: string | null,
): Promise<string | null> {
  try {
    if (existingMessageRef) {
      try {
        await bot.api.editMessageText(chatId, Number(existingMessageRef), text, { parse_mode: "HTML" });
        return existingMessageRef;
      } catch (editErr) {
        const isNoOp =
          editErr instanceof GrammyError &&
          editErr.error_code === 400 &&
          editErr.description.includes("message is not modified");
        if (isNoOp) return existingMessageRef;
        // Message could have been deleted; fall through to a fresh send.
      }
    }
    const sent = await bot.api.sendMessage(chatId, text, { parse_mode: "HTML" });
    return String(sent.message_id);
  } catch (err) {
    console.error(`[suspicious] failed to send to ${chatId}:`, err);
    return null;
  }
}

export interface SuspiciousDeliveryResult {
  accepted: boolean;
  reason?: "not_suspicious_league" | "below_min_score" | "explained_by_recent_event";
  adjustedScore?: number;
}

export async function deliverSuspiciousSignal(
  db: PrismaClient,
  bot: Bot,
  signal: SignalWithContext,
): Promise<SuspiciousDeliveryResult> {
  const { event } = signal.market;
  const leagueMatch = matchSuspiciousLeague(event.competition.country, event.competition.name);
  if (!leagueMatch.matched) return { accepted: false, reason: "not_suspicious_league" };

  const scoreBoost = suspiciousLeagueScoreBonus(leagueMatch);
  const adjustedScore = Math.min(100, signal.score + scoreBoost);
  if (adjustedScore < getSuspiciousMinScore()) {
    return { accepted: false, reason: "below_min_score", adjustedScore };
  }

  if (SUSPICIOUS_FILTER_EXPLAINED_MOVES && event.status === "live") {
    const sofascoreId = await resolveSofascoreEventId(event.homeTeam, event.awayTeam);
    if (sofascoreId) {
      const state = await sofascore.fetchLiveState(String(sofascoreId));
      if (state && hasRecentExplanatoryEvent(state)) {
        return { accepted: false, reason: "explained_by_recent_event", adjustedScore };
      }
    }
  }

  const enrichedSignal = { ...signal, score: adjustedScore };
  const text = formatSignalMessage(enrichedSignal);

  // --- Broadcast to configured Telegram channels (in-memory dedupe) ---
  const channels = getSuspiciousChannels();
  const broadcastTarget =
    signal.type === "MARKET_LOCK" && channels.closures ? channels.closures : channels.alerts;

  if (broadcastTarget) {
    const existing = broadcastMemory.get(signal.id) ?? null;
    const messageRef = await sendOrEdit(
      bot,
      broadcastTarget,
      text,
      existing?.messageRef ?? null,
    );
    if (messageRef) {
      broadcastMemory.set(signal.id, { chatId: broadcastTarget, messageRef });
    }
  }

  // --- Per-paying-user delivery (DB-backed dedupe via SignalDelivery) ---
  const eligibleLinks = await db.telegramLink.findMany({
    where: { revokedAt: null, user: { entitlements: { some: { type: "BOT", status: "ACTIVE" } } } },
  });

  for (const link of eligibleLinks) {
    const existing = await db.signalDelivery.findUnique({
      where: { signalId_userId_channel: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM" } },
    });
    const messageRef = await sendOrEdit(bot, link.telegramChatId, text, existing?.messageRef ?? null);
    if (!messageRef) continue;

    await db.signalDelivery.upsert({
      where: { signalId_userId_channel: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM" } },
      create: { signalId: signal.id, userId: link.userId, channel: "TELEGRAM", messageRef },
      update: { messageRef },
    });
  }

  return { accepted: true, adjustedScore };
}

/**
 * Test hook — clears the process-local broadcast dedupe cache so integration
 * tests can re-run a signal end-to-end. Not called from production code.
 */
export function _resetSuspiciousBroadcastMemory(): void {
  broadcastMemory.clear();
}
