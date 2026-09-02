import type { TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import type { PrismaClient } from "@/generated/prisma/client";
import { extractFixture, extractSelection, buildParsedTip, type ParsedTip } from "./tipParser";
import { resolveFixture } from "./fixtureResolver";
import { extractOdds, extractResult } from "./ticketParser";
import { extractTextFromPhoto } from "./tipOcr";
import { applyConsensusAndAlert } from "./tipConsensus";
import { sendConsensusAlert } from "./vipGroup";
import { shouldSendConsensusAlert } from "./alertFormat";
import { rememberFixture, recallFixture, isFirehoseChat } from "./chatFixtureContext";
import { extractSelectionWithLLM, extractFullTipWithLLM } from "./tipLlmFallback";
import { getTipConsensusConfig, getChatFixtureContextWindowMinutes, getMaxTipMessageAgeMinutes, SEND_TIP_CONSENSUS_ALERTS } from "../config";

/**
 * Wires the MTProto client's NewMessage stream to the consensus pipeline.
 * Listens across every group/channel the personal account belongs to —
 * there's no per-chat allowlist, since the point is to catch whichever
 * groups happen to agree, not a curated list decided up front.
 */
export function startTipListener(client: TelegramClient, db: PrismaClient): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await handleMessage(client, db, event);
    } catch (err) {
      console.error("[tipListener] failed to process message", err);
    }
  }, new NewMessage({ incoming: true }));

  console.log("[tipListener] listening across all joined groups/channels.");
}

async function handleMessage(client: TelegramClient, db: PrismaClient, event: NewMessageEvent): Promise<void> {
  if (event.isPrivate) return; // only group/channel chatter counts as a tip source

  const message = event.message;
  const sourceChatId = message.chatId ? String(message.chatId) : null;
  if (!sourceChatId) return;

  // Reject backlog before doing any work on it (title lookup, OCR, LLM
  // calls) — a reconnect after downtime can deliver a burst of these at
  // once, which is exactly when we most want to skip the expensive path.
  // `message.date` is Telegram's own timestamp (seconds since epoch) for
  // when this was actually posted, unlike our `detectedAt` which only ever
  // recorded when *we* got around to processing it. See config.ts for the
  // incident this fixes.
  const messageAgeMinutes = (Date.now() - message.date * 1000) / 60_000;
  if (messageAgeMinutes > getMaxTipMessageAgeMinutes()) {
    console.log(`[tipListener] skipping stale message from chat ${sourceChatId} — sent ${Math.round(messageAgeMinutes)} min ago, too old to count as a live pick (likely backlog from a reconnect).`);
    return;
  }

  let sourceChatTitle: string | null = null;
  try {
    const chat = await event.getChat();
    if (chat && "title" in chat && chat.title) {
      sourceChatTitle = chat.title as string;
    } else if (message.peerId) {
      // getChat() comes back bare for some broadcast channels even once
      // their entity is cached — a direct getEntity fills in the title so
      // ScrapedTip.sourceChatTitle isn't perpetually null (it always was
      // before 2026-08-27), which is what makes "which channels actually
      // feed consensus" answerable from the data.
      const entity = await client.getEntity(message.peerId);
      if (entity && "title" in entity && entity.title) sourceChatTitle = entity.title as string;
    }
  } catch {
    // title is a nice-to-have for observability, never worth failing a message over
  }

  const caption = message.message || null;
  const ocr = message.photo ? await extractTextFromPhoto(client, message) : null;
  const ocrText = ocr?.text ?? null;
  const imageBuffer = ocr?.imageBuffer;

  // A ✅/❌ is never ambiguous the way "which team" or "which market" can
  // be, so for the ticket outcome only (not the pick/team logic below), it's
  // safe to read the whole message as one unit — a bet-slip photo with the
  // odds and a short "W2✅" caption is one ticket, one result, even though
  // its pick and fixture are still resolved from text/image independently.
  const messageResult = extractResult([caption, ocrText].filter(Boolean).join("\n"));

  // Text and image are handled as two independent candidate sources for the
  // pick/fixture itself — most real tip channels post the match/market as a
  // bet slip screenshot and only a short confirmation as text, so the two
  // must never be merged into one parse attempt (Noaim, 2026-08-22).
  if (caption) {
    await processCandidate(client, db, sourceChatId, sourceChatTitle, caption, "TEXT", messageResult, undefined);
  }
  if (ocrText) {
    await processCandidate(client, db, sourceChatId, sourceChatTitle, ocrText, "IMAGE", messageResult, imageBuffer);
  }
}

/**
 * A single candidate (one message's text, or one photo's OCR output) goes
 * through three attempts in order:
 *  1. Fixture and pick both in this candidate — the strongest signal.
 *  2. Only a fixture ("Puerto Rico vs Cuba", no pick yet) — remembered for
 *     this chat so a later context-free message can resolve against it.
 *  3. No fixture here at all — try resolving the pick against whichever
 *     fixture this same chat mentioned most recently (see
 *     chatFixtureContext.ts), so "W2" posted after a bet-slip image still
 *     counts instead of being silently dropped for lack of context.
 */
