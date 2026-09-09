import type { TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import type { PrismaClient } from "@/generated/prisma/client";
import { extractFixture, extractSelection, buildParsedTip, getDirectionKey, fuzzyFixtureMatch, type ParsedTip, type Fixture } from "./tipParser";
import { resolveFixture } from "./fixtureResolver";
import { extractOdds, extractLabeledOdds, extractResult } from "./ticketParser";
import { extractTextFromPhoto } from "./tipOcr";
import { applyConsensusAndAlert } from "./tipConsensus";
import { sendConsensusAlert } from "./vipGroup";
import { shouldSendConsensusAlert } from "./alertFormat";
import { rememberFixture, recallFixture, isFirehoseChat } from "./chatFixtureContext";
import { extractSelectionWithLLM, extractFullTipWithLLM } from "./tipLlmFallback";
import { getTipConsensusConfig, getTipConsensusHtWindowMinutes, getChatFixtureContextWindowMinutes, getMaxTipMessageAgeMinutes, SEND_TIP_CONSENSUS_ALERTS } from "../config";

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

  // Text and image are two candidate sources for the pick/fixture — NOT
  // merged into one parse attempt (a bet-slip photo + a "W2✅" caption are
  // two different statements), but no longer fully independent either: the
  // IMAGE is parsed FIRST and the fixture it yields is handed to the TEXT
  // pass as a same-message anchor. This is what fixes the "screenshot of
  // the match + short 'Over 6' caption" pattern on firehose channels
  // (Suspicious Game, MAFIA.BET…): the caption has no fixture of its own,
  // chat-context recall is disabled for those high-volume chats, and
  // before this the caption pick was silently dropped — so two channels
  // posting the exact same live pick never reached consensus (Noaim,
  // 2026-09-04: "y'a juste 2 groupes qui ont envoyé le même pronostic et
  // tu l'as raté").
  let imageFixture: Fixture | null = null;
  if (ocrText) {
    imageFixture = await processCandidate(client, db, sourceChatId, sourceChatTitle, ocrText, "IMAGE", messageResult, imageBuffer, undefined);
  }
  if (caption) {
    await processCandidate(client, db, sourceChatId, sourceChatTitle, caption, "TEXT", messageResult, undefined, imageFixture ?? undefined);
  }
}

