import type { PrismaClient } from "@/generated/prisma/client";
import type { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import type { EntityLike } from "telegram/define";
import { resolveSofascoreEventId } from "../providers/sofascore";
import { evaluateConsensusOutcome, formatConsensusOutcomeMessage } from "./alertFormat";

/**
 * Grades ConsensusAlert rows once the match is finished and replies to the
 * original VIP post with the verdict — the "does the pick actually win?"
 * feedback loop the user asked for 2026-09-02.
 *
 * Runs off Sofascore (free, no key) since API-Football is currently
 * unavailable. The lookup path is: fetch the finished-match payload via
 * `/api/v1/event/{id}` on the Sofascore id resolved from team names.
 * Coverage is decent on mainstream leagues, thinner on the obscure
 * reserve/youth leagues that dominate tipster chatter — a fixture we
 * can't resolve after enough retries is marked UNRESOLVED (see the age
 * gate below) so we don't hammer the endpoint forever.
 */

const API_BASE = "https://api.sofascore.com/api/v1";
const UA = "Mozilla/5.0 (compatible; oddshunter-worker/1.0)";
const REQUEST_TIMEOUT_MS = 8_000;

/** Sofascore status.type = "finished" is what the site uses for full-time,
 *  regardless of status.code (which varies by sport). */
type SofascoreEventPayload = {
  event: {
    status: { type: string; description?: string };
    homeScore: { current?: number };
    awayScore: { current?: number };
  };
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Wait long enough after the alert to give a football/basketball match
 *  time to end (kickoff can be well after we post — some tipsters signal
 *  pre-match), but not so long that we grade a match that never happened.
 *  2h min covers the typical pre-match + full 90 min + halftime; 12h max
 *  cuts off matches that never went ahead or were postponed. */
const MIN_AGE_HOURS = 2;
const MAX_AGE_HOURS = 12;

/** Same VIP-group entity resolution logic used to post the initial alert.
 *  Cached across calls within one process. */
let cachedEntity: EntityLike | null = null;
async function resolveVipGroup(client: TelegramClient): Promise<EntityLike | null> {
  if (cachedEntity) return cachedEntity;
  const inviteLink = process.env.TELEGRAM_VIP_INVITE_LINK;
  if (!inviteLink) return null;
  const match = inviteLink.match(/\+([A-Za-z0-9_-]+)/) ?? inviteLink.match(/joinchat\/([A-Za-z0-9_-]+)/);
  if (!match) return null;
  const check = await client.invoke(new Api.messages.CheckChatInvite({ hash: match[1] }));
  if (check instanceof Api.ChatInviteAlready || check instanceof Api.ChatInvitePeek) {
    cachedEntity = check.chat as EntityLike;
  }
  return cachedEntity;
}

export async function resolvePendingConsensusOutcomes(
  db: PrismaClient,
  client: TelegramClient,
  options: { batchLimit?: number } = {},
): Promise<{ resolved: number; unresolved: number; skipped: number }> {
  const batchLimit = options.batchLimit ?? 20;
  const now = Date.now();

  const pending = await db.consensusAlert.findMany({
    where: {
      outcome: null,
      homeTeam: { not: null },
      awayTeam: { not: null },
      market: { not: null },
      selection: { not: null },
      sentAt: { lte: new Date(now - MIN_AGE_HOURS * 3600_000) },
    },
    orderBy: { sentAt: "asc" },
    take: batchLimit,
  });

  let resolved = 0;
  let unresolved = 0;
  let skipped = 0;

  for (const alert of pending) {
    // Age-cap: past 12h without a resolvable Sofascore match, give up so
    // we stop retrying on postponed/unfindable fixtures. Different fields
    // (homeScore null) mark this as "we gave up", not "match ended 0-0".
    const ageHours = (now - alert.sentAt.getTime()) / 3600_000;
    if (ageHours > MAX_AGE_HOURS) {
      await db.consensusAlert.update({
        where: { id: alert.id },
        data: { outcome: "UNRESOLVED", resolvedAt: new Date() },
      });
      unresolved++;
      continue;
    }

    if (!alert.homeTeam || !alert.awayTeam || !alert.market || !alert.selection) {
      skipped++;
      continue;
    }

    const sofascoreId = await resolveSofascoreEventId(alert.homeTeam, alert.awayTeam);
    if (!sofascoreId) {
      skipped++;
      continue;
    }
    const payload = await fetchJson<SofascoreEventPayload>(`${API_BASE}/event/${sofascoreId}`);
    if (!payload) {
      skipped++;
      continue;
    }
    if (payload.event.status.type !== "finished") {
      // Still playing / not started — try again next pass.
      skipped++;
      continue;
    }
    const homeScore = payload.event.homeScore.current;
    const awayScore = payload.event.awayScore.current;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") {
      skipped++;
      continue;
    }

    const outcome = evaluateConsensusOutcome(
      alert.market,
      alert.selection,
      { homeTeam: alert.homeTeam, awayTeam: alert.awayTeam },
      { homeScore, awayScore },
    );
    if (!outcome) {
      // A market shape we can't grade (handicap without a team side, etc.).
      // Record the score so a human review has the data, but don't post.
      await db.consensusAlert.update({
        where: { id: alert.id },
        data: { outcome: "UNRESOLVED", resolvedAt: new Date(), homeScore, awayScore },
      });
      unresolved++;
      continue;
    }

    // Reply-to the original alert message so the outcome threads under it.
    // Best-effort: if the send fails or the message id is missing (older
    // alerts predate the schema change), still record the outcome in the DB.
    if (alert.sentMessageId != null) {
      try {
        const entity = await resolveVipGroup(client);
        if (entity) {
          const body = formatConsensusOutcomeMessage({
            homeTeam: alert.homeTeam,
            awayTeam: alert.awayTeam,
            homeScore,
            awayScore,
            outcome,
            oddsAtAlert: alert.oddsAtAlert,
          });
          await client.sendMessage(entity, { message: body, replyTo: Number(alert.sentMessageId) });
        }
      } catch (err) {
        console.error(`[consensusOutcomeResolver] failed to reply for ${alert.id}:`, err instanceof Error ? err.message : err);
      }
    }

    await db.consensusAlert.update({
      where: { id: alert.id },
      data: { outcome, resolvedAt: new Date(), homeScore, awayScore },
    });
    resolved++;
  }

  return { resolved, unresolved, skipped };
}
