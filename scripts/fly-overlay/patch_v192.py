"""Overlay v192: VIP picks graded from the source groups' own messages too.

Applies on top of the production v191 consensusOutcomeResolver.ts and
flashscore.ts. Usage: python3 patch_v192.py <root> (Dockerfile.v192 runs it
during the build, on the files of the production image). Needs the new
src/worker/telegram/telegramResults.ts next to them.

Noaim 2026-10-29: picks finished long ago stayed without ✅/❌/🔁 because no
score site had the match (esports MESA Pro Series, Myanmar U20, Mumbai
Super League). Now, when no score is found:
- the result the tipsters themselves posted in their group (edited pick,
  reply, message naming the match, or a short "✅✅✅" right after it) grades
  the pick, emojis only since there is no score;
- Flashscore's esports feed is read too (match winner only);
- a pick is given up after 24h instead of 8h, and the ones given up in the
  last 48h get another look once at start-up;
- The Audacity vs Chinggis Warriors is set WON (the tipster said it passed).
"""
import sys
root = sys.argv[1]


def patch(rel, edits, marker):
    p = f"{root}/{rel}"
    s = open(p).read()
    if marker in s:
        sys.exit(f"{rel}: already patched")
    for old, new in edits:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
        s = s.replace(old, new)
    open(p, "w").write(s)
    print("patched", rel)


patch("src/worker/providers/flashscore.ts", [
    ("""  homeScore: number;
  awayScore: number;
}""", """  homeScore: number;
  awayScore: number;
  /** Flashscore sport id, set by fetchFlashscoreResults. */
  sport?: number;
}

/** Esports scores are maps won, so they only grade a match winner. */
export const ESPORTS_SPORT_ID = 36;"""),
    ("""const SPORTS = [1, 3, 4]; // football, basketball, ice hockey""",
     """const SPORTS = [1, 3, 4, 36]; // football, basketball, ice hockey, esports"""),
    ("""        rows.push(...parseFlashscoreFeed(await res.text()));""",
     """        rows.push(...parseFlashscoreFeed(await res.text()).map((row) => ({ ...row, sport })));"""),
], "ESPORTS_SPORT_ID")