/**
 * A single candidate (one message's text, or one photo's OCR output) goes
 * through three attempts in order:
 *  1. Fixture and pick both in this candidate — the strongest signal.
 *  2. Only a fixture ("Puerto Rico vs Cuba", no pick yet) — remembered for
 *     this chat so a later context-free message can resolve against it.
 *  3. No fixture here at all — try `sameMessageFixture` (the fixture the
 *     OTHER candidate of THIS SAME message resolved, e.g. the screenshot's
 *     teams for a caption that only says "Over 6"), then the chat's most
 *     recently mentioned fixture (see chatFixtureContext.ts), so a
 *     context-free pick still counts instead of being silently dropped.
 *
 * Returns the fixture this candidate identified (canonical names when a
 * pick was built, else the raw extracted/LLM fixture, else null) so the
 * caller can feed it to the next candidate as `sameMessageFixture`.
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
  sameMessageFixture: Fixture | undefined,
): Promise<Fixture | null> {
  const fixture = extractFixture(rawText);
  let identifiedFixture: Fixture | null = fixture;

  let parsed: ParsedTip | null = null;
  // Odds the LLM read off the bet-slip screenshot for the selected pick —
  // threaded into the stored rawText so the VIP alert's "Cote au
  // signalement" line has a value (regex on garbled OCR rarely finds one).
  let llmOdds: number | null = null;
  // Fixture found in this candidate — try the deterministic parser, then
  // fall back to the LLM for the market/selection only (fixture stays the
  // one we already extracted deterministically).
  if (fixture) {
    let marketSelection = extractSelection(rawText, fixture);
    if (!marketSelection) {
      const llm = await extractSelectionWithLLM({ rawText, fixture, imageBuffer });
      if (llm) {
        marketSelection = llm;
        llmOdds = llm.odds;
        console.log(`[tipListener] LLM extracted pick for ${fixture.homeTeam} vs ${fixture.awayTeam}: ${llm.market} ${llm.selection}`);
      }
    }
    if (marketSelection) {
      const canonical = await resolveFixture(db, fixture);
      parsed = buildParsedTip(canonical ?? fixture, marketSelection, canonical ?? undefined);
    } else {
      await rememberFixture(db, sourceChatId, fixture);
    }
  } else if (sameMessageFixture) {
    // No fixture in this candidate, but the OTHER half of THIS SAME message
    // (the screenshot's teams for an "Over 6" caption) gave us one. This is
    // NOT chat-context recall — it's the same message, so it's safe even on
    // firehose channels where recall is disabled, and it's what lets two
    // channels posting "photo + short caption" for the same live pick reach
    // consensus.
    let marketSelection = extractSelection(rawText, sameMessageFixture);
    if (!marketSelection) {
      const llm = await extractSelectionWithLLM({ rawText, fixture: sameMessageFixture, imageBuffer });
      if (llm) { marketSelection = llm; llmOdds = llm.odds; }
    }
    if (marketSelection) {
      const canonical = await resolveFixture(db, sameMessageFixture);
      parsed = buildParsedTip(canonical ?? sameMessageFixture, marketSelection, canonical ?? undefined);
      identifiedFixture = canonical ?? sameMessageFixture;
      console.log(
        `[tipListener] resolved ${source} pick against same-message fixture for "${sourceChatTitle ?? sourceChatId}": ` +
          `${sameMessageFixture.homeTeam} vs ${sameMessageFixture.awayTeam} — ${marketSelection.market} ${marketSelection.selection}`,
      );
    }
  }
  if (!parsed && !fixture && !sameMessageFixture) {
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
        const llm = await extractSelectionWithLLM({ rawText, fixture: remembered, imageBuffer });
        if (llm) {
          marketSelection = llm;
          llmOdds = llm.odds;
          console.log(`[tipListener] LLM extracted pick (via chat context) for ${remembered.homeTeam} vs ${remembered.awayTeam}: ${llm.market} ${llm.selection}`);
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
        identifiedFixture = fixtureFromLlm; // hand it to the other candidate of this message even if no pick is found here
        if (full.odds != null) llmOdds = full.odds;
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
            if (focused.odds != null) llmOdds = focused.odds;
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

  if (!parsed) return identifiedFixture;

  // Result recap guard (Noaim 2026-09-08): several source channels re-post
  // ✅/❌ recaps of picks they sent in their OWN private VIP, and the parser
  // happily reads the recap's teams + pick as a fresh tip — feeding stale
  // "picks" into the consensus (this is how the Arsenal Sarandi Reserves
  // alert got fired mid-blowout: two channels were showing off yesterday's
  // ticket, not calling a live bet). If the message clearly resolves to
  // WON/LOST, skip storing as ScrapedTip — the GroupTicket row above still
  // captures it for stats. PENDING (the default, and unambiguous fresh
  // picks) always stores, matching Noaim's "si t'as un doute envoie quand
  // même" rule.
  if (messageResult !== "PENDING") {
    console.log(
      `[tipListener] skipping ${source} pick from "${sourceChatTitle ?? sourceChatId}" — message is a ${messageResult} recap, not a fresh tip: ${parsed.homeTeam} vs ${parsed.awayTeam}`,
    );
    return identifiedFixture;
  }

  // If the LLM read an odds off the screenshot and the raw text carries no
  // labeled cote of its own, append a normalized "cote X.XX" line — the
  // consensus odds sampler (resolveOddsSamplesAtAlert) reads exactly that
  // pattern back out, so the VIP alert gets a "Cote au signalement" value
  // even for pure bet-slip-image tips (Noaim, 2026-09-05).
  const rawTextForStore =
    llmOdds != null && extractLabeledOdds(rawText) == null ? `${rawText}\ncote ${llmOdds.toFixed(2)}` : rawText;

  await db.scrapedTip.create({
    data: {
      sourceChatId,
      sourceChatTitle,
      source,
      rawText: rawTextForStore,
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
  // First-half picks use a much tighter window (the bet dies within ~45
  // min of kickoff) so a stale corroboration can't fire an already-decided
  // "over 0.5 HT". Full-match picks keep the wide default.
  const baseConfig = getTipConsensusConfig();
  const config =
    parsed.market === "OVER_UNDER_HT"
      ? { ...baseConfig, windowMinutes: Math.min(baseConfig.windowMinutes, getTipConsensusHtWindowMinutes()) }
      : baseConfig;

  const outcome = await applyConsensusAndAlert(db, parsed, {
    config,
    sendEnabled: SEND_TIP_CONSENSUS_ALERTS,
    qualityGate: shouldSendConsensusAlert,
    resolveOddsSamplesAtAlert: () => resolveOddsSamplesAtAlert(db, rawTextForStore, parsed),
    send: (tip) => sendConsensusAlert(client, tip),
  });

  if (!outcome.mode) return identifiedFixture;
  console.log(`[tipListener] consensus reached (${outcome.mode}) for ${parsed.fingerprint} (${outcome.groupCount} groupes).`);
  if (outcome.sent) {
    console.log(`[tipListener] consensus alert posted to VIP group (${outcome.fingerprint}).`);
  } else if (outcome.reason === "observation") {
    console.log("[tipListener] SEND_TIP_CONSENSUS_ALERTS=false — mode observation, rien envoyé, consensus non consommé.");
  } else {
    console.log(`[tipListener] consensus ${outcome.fingerprint} non envoyé — ${outcome.reason ?? "raison inconnue"}.`);
  }
  return identifiedFixture;
}

/**
 * Every labeled odds the groups behind this consensus stated — averaged
 * downstream into one displayed value (Noaim, 2026-09-05: user wants a
 * single reference price on the alert, not a range). Only counts a number
 * the message explicitly labels as odds ("cote 1,85", "@2.10");
 * `extractLabeledOdds` drops the bare-trailing-number guesses that kept
 * surfacing market lines and scorelines.
 *
 * Scoped to the SAME DIRECTION on the SAME FUZZY-MATCHED FIXTURE — not just
 * the exact fingerprint — because for a directional consensus (Over 3.5 /
 * Over 4.5 / Over 5.5 all bucketed as "over_goals") the odds all speak to
 * the same underlying bet: "goals will come, this is what different books
 * are pricing it at". Sampling only the strict fingerprint missed most
 * groups on directional-only consensuses (which is why the recent alerts
 * carried no odds line at all).
 */
