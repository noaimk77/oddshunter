import type { PrismaClient } from "@/generated/prisma/client";
import type { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import type { EntityLike } from "telegram/define";
import { fetchFinishedEvent, fetchLiveScore, type LiveScore } from "../providers/thesportsdb";
import { fetchRecentResults, type ResultRow } from "../providers/betexplorer";
import { fuzzyFixtureMatch } from "./tipParser";
import {
  consensusStatusLine,
  currentConsensusStatusPrefix,
  evaluateConsensusOutcome,
  replaceConsensusStatusLine,
} from "./alertFormat";

/** Common shape both result sources resolve to, so the grading logic below
 *  doesn't care which one actually found the match. */
interface GradedScore {
  homeScore: number;
  awayScore: number;
  homeScoreHT: number | null;
  awayScoreHT: number | null;
}

/**
 * BetExplorer fallback when TheSportsDB has nothing — same site the odds
 * already come from, so its results coverage lines up with the obscure
 * reserve/youth leagues this feed actually detects tips on (confirmed live
 * 2026-09-05: Croatian U19 sides that TheSportsDB never resolved show up
 * here). `cachedRows` is fetched at most ONCE per resolver pass (populated
 * by the caller) — every pending alert in the batch searches the same
 * in-memory list instead of re-fetching the results page per alert.
 */
function findBetexplorerResult(
  cachedRows: ResultRow[],
  homeTeam: string,
  awayTeam: string,
): GradedScore | null {
  const hit = cachedRows.find((row) => fuzzyFixtureMatch({ homeTeam, awayTeam }, { homeTeam: row.homeTeam, awayTeam: row.awayTeam }));
  if (!hit) return null;
  return {
    homeScore: hit.fullTimeHomeGoals,
    awayScore: hit.fullTimeAwayGoals,
    homeScoreHT: hit.halftimeHomeGoals,
    awayScoreHT: hit.halftimeAwayGoals,
  };
}

const LIVE_TERMINAL_STATUSES = new Set(["FT", "AET", "PEN", "MATCH FINISHED", "AWARDED"]);

/**
 * Grades a pick from a LIVE score (Noaim 2026-09-05: "assure tous les
 * résultats… il faut que ça soit en live"). Two cases:
 *   1. The live feed already shows the match FINISHED (status "FT"…) but
 *      it hasn't hit the results pages yet — grade it fully, now.
 *   2. The match is still in play but the verdict is already mathematically
 *      LOCKED: an OVER goals line already exceeded (a goal can't be
 *      un-scored), BTTS "yes" with both teams already on the board, or a
 *      first-half over/under at half-time.
 * Anything still genuinely in the balance (UNDER lines mid-match, 1X2,
 * double chance, handicap, a not-yet-exceeded OVER) returns null — wait
 * for the finished score.
 */
export function gradeFromLive(
  market: string,
  selection: string,
  fixture: { homeTeam: string; awayTeam: string },
  live: LiveScore,
): "WON" | "LOST" | "VOID" | null {
  const score = { homeScore: live.homeScore, awayScore: live.awayScore };
  const total = live.homeScore + live.awayScore;

  // 1. Live feed says it's over — the score is final, grade everything.
  if (LIVE_TERMINAL_STATUSES.has(live.status)) {
    // For a first-half line at FT the live score is the FULL-time score, not
    // HT — can't grade those from here, they need the partial.
    if (market === "OVER_UNDER_HT") return null;
    return evaluateConsensusOutcome(market, selection, fixture, score, null);
  }

  // 2. In play — only report a locked verdict.
  if (market === "OVER_UNDER_HT") {
    if (live.status === "HT") {
      // At half-time the live score IS the half-time score → grade fully.
      return evaluateConsensusOutcome(market, selection, fixture, score, score);
    }
    if (live.status === "1H" && selection.startsWith("OVER_")) {
      const m = selection.match(/^OVER_(\d+(?:_\d+)?)$/);
      const line = m ? Number.parseFloat(m[1].replace(/_/g, ".")) : NaN;
      if (Number.isFinite(line) && total > line) return "WON";
    }
    return null;
  }

  if (market === "OVER_UNDER" && selection.startsWith("OVER_")) {
    const m = selection.match(/^OVER_(\d+(?:_\d+)?)$/);
    const line = m ? Number.parseFloat(m[1].replace(/_/g, ".")) : NaN;
    if (Number.isFinite(line) && total > line) return "WON";
    return null;
  }

  if (market === "BTTS" && selection.toUpperCase() === "YES" && live.homeScore > 0 && live.awayScore > 0) {
    return "WON";
  }

  return null;
}

/**
 * Grades ConsensusAlert rows once the match is finished and EDITS the
 * original VIP post in place with the verdict — never a separate reply
 * (Noaim, 2026-09-04: "tu restes sur le même message"). Between posting and
 * grading it also flips the status line to "match en cours" once kickoff
 * has passed, so the alert always says where the pick stands. This is the
 * "does the pick actually win?" feedback loop the user asked for 2026-09-02.
 *
 * Runs off TheSportsDB FIRST (free, keyless — resolve the home team, read
 * its recent-events feed, take the finished row against the away team),
 * then falls back to BetExplorer's results listing (2026-09-05) when
 * TheSportsDB has nothing — BetExplorer is the same site the odds already
 * come from, so its coverage actually lines up with the reserve/youth
 * leagues this feed detects tips on, where TheSportsDB is thin (real miss:
 * Croatian U19 sides). A fixture neither source can resolve within the age
 * window is marked UNRESOLVED (see the age gate below) so we don't retry
 * forever. Half-time scores are rarely present on either free source, so
 * first-half (`OVER_UNDER_HT`) picks usually end UNRESOLVED rather than
 * graded.
 */

/** Poll delay before the first grading attempt. Was 2h — but a live tip
 *  posted mid-match can finish 20 min later, and waiting 2h to look meant
 *  Noaim saw a "won" pick sitting on "⏳ en attente" for a full extra hour
 *  (Dzongri FC vs Red Panda FC, 2026-09-04). fetchFinishedEvent already
 *  guards against ungraded/in-play rows on its own — TheSportsDB is free
 *  and keyless, so polling early costs nothing. 20 min is enough head-room
 *  that we don't hammer during the first quarter of a normal match. */
const MIN_AGE_HOURS = 20 / 60;
// A consensus can form up to 24h before kickoff (the tip window is 1440
// min), so a pre-match pick's match can legitimately end ~26-28h after we
// posted. 12h was cutting those off as UNRESOLVED before they ever
// finished — 30h still discards genuinely postponed/never-played fixtures
// but lets a normal pre-match pick get graded.
const MAX_AGE_HOURS = 30;
/** If neither source can find a score this long after the alert, the
 *  fixture name is almost certainly garbled/OCR-mangled ("ghas vs Atletica
 *  Portugue") or the match was postponed — stop showing "en attente" and
 *  flip the message to a clear terminal state (Noaim 2026-09-05). Well past
 *  any real 90-min match + the pre-match lead time a normal pick needs. */
const UNFINDABLE_AGE_HOURS = 8;

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

/**
 * Edits the status line of an already-posted consensus alert in place. Reads
 * the live message text back from Telegram first so every other line
 * (country, odds spread…) is preserved exactly — the resolver doesn't hold
 * those fields itself. `onlyWhenPrefixIn`, when given, skips the edit unless
 * the message's current status line starts with one of those prefixes
 * (used so the "→ en cours" flip runs once, not every pass). Returns true
 * when the message was actually changed.
 */
async function editConsensusStatusLine(
  client: TelegramClient,
  sentMessageId: bigint | number | null,
  newStatusLine: string,
  onlyWhenPrefixIn?: readonly string[],
): Promise<boolean> {
  if (sentMessageId == null) return false;
  const entity = await resolveVipGroup(client);
  if (!entity) return false;
  const id = Number(sentMessageId);
  const messages = await client.getMessages(entity, { ids: [id] });
  const original = messages?.[0]?.message;
  if (!original) return false;

  if (onlyWhenPrefixIn) {
    const prefix = currentConsensusStatusPrefix(original);
    if (!prefix || !onlyWhenPrefixIn.includes(prefix)) return false;
  }

  const updated = replaceConsensusStatusLine(original, newStatusLine);
  if (updated === original) return false;

  try {
    await client.editMessage(entity, { message: id, text: updated });
    return true;
  } catch (err) {
    // Telegram rejects an edit whose text is byte-identical to what's already
    // posted — a race, not a failure. Anything else is real.
    const msg = err instanceof Error ? err.message : String(err);
    if (/not modified/i.test(msg)) return false;
    throw err;
  }
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

  // Fetched at most once per pass, lazily — only if some alert in this
  // batch actually needs the BetExplorer fallback. Every alert in the
  // batch that needs it searches this same in-memory list.
  let betexplorerRows: ResultRow[] | null = null;
  const getBetexplorerRows = async (): Promise<ResultRow[]> => {
    if (betexplorerRows) return betexplorerRows;
    try {
      betexplorerRows = [...(await fetchRecentResults()).values()];
    } catch (err) {
      console.error("[consensusOutcomeResolver] BetExplorer results fetch failed:", err instanceof Error ? err.message : err);
      betexplorerRows = [];
    }
    return betexplorerRows;
  };

  /** Record UNRESOLVED so this alert stops being retried. No message edit
   *  (Noaim 2026-09-06: "enlève le statut") — the alert just never gets a
   *  result line appended. */
  const markUnresolved = async (alert: (typeof pending)[number]): Promise<void> => {
    await db.consensusAlert.update({ where: { id: alert.id }, data: { outcome: "UNRESOLVED", resolvedAt: new Date() } });
    unresolved++;
  };

  /** Post the graded verdict: edit the message in place, DM the owner, and
   *  record the outcome. Shared by the finished-match path and the
   *  first-half-live path. */
  const applyVerdict = async (
    alert: (typeof pending)[number],
    outcome: "WON" | "LOST" | "VOID",
    homeScore: number,
    awayScore: number,
    halfTimeScore: { homeScore: number; awayScore: number } | null,
  ): Promise<void> => {
    const verdictLine = consensusStatusLine({
      state: outcome === "WON" ? "won" : outcome === "LOST" ? "lost" : "void",
      homeTeam: alert.homeTeam ?? "",
      awayTeam: alert.awayTeam ?? "",
      homeScore,
      awayScore,
      halfTimeScore: alert.market === "OVER_UNDER_HT" ? halfTimeScore : null,
    });
    try {
      await editConsensusStatusLine(client, alert.sentMessageId, verdictLine);
    } catch (err) {
      console.error(`[consensusOutcomeResolver] failed to edit verdict for ${alert.id}:`, err instanceof Error ? err.message : err);
    }
    await db.consensusAlert.update({
      where: { id: alert.id },
      data: { outcome, resolvedAt: new Date(), homeScore, awayScore },
    });
    resolved++;
  };

  for (const alert of pending) {
    const ageHours = (now - alert.sentAt.getTime()) / 3600_000;

    if (!alert.homeTeam || !alert.awayTeam || !alert.market || !alert.selection) {
      skipped++;
      continue;
    }

    // Absolute give-up: too old, flip to "indisponible" so it never sits on
    // "en attente" forever.
    if (ageHours > MAX_AGE_HOURS) {
      await markUnresolved(alert);
      continue;
    }

    let fixture: GradedScore | null = await fetchFinishedEvent(alert.homeTeam, alert.awayTeam);
    if (!fixture) {
      fixture = findBetexplorerResult(await getBetexplorerRows(), alert.homeTeam, alert.awayTeam);
    }

    if (!fixture) {
      // No finished score yet — but some verdicts lock before full-time, so
      // check the live-score feed and grade the ones already decided (OVER
      // exceeded, BTTS both scored, a first-half line at HT). No status-line
      // edits in the meantime (Noaim 2026-09-06: "enlève le statut") — the
      // message stays as posted until there's an actual result.
      let live: LiveScore | null = null;
      try {
        live = await fetchLiveScore(alert.homeTeam, alert.awayTeam);
      } catch (err) {
        console.error(`[consensusOutcomeResolver] live-score lookup failed for ${alert.id}:`, err instanceof Error ? err.message : err);
      }

      if (live) {
        const verdict = gradeFromLive(alert.market, alert.selection, { homeTeam: alert.homeTeam, awayTeam: alert.awayTeam }, live);
        if (verdict) {
          const htScore = { homeScore: live.homeScore, awayScore: live.awayScore };
          await applyVerdict(alert, verdict, live.homeScore, live.awayScore, alert.market === "OVER_UNDER_HT" ? htScore : null);
          continue;
        }
      }

      // Well past any real match length and still nothing on any source —
      // the fixture name is garbled/postponed. Give up (DB only) so it
      // stops being retried; the message just never gets a result line.
      if (ageHours > UNFINDABLE_AGE_HOURS) {
        await markUnresolved(alert);
        continue;
      }

      skipped++;
      continue;
    }

    const { homeScore, awayScore } = fixture;
    if (typeof homeScore !== "number" || typeof awayScore !== "number") {
      skipped++;
      continue;
    }

    const halfTimeScore =
      typeof fixture.homeScoreHT === "number" && typeof fixture.awayScoreHT === "number"
        ? { homeScore: fixture.homeScoreHT, awayScore: fixture.awayScoreHT }
        : null;

    const outcome = evaluateConsensusOutcome(
      alert.market,
      alert.selection,
      { homeTeam: alert.homeTeam, awayTeam: alert.awayTeam },
      { homeScore, awayScore },
      halfTimeScore,
    );
    if (!outcome) {
      // A market shape we can't grade (handicap without a team side; a
      // first-half pick with no half-time breakdown). Record the score for
      // review; no message edit.
      await db.consensusAlert.update({
        where: { id: alert.id },
        data: { outcome: "UNRESOLVED", resolvedAt: new Date(), homeScore, awayScore },
      });
      unresolved++;
      continue;
    }

    await applyVerdict(alert, outcome, homeScore, awayScore, halfTimeScore);
  }

  return { resolved, unresolved, skipped };
}
