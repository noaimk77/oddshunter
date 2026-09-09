import type { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import type { EntityLike } from "telegram/define";
import type { ParsedTip } from "./tipParser";
import { formatConsensusMessage, type Sport } from "./alertFormat";
import { resolveFixtureMeta, fetchFixtureTiming, fetchLiveScore } from "../providers/thesportsdb";
import { findPinnacleFixture } from "../providers/pinnacle";
import { CONSENSUS_REQUIRE_RESOLVABLE_FIXTURE, CONSENSUS_SUPPRESS_INPLAY } from "../config";
export { formatConsensusMessage, shouldSendConsensusAlert } from "./alertFormat";

/**
 * A goals-based pick (over/under with a football-range line, or BTTS) makes
 * no sense on a basketball / hockey / other non-football fixture — "plus de
 * 5,5 buts" on Merkezefendi (Turkish basketball) was a real bad alert
 * flagged by Noaim 2026-09-03. When a provider resolves the fixture to a
 * non-football sport and the pick is goals-shaped, the pick was mis-parsed
 * or cross-matched — suppress it rather than post nonsense.
 */
function pickContradictsSport(tip: Pick<ParsedTip, "market" | "selection">, sport: Sport): boolean {
  if (sport !== "basketball") return false; // only act on a confident non-football verdict
  if (tip.market === "BTTS") return true;
  if (tip.market === "OVER_UNDER" || tip.market === "OVER_UNDER_HT") {
    const n = Number.parseFloat(tip.selection.replace(/^(?:OVER|UNDER)_/, "").replace(/_/g, "."));
    // A basketball total is 100+; anything under 30 is a football goal line
    // that got stuck on a basketball fixture.
    return Number.isFinite(n) && n < 30;
  }
  return false;
}

let cachedEntity: EntityLike | null = null;

function extractInviteHash(link: string): string {
  const match = link.match(/\+([A-Za-z0-9_-]+)/) ?? link.match(/joinchat\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Lien d'invitation VIP invalide : ${link}`);
  return match[1];
}

/**
 * Resolves the VIP group's entity from its invite link — cached for the
 * process lifetime since it can't change without a redeploy. Handles both
 * cases: the account is already a member (the expected, steady state) or
 * needs to join once (first run after the invite link changes).
 */
async function resolveVipGroup(client: TelegramClient): Promise<EntityLike> {
  if (cachedEntity) return cachedEntity;

  const inviteLink = process.env.TELEGRAM_VIP_INVITE_LINK;
  if (!inviteLink) throw new Error("TELEGRAM_VIP_INVITE_LINK n'est pas configuré.");
  const hash = extractInviteHash(inviteLink);

  const result = await client.invoke(new Api.messages.CheckChatInvite({ hash }));

  if (result instanceof Api.ChatInviteAlready || result instanceof Api.ChatInvitePeek) {
    cachedEntity = result.chat as EntityLike;
  } else {
    const updates = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
    const chats = "chats" in updates ? updates.chats : [];
    if (!chats[0]) throw new Error("Impossible de rejoindre le groupe VIP via le lien d'invitation.");
    cachedEntity = chats[0] as EntityLike;
  }

  return cachedEntity;
}

/**
 * Posts the consensus alert to the VIP group. Returns the Telegram
 * (chatId, messageId) pair so the caller can persist it — the outcome
 * resolver replies to this exact message once the match ends, threading
 * "✅ Passé"/"❌ Perdu" under the pick.
 */
export async function sendConsensusAlert(
  client: TelegramClient,
  tip: ParsedTip & { groupCount: number; oddsAtAlert?: number | null; oddsSamples?: number[] },
): Promise<{ chatId: string; messageId: number } | null> {
  const entity = await resolveVipGroup(client);
  const label = `${tip.homeTeam} vs ${tip.awayTeam}`;

  // Fixture lookup — Pinnacle FIRST (the book Noaim's subscribers bet on;
  // its guest feed covers reserve/youth leagues and gives kickoff + live
  // status), then TheSportsDB as a country/sport + timing fallback. All
  // best-effort behind a 9s cap; a failure/timeout leaves everything null
  // and the guards below just don't fire. Only runs when an alert is
  // actually about to post, so these calls are rare.
  let country: string | null = null;
  let sport: Sport | undefined;
  let startMs: number | null = null;
  let isLive = false;
  let liveMinute: number | null = null;
  let liveGoals: number | null = null;
  let finished = false;
  let onPinnacle = false;
  let resolved = false; // found on Pinnacle OR TheSportsDB
  try {
    const [pin, meta, timing, live] = await Promise.race([
      Promise.all([
        findPinnacleFixture(tip.homeTeam, tip.awayTeam),
        resolveFixtureMeta(tip.homeTeam, tip.awayTeam),
        fetchFixtureTiming(tip.homeTeam, tip.awayTeam),
        fetchLiveScore(tip.homeTeam, tip.awayTeam),
      ]),
      new Promise<[null, null, null, null]>((resolve) => setTimeout(() => resolve([null, null, null, null]), 9_000)),
    ]);
    if (pin) {
      onPinnacle = true;
      resolved = true;
      country = pin.country ?? null;
      if (pin.sport === "football" || pin.sport === "basketball") sport = pin.sport;
      startMs = pin.startMs;
      isLive = pin.isLive;
      liveMinute = pin.liveMinute;
    }
    if (meta) {
      resolved = true;
      country = country ?? meta.country ?? null;
      if (!sport && (meta.sport === "football" || meta.sport === "basketball")) sport = meta.sport;
    }
    if (timing) {
      if (timing.status === "finished") finished = true;
      if (startMs == null) startMs = timing.startMs;
    }
    // Live-score feed cross-check (Noaim 2026-09-06: a match already at
    // full-time was still getting a "Plus de 2,5 buts" alert). The
    // livescore endpoint reports FT/AET/PEN for matches that just ended
    // and haven't rotated off yet — a stronger "match is over" signal than
    // TheSportsDB timing alone. Any other non-empty status ("1H", "HT",
    // "2H", "ET", …) means the match is running RIGHT NOW — feed that into
    // the in-play state so the first-half guard below can act on it even
    // when neither Pinnacle nor a kickoff timestamp was available.
    if (live) {
      const st = (live.status ?? "").toUpperCase();
      if (["FT", "AET", "PEN", "MATCH FINISHED", "AWARDED"].includes(st)) {
        finished = true;
      } else if (st && !["NS", "NOT STARTED", "POSTP", "POSTPONED", "CANC", "CANCELLED", "ABD", "TBD"].includes(st)) {
        isLive = true;
        if (live.minute != null) liveMinute = liveMinute ?? live.minute;
      }
      if (Number.isFinite(live.homeScore) && Number.isFinite(live.awayScore)) {
        liveGoals = live.homeScore + live.awayScore;
      }
    }
  } catch {
    // fixture lookup is best-effort — never hold up / block the alert on it
  }

  // Time-based "match must be over" backstop when the direct sources came
  // back empty (BetExplorer / TheSportsDB frequently timeout from Fly
  // 2026-09-06). Football + halftime + reasonable stoppage ≈ 2h30 from
  // kickoff — anything posted for a match whose kickoff is more than 2h30
  // in the past is on a fixture that has almost certainly ended.
  if (!finished && startMs != null && Date.now() - startMs > 150 * 60_000) {
    console.log(`[vipGroup] treating ${label} as finished — kickoff ${Math.round((Date.now() - startMs) / 60_000)} min ago, past normal match length.`);
    finished = true;
  }

  // 1. Unresolvable fixture. OFF by default (Noaim 2026-09-04: "détecte
  //    tous les match") — the obscure reserve/youth matches this feed
  //    targets often aren't on Pinnacle or TheSportsDB at all. Opt back in
  //    with CONSENSUS_REQUIRE_RESOLVABLE_FIXTURE=true if OCR-junk fixtures
  //    ("oa vs gid") ever flood the feed.
  if (CONSENSUS_REQUIRE_RESOLVABLE_FIXTURE && !resolved) {
    console.log(`[vipGroup] suppressed consensus alert — ${label} not found on Pinnacle or in the sports DB, nothing to bet on.`);
    return null;
  }

  // 2. Timing. Only a CONFIRMED-finished match is dropped — an alert on a
  //    done match is pure noise (it'd be graded the same minute). Pre-match,
  //    live, and unknown-timing all post now; a live one just carries a
  //    "match en cours" status line (Noaim 2026-09-04: two channels posted
  //    the same in-play pick and the bot stayed silent). Restore the old
  //    pre-match-only behaviour with CONSENSUS_SUPPRESS_INPLAY=true.
  const inPlay = isLive || liveMinute != null || (startMs != null && Date.now() > startMs + 2 * 60_000);
  if (finished) {
    console.log(`[vipGroup] suppressed consensus alert — ${label}: match already finished, nothing left to bet.`);
    return null;
  }
  if (CONSENSUS_SUPPRESS_INPLAY && inPlay) {
    console.log(`[vipGroup] suppressed consensus alert — ${label}: in play and CONSENSUS_SUPPRESS_INPLAY is on.`);
    return null;
  }

  // 3. First-half over/under on a match that has already kicked off. The
  //    bet's whole window is ~45 min, and by the time three channels have
  //    posted it and the consensus propagates the goal is very often
  //    already in — the pick reads as "already won" the moment it lands
  //    (Noaim 2026-09-03 "le but avait déjà été marqué", again 2026-09-09
  //    on Independiente Yumbo vs Deportes Quindio). Unlike a full-match
  //    in-play pick (which Noaim wants kept), an HT line can no longer be
  //    acted on once the clock is running — drop it regardless of the
  //    CONSENSUS_SUPPRESS_INPLAY flag. A live score that already clears
  //    the line is an even harder drop.
  if (tip.market === "OVER_UNDER_HT") {
    const htLine = Number.parseFloat(tip.selection.replace(/^(?:OVER|UNDER)_/, "").replace(/_/g, "."));
    if (inPlay || finished) {
      console.log(`[vipGroup] suppressed consensus alert — ${label}: first-half pick and the match is already under way, can't be acted on.`);
      return null;
    }
    if (liveGoals != null && Number.isFinite(htLine) && liveGoals > htLine) {
      console.log(`[vipGroup] suppressed consensus alert — ${label}: HT line ${htLine} already cleared (live total ${liveGoals}).`);
      return null;
    }
  }

  // 4. Sport/pick contradiction (e.g. "over 5,5 buts" on a basketball
  //    match) — the pick is wrong, not just mislabelled. Drop it; returning
  //    null releases the claim so a corrected later message can still fire.
  if (sport && pickContradictsSport(tip, sport)) {
    console.log(
      `[vipGroup] suppressed consensus alert — ${label} resolved as ${sport} but pick is ${tip.market} ${tip.selection} (goals-shaped).`,
    );
    return null;
  }

  const live = inPlay ? { minute: liveMinute } : null;
  console.log(
    `[vipGroup] posting consensus alert — ${label} — ${onPinnacle ? "on Pinnacle" : "not on Pinnacle (sports-DB only)"}${country ? `, ${country}` : ""}${sport ? `, ${sport}` : ""}${live ? `, LIVE${live.minute != null ? ` ${live.minute}'` : ""}` : ""}.`,
  );
  const sent = await client.sendMessage(entity, { message: formatConsensusMessage({ ...tip, country, sport, live }) });
  // gramjs returns Api.Message; peerId is the chat, id is the message id.
  const chatId = sent.chatId ? String(sent.chatId) : sent.peerId ? String((sent.peerId as { channelId?: bigint | number }).channelId ?? sent.peerId) : null;
  const messageId = typeof sent.id === "number" ? sent.id : Number(sent.id);
  if (!chatId || !Number.isFinite(messageId)) return null;
  return { chatId, messageId };
}