async function resolveOddsSamplesAtAlert(db: PrismaClient, rawText: string, parsed: ParsedTip): Promise<number[]> {
  const samples: number[] = [];
  const own = extractLabeledOdds(rawText);
  if (own !== null) samples.push(own);
  try {
    // Load every recent tip and filter in JS (already the pattern used in
    // checkDirectionalConsensus). 30-min window matches the consensus window.
    const recent = await db.scrapedTip.findMany({
      where: { detectedAt: { gte: new Date(Date.now() - 30 * 60_000) } },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });

    const ownDir = getDirectionKey(parsed.market, parsed.selection, { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam });
    for (const t of recent) {
      if (!t.homeTeam || !t.awayTeam || !t.market || !t.selection) continue;
      if (!fuzzyFixtureMatch(parsed, { homeTeam: t.homeTeam, awayTeam: t.awayTeam })) continue;
      // Strict-fingerprint tips always count; for directional consensus,
      // include every tip whose direction matches.
      const isSamePick = t.fingerprint === parsed.fingerprint;
      const dir = getDirectionKey(t.market, t.selection, { homeTeam: t.homeTeam, awayTeam: t.awayTeam });
      const isSameDir = ownDir != null && dir === ownDir;
      if (!isSamePick && !isSameDir) continue;
      const o = extractLabeledOdds(t.rawText);
      if (o !== null) samples.push(o);
    }
  } catch {
    // odds are a nice-to-have — never fail the alert over them
  }
  return samples;
}