async function processCandidate(
  client: TelegramClient,
  db: PrismaClient,
  sourceChatId: string,
  sourceChatTitle: string | null,
  rawText: string,
  source: "TEXT" | "IMAGE",
  messageResult: "WON" | "LOST" | "PENDING",
  imageBuffer: Buffer | undefined,
): Promise<void> {
  const fixture = extractFixture(rawText);

  let parsed: ParsedTip | null = null;
  // Fixture found in this candidate — try the deterministic parser, then
  // fall back to the LLM for the market/selection only (fixture stays the
  // one we already extracted deterministically).
  if (fixture) {
    let marketSelection = extractSelection(rawText, fixture);
    if (!marketSelection) {
      marketSelection = await extractSelectionWithLLM({ rawText, fixture, imageBuffer });
      if (marketSelection) {
        console.log(`[tipListener] LLM extracted pick for ${fixture.homeTeam} vs ${fixture.awayTeam}: ${marketSelection.market} ${marketSelection.selection}`);
      }
    }
    if (marketSelection) {
      const canonical = await resolveFixture(db, fixture);
      parsed = buildParsedTip(canonical ?? fixture, marketSelection, canonical ?? undefined);
    } else {
      await rememberFixture(db, sourceChatId, fixture);
    }
  } else {
    // No fixture in this candidate — try the chat's remembered last-fixture
    // as anchor, then again deterministic first + LLM fallback. Skipped for
    // firehose chats (many distinct matches per hour, e.g. a live-odds feed):
    // "last fixture this chat mentioned" is meaningless noise there and has
    // caused real cross-match mislabeling (see chatFixtureContext.ts).
    const firehose = await isFirehoseChat(db, sourceChatId, getChatFixtureContextWindowMinutes());
    if (firehose) {
      console.log(`[tipListener] skipping chat-context recall for "${sourceChatTitle ?? sourceChatId}" — high-volume multi-match chat, not a single-match tipster.`);
    }
    const remembered = firehose ? null : await recallFixture(db, sourceChatId, getChatFixtureContextWindowMinutes());
    if (remembered) {
      let marketSelection = extractSelection(rawText, remembered);
      if (!marketSelection) {
        marketSelection = await extractSelectionWithLLM({ rawText, fixture: remembered, imageBuffer });
        if (marketSelection) {
          console.log(`[tipListener] LLM extracted pick (via chat context) for ${remembered.homeTeam} vs ${remembered.awayTeam}: ${marketSelection.market} ${marketSelection.selection}`);
        }
      }
      if (marketSelection) {
        const canonical = await resolveFixture(db, remembered);
        parsed = buildParsedTip(canonical ?? remembered, marketSelection, canonical ?? undefined);
      }
    }
  }

  // Deterministic parser failed AND chat-context recall failed — hand both
  // extraction jobs to the LLM: teams AND pick from the OCR/image. This
  // catches:
  //  - Bet-slip screenshots where "UMLYNGKA UMPHRUP" appears on one all-caps
  //    line with no separator — no regex covers that reliably.
  //  - The 2-message tipster pattern (SandWorm, STRANGE GAME FINDER, Old
  //    Money): a bare photo of the match, then a short text pick like "OVER
  //    4.75" — the photo has no odds value in its OCR (a scoreboard, not a
  //    bet slip), but Claude Vision reads the team names off the image so
  //    the next message ("OVER 4.75") can resolve against the remembered
  //    fixture. So: for IMAGE we always try; for TEXT we still gate on an
  //    odds value to avoid burning API calls on chat noise.
  if (!parsed) {
    const hasBettingCue = source === "IMAGE" || extractOdds(rawText) !== null;
    if (hasBettingCue) {
      const full = await extractFullTipWithLLM({ rawText, imageBuffer });
      if (full) {
        const fixtureFromLlm = { homeTeam: full.homeTeam, awayTeam: full.awayTeam };
        if (full.market && full.selection) {
          const canonical = await resolveFixture(db, fixtureFromLlm);
          parsed = buildParsedTip(canonical ?? fixtureFromLlm, { market: full.market, selection: full.selection }, canonical ?? undefined);
          console.log(`[tipListener] LLM full extraction from "${sourceChatTitle ?? sourceChatId}": ${full.homeTeam} vs ${full.awayTeam} — ${full.market} ${full.selection}`);
        } else {
          // Fixture identified but the COMBINED "teams + pick" pass didn't
          // surface a pick. Retry once with the focused pick-only extractor
          // now that the fixture is pinned as an anchor — a narrower
          // question ("teams are X vs Y, what is THE pick?") routinely
          // succeeds where the broader call was too cautious (this is
          // exactly the GAME THEORY 313 miss: teams read fine, pick not,
          // and that channel never counted toward consensus). Still fully
          // model-judged — returns null and we just remember the fixture if
          // there's genuinely no stated pick.
          const focused = await extractSelectionWithLLM({ rawText, fixture: fixtureFromLlm, imageBuffer });
          if (focused) {
            const canonical = await resolveFixture(db, fixtureFromLlm);
            parsed = buildParsedTip(canonical ?? fixtureFromLlm, focused, canonical ?? undefined);
            console.log(`[tipListener] LLM full+focused extraction from "${sourceChatTitle ?? sourceChatId}": ${fixtureFromLlm.homeTeam} vs ${fixtureFromLlm.awayTeam} — ${focused.market} ${focused.selection}`);
          } else {
            // Genuinely no pick here — remember the fixture so a later
            // message in this chat can resolve against it.
            await rememberFixture(db, sourceChatId, fixtureFromLlm);
            console.log(`[tipListener] LLM full extraction (fixture only) from "${sourceChatTitle ?? sourceChatId}": ${full.homeTeam} vs ${full.awayTeam}`);
          }
        }
      }
    }
  }

  // Ticket logging (per-group stats: "tickets today", "hit rate this
  // month") is independent of the consensus pipeline below — it only needs
  // an odds value, not an identifiable fixture, so it runs even when
  // `parsed` above came back null (Noaim, 2026-08-22).
  const odds = extractOdds(rawText);
  if (odds !== null) {
    await db.groupTicket.create({
      data: {
        sourceChatId,
        sourceChatTitle,
        source,
        rawText,
        odds,
        result: messageResult,
        homeTeam: parsed?.homeTeam ?? fixture?.homeTeam ?? null,
        awayTeam: parsed?.awayTeam ?? fixture?.awayTeam ?? null,
        market: parsed?.market ?? null,
        selection: parsed?.selection ?? null,
      },
    });
  }

  if (!parsed) return;

  await db.scrapedTip.create({
    data: {
      sourceChatId,
      sourceChatTitle,
      source,
      rawText,
      fingerprint: parsed.fingerprint,
      homeTeam: parsed.homeTeam,
      awayTeam: parsed.awayTeam,
      market: parsed.market,
      selection: parsed.selection,
    },
  });
  console.log(
    `[tipListener] stored ${source} pick from "${sourceChatTitle ?? sourceChatId}": ${parsed.homeTeam} vs ${parsed.awayTeam} — ${parsed.market} ${parsed.selection}`,
  );

  // Strict: exact same market+selection across N chats. Directional: same
  // side of the same match across N chats (Over 4.5 / 5.5 / 6.5 all bucket
  // together, as do the various handicap lines on the same favorite). The
  // full lifecycle — count, pick mode, observation short-circuit, quality
  // gate, claim, send, release-on-failure, persist on the exact claimed row
  // — lives in applyConsensusAndAlert so it is testable without a Telegram
  // client.
  const outcome = await applyConsensusAndAlert(db, parsed, {
    config: getTipConsensusConfig(),
    sendEnabled: SEND_TIP_CONSENSUS_ALERTS,
    qualityGate: shouldSendConsensusAlert,
    resolveOddsAtAlert: () => resolveOddsAtAlert(db, rawText, parsed),
    send: (tip) => sendConsensusAlert(client, tip),
  });

  if (!outcome.mode) return;
  console.log(`[tipListener] consensus reached (${outcome.mode}) for ${parsed.fingerprint} (${outcome.groupCount} groupes).`);
  if (outcome.sent) {
    console.log(`[tipListener] consensus alert posted to VIP group (${outcome.fingerprint}).`);
  } else if (outcome.reason === "observation") {
    console.log("[tipListener] SEND_TIP_CONSENSUS_ALERTS=false — mode observation, rien envoyé, consensus non consommé.");
  } else {
    console.log(`[tipListener] consensus ${outcome.fingerprint} non envoyé — ${outcome.reason ?? "raison inconnue"}.`);
  }
}

/**
 * Odds to record on the alert: the triggering message's own stated value if
 * it has one, otherwise any recent tip on the same fixture that carried a
 * plausible value (real miss 2026-09-02: Al Magd vs Abu El Matamir parsed
 * cleanly but the triggering post had no numeric odds). Best-effort — null
 * just omits the odds line rather than filling a placeholder.
 */
async function resolveOddsAtAlert(db: PrismaClient, rawText: string, parsed: ParsedTip): Promise<number | null> {
  const own = extractOdds(rawText);
  if (own !== null) return own;
  if (!parsed.homeTeam || !parsed.awayTeam) return null;
  try {
    const recentTips = await db.scrapedTip.findMany({
      where: {
        detectedAt: { gte: new Date(Date.now() - 30 * 60_000) },
        OR: [
          { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam },
          { homeTeam: parsed.awayTeam, awayTeam: parsed.homeTeam },
        ],
      },
      orderBy: { detectedAt: "desc" },
      take: 10,
    });
    for (const t of recentTips) {
      const o = extractOdds(t.rawText);
      if (o !== null && o >= 1.15 && o <= 15) return o;
    }
  } catch {
    // odds fallback is a nice-to-have — never fail the alert over it
  }
  return null;
}