patch("src/worker/telegram/consensusOutcomeResolver.ts", [
    ("""import { fetchFlashscoreResults, type FlashscoreRow } from "../providers/flashscore";""",
     """import { ESPORTS_SPORT_ID, fetchFlashscoreResults, type FlashscoreRow } from "../providers/flashscore";
import { combineVerdicts, verdictFromChat, type ChatMessage, type ChatVerdict } from "./telegramResults";"""),
    ("""const MAX_AGE_HOURS = 30;""", """// 48h since v192: a result the tipsters post late still gets read.
const MAX_AGE_HOURS = 48;"""),
    ("""const UNFINDABLE_AGE_HOURS = 8;""", """// 24h since v192 (was 8h): the source groups often post the result hours
// after the match, and the Flashscore day feeds cover three days.
const UNFINDABLE_AGE_HOURS = 24;"""),
    ("""export async function resolvePendingConsensusOutcomes(""", """/** A result the source groups gave that no feed has, matched like any
 *  fixture (Noaim 2026-10-29: its tipster wrote that the pick passed). */
const MANUAL_VERDICTS: { homeTeam: string; awayTeam: string; outcome: ChatVerdict }[] = [
  { homeTeam: "The Audacity", awayTeam: "Chinggis Warriors", outcome: "WON" },
];

const within = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))]);

/** The account's chats by id, as the tip listener stores it
 *  (String(message.chatId)); refreshed every 10 min. */
let sourceChats: { at: number; byId: Map<string, EntityLike> } | null = null;
/** Last messages of each source chat, read at most every 5 min. */
const sourceChatMessages = new Map<string, { at: number; messages: ChatMessage[] }>();

async function recentSourceMessages(client: TelegramClient, chatId: string): Promise<ChatMessage[]> {
  const cached = sourceChatMessages.get(chatId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.messages;
  let messages: ChatMessage[] = [];
  try {
    if (!sourceChats || Date.now() - sourceChats.at > 10 * 60_000) {
      const dialogs = await within(client.getDialogs({ limit: 500 }), 30_000);
      sourceChats = { at: Date.now(), byId: new Map(dialogs.filter((d) => d.entity).map((d) => [String(d.id), d.entity as EntityLike])) };
    }
    const entity = sourceChats.byId.get(chatId);
    if (entity) {
      const raw = await within(client.getMessages(entity, { limit: 200 }), 20_000);
      messages = raw.map((m) => ({
        id: m.id,
        date: m.date,
        text: m.message ?? "",
        editDate: m.editDate ?? null,
        replyToId: m.replyTo instanceof Api.MessageReplyHeader ? (m.replyTo.replyToMsgId ?? null) : null,
      }));
    }
  } catch (err) {
    console.error(`[consensusOutcomeResolver] reading source chat ${chatId} failed:`, err instanceof Error ? err.message : err);
  }
  sourceChatMessages.set(chatId, { at: Date.now(), messages });
  return messages;
}

let revivedUnresolved = false;

export async function resolvePendingConsensusOutcomes("""),
    ("""  const batchLimit = options.batchLimit ?? 20;""",
     """  // 60 since v192 (was 20): with picks kept 24h the oldest 20 would starve the newest.
  const batchLimit = options.batchLimit ?? 60;"""),
    ("""  const pending = await db.consensusAlert.findMany({""", """  // Once per process start: alerts given up on without any score in the last
  // MAX_AGE_HOURS get another look with the newer sources (Noaim 2026-10-29).
  if (!revivedUnresolved) {
    revivedUnresolved = true;
    const revived = await db.consensusAlert.updateMany({
      where: { outcome: "UNRESOLVED", homeScore: null, sentAt: { gte: new Date(now - MAX_AGE_HOURS * 3600_000) } },
      data: { outcome: null, resolvedAt: null },
    });
    if (revived.count > 0) console.log(`[consensusOutcomeResolver] ${revived.count} unresolved alert(s) of the last ${MAX_AGE_HOURS}h get another look.`);
  }

  const pending = await db.consensusAlert.findMany({"""),
    ("""  for (const alert of pending) {
    const ageHours = (now - alert.sentAt.getTime()) / 3600_000;
""", """  // The source groups' picks of the last few days, read once per pass.
  type SourceTipRow = { sourceChatId: string; detectedAt: Date; rawText: string; homeTeam: string | null; awayTeam: string | null; market: string | null };
  let sourceTips: SourceTipRow[] | null = null;
  const getSourceTips = async (): Promise<SourceTipRow[]> =>
    (sourceTips ??= await db.scrapedTip.findMany({
      where: { detectedAt: { gte: new Date(now - (MAX_AGE_HOURS + 26) * 3600_000) }, homeTeam: { not: null }, awayTeam: { not: null } },
      select: { sourceChatId: true, detectedAt: true, rawText: true, homeTeam: true, awayTeam: true, market: true },
    }));

  /** What the groups behind this alert said of its result in their own
   *  chats (telegramResults.ts), when they agree. */
  const findChatVerdict = async (alert: (typeof pending)[number]): Promise<ChatVerdict | null> => {
    const fixture = { homeTeam: alert.homeTeam ?? "", awayTeam: alert.awayTeam ?? "" };
    const sentMs = alert.sentAt.getTime();
    const tips = await getSourceTips();
    const sameMatch = (t: SourceTipRow) =>
      t.homeTeam != null && t.awayTeam != null && fuzzyFixtureMatch(fixture, { homeTeam: t.homeTeam, awayTeam: t.awayTeam });
    // The tips the alert was built from: same match, stored in the 26h before it went out.
    const own = tips.filter(
      (t) =>
        t.market !== "FLIP" &&
        t.market !== "CASHOUT" &&
        t.detectedAt.getTime() <= sentMs + 5 * 60_000 &&
        t.detectedAt.getTime() >= sentMs - 26 * 3600_000 &&
        sameMatch(t),
    );
    const verdicts: (ChatVerdict | null)[] = [];
    for (const chatId of new Set(own.map((t) => t.sourceChatId))) {
      const pick = own.filter((t) => t.sourceChatId === chatId).sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())[0];
      const otherPicksMs = tips.filter((t) => t.sourceChatId === chatId && !sameMatch(t)).map((t) => t.detectedAt.getTime());
      verdicts.push(verdictFromChat(pick, await recentSourceMessages(client, chatId), otherPicksMs, fixture));
    }
    return combineVerdicts(verdicts);
  };

  /** A verdict with no score (the groups' messages, MANUAL_VERDICTS): the
   *  alert gets its emojis without a score and nothing goes to X. */
  const applyChatVerdict = async (alert: (typeof pending)[number], outcome: ChatVerdict): Promise<void> => {
    await db.consensusAlert.update({ where: { id: alert.id }, data: { outcome, resolvedAt: new Date() } });
    resolved++;
    console.log(`[consensusOutcomeResolver] ${alert.homeTeam} vs ${alert.awayTeam}: ${outcome}, from the source groups' messages.`);
    const marked = await markVipResult(client, alert.sentMessageId, outcome);
    if (outcome === "WON" && marked) {
      await forwardWonToFreeChannel(client, alert.sentMessageId);
    }
  };

  for (const alert of pending) {
    const ageHours = (now - alert.sentAt.getTime()) / 3600_000;
"""),
    ("""    if (ageHours > MAX_AGE_HOURS) {
      await markUnresolved(alert);
      continue;
    }
""", """    if (ageHours > MAX_AGE_HOURS) {
      await markUnresolved(alert);
      continue;
    }

    const manual = MANUAL_VERDICTS.find((m) => fuzzyFixtureMatch({ homeTeam: alert.homeTeam!, awayTeam: alert.awayTeam! }, m));
    if (manual) {
      await applyChatVerdict(alert, manual.outcome);
      continue;
    }
"""),
    ("""      const hit = (await getFlashscoreRows()).find((row) => fuzzyFixtureMatch({ homeTeam: alert.homeTeam!, awayTeam: alert.awayTeam! }, row));""",
     """      const hit = (await getFlashscoreRows()).find(
        (row) =>
          (row.sport !== ESPORTS_SPORT_ID || alert.market === "1X2") &&
          fuzzyFixtureMatch({ homeTeam: alert.homeTeam!, awayTeam: alert.awayTeam! }, row),
      );"""),
    ("""      // Well past any real match length and still nothing on any source —""", """      // No score anywhere: the result the source groups posted themselves.
      const said = await findChatVerdict(alert);
      if (said) {
        await applyChatVerdict(alert, said);
        continue;
      }

      // Well past any real match length and still nothing on any source —"""),
], "findChatVerdict")
