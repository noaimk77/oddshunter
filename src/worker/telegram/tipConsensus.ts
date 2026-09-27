import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma-consensus/client";
import { getDirectionKey, fuzzyFixtureMatch, slugTeam, parseOverUnderLine, type Fixture } from "./tipParser";
import type { ParsedTip } from "./tipParser";

/**
 * Forwarded copies of the same tipster message land in two (or more) chats
 * as independent `ScrapedTip` rows with distinct `sourceChatId`s but
 * BYTE-IDENTICAL `rawText`. Left unchecked they inflate the consensus count
 * artificially — a single origin channel forwarded to two others triggers
 * MIN_GROUPS=2 alone (real miss 2026-09-11: the two 20:02 alerts, yTOON /
 * Singanur, both fired off ONE Russian OCR screenshot mirrored across
 * "Спортивный блог Антона Токарева" and "Betting Edge⚡️"). We collapse
 * these before counting: a normalized hash of the raw text keeps ONE
 * representative chat per unique message, so the same wording seen in five
 * chats still counts as one vote toward consensus. Different tipsters
 * independently writing the same pick with different wording collapse to
 * different hashes and still count separately.
 *
 * Normalization: strip zero-width chars, collapse runs of whitespace, and
 * lowercase — enough to defeat the "one extra space" or "an added emoji at
 * the end" cases without collapsing genuinely different picks.
 */
function normalizedTextHash(rawText: string | null | undefined): string {
  const normalized = (rawText ?? "")
    .normalize("NFKC")
    .replace(/[​-‏﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return createHash("sha1").update(normalized).digest("hex");
}

/**
 * Counts distinct source chats after collapsing forwarded copies (see
 * `normalizedTextHash`). Each unique raw-text hash contributes AT MOST ONE
 * chat to the vote total — the first chat that carried it in the window.
 * Exported for the directional counter which needs the same rule.
 */
function countDistinctChatsDedupedByText(
  tips: readonly { sourceChatId: string; rawText?: string | null }[],
): number {
  const firstChatByHash = new Map<string, string>();
  for (const t of tips) {
    // A tip with no rawText — synthetic or malformed — can't be reliably
    // compared to another, so it always counts as its own vote (fall back
    // on sourceChatId as the dedup key). Real-world tips always carry
    // rawText (Prisma model requires it), so this branch is defensive.
    const text = t.rawText;
    const hash = text ? normalizedTextHash(text) : `chat:${t.sourceChatId}`;
    if (!firstChatByHash.has(hash)) firstChatByHash.set(hash, t.sourceChatId);
  }
  return new Set(firstChatByHash.values()).size;
}

export interface ConsensusCheckResult {
  triggered: boolean;
  groupCount: number;
  /**
   * The `ConsensusAlert.fingerprint` this check would claim / did claim.
   * For the strict path it's the pick fingerprint; for the directional path
   * it's the `dir:<sorted slugs>|<direction>` key. The caller needs this to
   * address the exact row afterwards instead of guessing "the most recent
   * one".
   */
  fingerprint: string;
  sample?: { homeTeam: string | null; awayTeam: string | null; market: string | null; selection: string | null };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

/**
 * Inserts the `ConsensusAlert` row that "claims" a fingerprint. The unique
 * index on `fingerprint` is the concurrency latch: two messages landing in
 * the same tick both try to create, exactly one wins, the loser gets P2002
 * and backs off. Returns `claimed: false` on P2002 rather than throwing.
 */
export async function claimConsensusAlert(
  db: PrismaClient,
  fingerprint: string,
  groupCount: number,
): Promise<{ claimed: boolean }> {
  try {
    await db.consensusAlert.create({ data: { fingerprint, groupCount } });
    return { claimed: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { claimed: false };
    throw err;
  }
}

/**
 * Undoes a claim that never resulted in a delivered alert (VIP send threw or
 * came back null). Scoped to rows with no `sentMessageId` / `sentChatId` so
 * it can never delete a real, posted alert — only an unsent placeholder.
 * Leaving the row in place is what made a failed Telegram send permanent:
 * the next message with the same fingerprint hit the unique constraint and
 * the consensus was lost for good.
 */
export async function releaseConsensusAlert(db: PrismaClient, fingerprint: string): Promise<void> {
  await db.consensusAlert.deleteMany({
    where: { fingerprint, sentMessageId: null, sentChatId: null },
  });
}

/**
 * Counts distinct source chats that posted this fingerprint within the
 * window. By default it also *claims* the alert (creates the ConsensusAlert
 * row) the first time the threshold is crossed — pass `{ claim: false }` to
 * only measure, leaving the decision to claim to the caller once it knows it
 * will actually send.
 */
export async function checkConsensus(
  db: PrismaClient,
  fingerprint: string,
  config: { minGroups: number; windowMinutes: number },
  options: { claim?: boolean; sourceChatId?: string; trustedChatIds?: Set<string> } = {},
): Promise<ConsensusCheckResult> {
  const { claim = true, sourceChatId, trustedChatIds } = options;
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000);

  const recentTips = await db.scrapedTip.findMany({
    where: { fingerprint, detectedAt: { gte: windowStart } },
    orderBy: { detectedAt: "desc" },
  });

  const groupCount = countDistinctChatsDedupedByText(recentTips);
  // A trusted single-source chat waives the corroboration requirement for
  // its OWN tips — groupCount is still the honest real count (shown in the
  // VIP message / logs), just not what gates the trigger.
  const trusted = !!sourceChatId && !!trustedChatIds?.has(sourceChatId);
  if (groupCount < config.minGroups && !trusted) {
    return { triggered: false, groupCount, fingerprint };
  }

  if (claim) {
    const { claimed } = await claimConsensusAlert(db, fingerprint, groupCount);
    if (!claimed) return { triggered: false, groupCount, fingerprint };
  }

  const sample = recentTips[0];
  return {
    triggered: true,
    groupCount,
    fingerprint,
    sample: sample
      ? { homeTeam: sample.homeTeam, awayTeam: sample.awayTeam, market: sample.market, selection: sample.selection }
      : undefined,
  };
}

/**
 * Directional consensus: fires when N distinct chats bet the SAME SIDE of
 * the same match within the window, regardless of the exact line. Complements
 * the strict `checkConsensus` above — real tipsters rarely pick identical
 * lines (Over 4.5 / 5.5 / 6.5 all mean "goals will come"; Handicap -4.5 /
 * -5 both mean "favorite wins big"), and the strict check misses those.
 *
 * De-duplication key: `dir:<fixturePrefix>|<direction>` — one alert per
 * (match, direction) is enough; ConsensusAlert's unique fingerprint index
 * makes this concurrency-safe the same way as the strict path. Same
 * `{ claim: false }` option: measure without claiming.
 *
 * The key alone is not sufficient though — the sortedSlugs are built from
 * the CURRENT tip's team names, which can be spelled differently across
 * chats ("NK Sesvete U19" / "NK Radnik Sesvete U19" / plain "Sesvete"). So
 * BEFORE claiming, we also fuzzy-match the fixture against every
 * ConsensusAlert row from the last 24h whose selection carries the same
 * direction: a hit there means we already posted this pick in the VIP
 * under a different spelling, and firing again would spam the group with
 * "Plus de 3.5 buts" three times for the same match (Noaim, 2026-09-05).
 */
export async function checkDirectionalConsensus(
  db: PrismaClient,
  fingerprint: string,
  fixture: Fixture,
  config: { minGroups: number; windowMinutes: number },
  options: { claim?: boolean; sourceChatId?: string; trustedChatIds?: Set<string> } = {},
): Promise<ConsensusCheckResult> {
  const { claim = true, sourceChatId, trustedChatIds } = options;
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000);
  const currentDirection = getDirectionKey(fingerprint.split("|").at(-2) ?? "", fingerprint.split("|").at(-1) ?? "", fixture);
  if (!currentDirection) return { triggered: false, groupCount: 0, fingerprint: "" };

  // The dedup key must survive the fixture-name fracturing (tipsters write
  // "Johor Darul Takzim" / "Darul Takzim" / "Takzim" for the same match),
  // so the fuzzy team slugs, sorted, drive the alert fingerprint — not the
  // raw fingerprint prefix. Two chats posting the same match under
  // different spellings share the same dedup key here.
  const sortedSlugs = [slugTeam(fixture.homeTeam), slugTeam(fixture.awayTeam)].sort().join("|");
  const dirFingerprint = `dir:${sortedSlugs}|${currentDirection}`;

  // Every tip in the window — we filter to the same fuzzy fixture in JS.
  // Cost: proportional to tips-per-24h, currently in the low hundreds.
  const recent = await db.scrapedTip.findMany({
    where: { detectedAt: { gte: windowStart } },
    orderBy: { detectedAt: "desc" },
  });

  const matchingTips: (typeof recent)[number][] = [];
  for (const tip of recent) {
    if (!tip.homeTeam || !tip.awayTeam) continue;
    if (!fuzzyFixtureMatch(fixture, { homeTeam: tip.homeTeam, awayTeam: tip.awayTeam })) continue;
    const dir = getDirectionKey(tip.market ?? "", tip.selection ?? "", { homeTeam: tip.homeTeam, awayTeam: tip.awayTeam });
    if (dir !== currentDirection) continue;
    matchingTips.push(tip);
  }
  // Collapse forwarded copies (see countDistinctChatsDedupedByText) — a
  // single OCR screenshot mirrored across chats must not read as consensus.
  const groupCount = countDistinctChatsDedupedByText(matchingTips);
  const trusted = !!sourceChatId && !!trustedChatIds?.has(sourceChatId);
  if (groupCount < config.minGroups && !trusted) {
    return { triggered: false, groupCount, fingerprint: dirFingerprint };
  }

  // "Sample" = the one tip whose (market, selection) will be shown in the VIP
  // message. For OVER/UNDER on the same direction (e.g. all "over goals"),
  // the individual tipsters usually disagree on the exact line — one posts
  // "over 4.5", another "over 5", another the Asian "over 4.75". Two things
  // must happen here (Noaim 2026-09-17):
  //   1. Divergence guard — if the range of lines is too wide, this isn't
  //      "the same pick" any more, it's tipsters disagreeing on the volume
  //      of goals ("over 4.5" vs "over 2.5" is 2 goals apart — too different
  //      to bundle as one alert), so suppress the consensus outright.
  //   2. Pick the conservative line — for OVER, the *smallest* line is the
  //      safest bet (any bigger over implies the smaller one); for UNDER,
  //      the *largest*. Before this, sample was just the newest tip, so the
  //      VIP message could say "over 5" when a safer "over 4.5" was also in
  //      the consensus and would have won a bet the "over 5" pick voided.
  const overUnderTips = matchingTips.filter(
    (t) => (t.market === "OVER_UNDER" || t.market === "OVER_UNDER_HT") && t.selection && parseOverUnderLine(t.selection) !== null,
  );
  let sample: (typeof recent)[number] | null;
  if (overUnderTips.length >= 2) {
    const lines = overUnderTips
      .map((t) => parseOverUnderLine(t.selection!)!)
      .sort((a, b) => a - b);
    // Divergence is measured BETWEEN chats, not across every message: one
    // firehose chat posting 3.5 / 4 / 5.5 on the same match must not read
    // as "tipsters disagree" (2026-09-25 Armed Forces vs Bunga Raya — 3
    // chats, over, suppressed by this guard). Each chat contributes its
    // most conservative line (lowest for OVER, highest for UNDER).
    const isOverDir = currentDirection.startsWith("over_");
    const perChat = new Map<string, number>();
    for (const t of overUnderTips) {
      const line = parseOverUnderLine(t.selection!)!;
      const prev = perChat.get(t.sourceChatId);
      perChat.set(t.sourceChatId, prev === undefined ? line : isOverDir ? Math.min(prev, line) : Math.max(prev, line));
    }
    const chatLines = [...perChat.values()].sort((a, b) => a - b);
    const spread = chatLines[chatLines.length - 1] - chatLines[0];
    // 1.5 for goals-shape lines (foot/hockey: over 4.5 vs over 3 = borderline);
    // 15 for points-shape (basketball spreads at higher magnitude). Threshold
    // switch matches the goals/points shape split from getDirectionKey.
    const shapeIsPoints = lines[0] >= 30;
    const maxAllowedSpread = shapeIsPoints ? 15 : 1.5;
    if (spread > maxAllowedSpread) {
      return { triggered: false, groupCount, fingerprint: dirFingerprint };
    }
    const isOver = currentDirection.startsWith("over_");
    const targetLine = isOver ? lines[0] : lines[lines.length - 1];
    sample =
      overUnderTips.find((t) => parseOverUnderLine(t.selection!) === targetLine) ?? overUnderTips[0];
  } else {
    sample = matchingTips[0] ?? null;
  }

  // Cross-spelling dedup: an alert for the SAME direction on this fixture
  // was already sent under a different team-name spelling, don't spam.
  // 24h look-back matches the tip window (see TIP_CONSENSUS_WINDOW_MINUTES).
  const dedupSince = new Date(Date.now() - 24 * 3600_000);
  const recentSameDir = await db.consensusAlert.findMany({
    where: {
      sentAt: { gte: dedupSince },
      // Only rows with the fields we need to check direction + fuzzy match.
      homeTeam: { not: null },
      awayTeam: { not: null },
      market: { not: null },
      selection: { not: null },
    },
    select: { fingerprint: true, homeTeam: true, awayTeam: true, market: true, selection: true },
  });
  for (const existing of recentSameDir) {
    if (existing.fingerprint === dirFingerprint) continue; // will be caught by unique-index claim path
    if (!existing.homeTeam || !existing.awayTeam || !existing.market || !existing.selection) continue;
    if (!fuzzyFixtureMatch(fixture, { homeTeam: existing.homeTeam, awayTeam: existing.awayTeam })) continue;
    const dir = getDirectionKey(existing.market, existing.selection, { homeTeam: existing.homeTeam, awayTeam: existing.awayTeam });
    if (dir === currentDirection) {
      return {
        triggered: false,
        groupCount,
        fingerprint: dirFingerprint,
        sample: sample
          ? { homeTeam: sample.homeTeam, awayTeam: sample.awayTeam, market: sample.market, selection: sample.selection }
          : undefined,
      };
    }
  }

  if (claim) {
    const { claimed } = await claimConsensusAlert(db, dirFingerprint, groupCount);
    if (!claimed) return { triggered: false, groupCount, fingerprint: dirFingerprint };
  }

  return {
    triggered: true,
    groupCount,
    fingerprint: dirFingerprint,
    sample: sample
      ? { homeTeam: sample.homeTeam, awayTeam: sample.awayTeam, market: sample.market, selection: sample.selection }
      : undefined,
  };
}

export type ConsensusMode = "strict" | "directional";

export interface ConsensusApplyResult {
  mode: ConsensusMode | null;
  triggered: boolean;
  groupCount: number;
  /** True only when a message was actually delivered to the VIP group. */
  sent: boolean;
  /** True only when this call holds a committed `ConsensusAlert` row. */
  claimed: boolean;
  /** The fingerprint that was (or would have been) claimed. */
  fingerprint: string | null;
  /**
   * Why nothing was sent, when `triggered` but not `sent`:
   * "below-threshold" | "observation" | "quality-gate:<reason>" |
   * "already-claimed" | "send-failed" | "send-returned-null".
   */
  reason?: string;
}

export interface ConsensusApplyOptions {
  config: { minGroups: number; windowMinutes: number };
  /** `SEND_TIP_CONSENSUS_ALERTS`. When false: measure only, claim nothing. */
  sendEnabled: boolean;
  /** Posts to the VIP group. Only invoked for the caller that wins the claim.
   *  Returning null (e.g. a provider sanity-check rejected the pick) releases
   *  the claim so a later message can retry. */
  send: (
    tip: ParsedTip & { groupCount: number; oddsAtAlert: number | null; oddsSamples: number[] },
  ) => Promise<{ chatId: string; messageId: number } | null>;
  /** Final quality gate (rejects OCR-broken picks). Optional; default: allow. */
  qualityGate?: (tip: ParsedTip) => { ok: boolean; reason?: string };
  /**
   * Async gate that runs AFTER the sync one, only for picks that will
   * otherwise be posted — kept off the fast rejection path so its network
   * cost never pays for a pick we already know we're dropping. Current
   * concrete use: fixture-existence check (does the match resolve on
   * TheSportsDB or BetExplorer?). Rejecting here is the *only* thing that
   * kills OCR-hallucinated fixtures where the pipeline itself was
   * internally consistent — 2026-09-11 20:02 (yTOON/Taum, Singanur/Mongolia,
   * both mirrored across 2 Russian OCR-mangled chats). Optional; default:
   * allow.
   */
  qualityGateAsync?: (tip: ParsedTip) => Promise<{ ok: boolean; reason?: string }>;
  /**
   * Lazily resolves every distinct labeled odds the contributing groups
   * stated (for the "Cotes au signalement" spread — never averaged). Only
   * called for the caller that will actually send, so its DB lookup never
   * runs on the common "no consensus" path.
   */
  resolveOddsSamplesAtAlert?: () => Promise<number[]>;
  /** The chat this specific tip came from, and the set of chat ids that
   *  waive the `minGroups` corroboration requirement on their own (see
   *  `getTrustedSingleSourceChatIds` in config.ts). Both optional; omitting
   *  either just means no trusted-source bypass applies. */
  sourceChatId?: string;
  trustedChatIds?: Set<string>;
}

/**
 * The full "does this tip complete a consensus, and if so alert the VIP
 * group" lifecycle, split out from the MTProto listener so it is testable
 * without a Telegram client. Ordering is deliberate and load-bearing:
 *
 *   count (no claim) -> pick mode -> observation short-circuit ->
 *   quality gate -> CLAIM -> resolve odds -> send -> (release on failure) ->
 *   persist metadata on the exact claimed row
 *
 * The claim happens *after* the observation and quality-gate checks and is
 * rolled back if the send fails, so neither observation mode nor a Telegram
 * outage can permanently consume a consensus. The metadata write addresses
 * the row by its unique fingerprint, never "the most recent dir: row".
 */
/**
 * True when a consensus alert for the SAME DIRECTION on a fuzzy-matched
 * version of this fixture was already DELIVERED in the last `hours` hours.
 * Covers BOTH the strict and directional paths — the strict path's
 * unique-fingerprint latch only blocks byte-identical fingerprints, so OCR
 * spelling drift between channels ("Trnje U19 vs Kustosija U19" vs "Trnje
 * vs Kustosija", "Plus de 3,5" vs "Plus de 2,5") kept slipping duplicates
 * into the VIP group (Noaim 2026-09-06: "je t'ai dit de ne plus envoyer de
 * doubles"). On a DB error it returns true — a missed alert beats a
 * duplicate, per Noaim's stated priority.
 */
async function alreadyDeliveredSameDirection(db: PrismaClient, parsed: ParsedTip, hours = 24): Promise<boolean> {
  const dir = getDirectionKey(parsed.market, parsed.selection, { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam });
  if (!dir) return false;
  let rows: { homeTeam: string | null; awayTeam: string | null; market: string | null; selection: string | null }[];
  try {
    rows = await db.consensusAlert.findMany({
      where: {
        sentAt: { gte: new Date(Date.now() - hours * 3600_000) },
        sentMessageId: { not: null }, // actually posted, not a rolled-back claim
        homeTeam: { not: null },
        awayTeam: { not: null },
        market: { not: null },
        selection: { not: null },
      },
      select: { homeTeam: true, awayTeam: true, market: true, selection: true },
    });
  } catch (err) {
    console.error("[tipConsensus] dedup query failed — suppressing this alert to avoid a possible duplicate:", err instanceof Error ? err.message : err);
    return true;
  }
  for (const r of rows) {
    if (!r.homeTeam || !r.awayTeam || !r.market || !r.selection) continue;
    if (!fuzzyFixtureMatch(parsed, { homeTeam: r.homeTeam, awayTeam: r.awayTeam })) continue;
    if (getDirectionKey(r.market, r.selection, { homeTeam: r.homeTeam, awayTeam: r.awayTeam }) === dir) return true;
  }
  return false;
}

/**
 * One canonical claim key per (match, betting direction) — `dir:<sorted
 * fuzzy team slugs>|<direction>`, identical to checkDirectionalConsensus's
 * dedup key. Used as THE claim fingerprint for both the strict and
 * directional paths, so the unique index on ConsensusAlert.fingerprint
 * blocks a second alert for the same match + same direction ATOMICALLY,
 * whatever the exact line ("Plus de 3,5" then "Plus de 2,5") or spelling —
 * no race window (Noaim 2026-09-06: "les doublons, tu arrêtes… une seule
 * alerte, ça suffit"). Falls back to the raw pick fingerprint only when the
 * direction can't be derived (unusual market shape).
 */
export function directionalClaimKey(parsed: ParsedTip): string {
  const dir = getDirectionKey(parsed.market, parsed.selection, { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam });
  if (!dir) return parsed.fingerprint;
  const sortedSlugs = [slugTeam(parsed.homeTeam), slugTeam(parsed.awayTeam)].sort().join("|");
  return `dir:${sortedSlugs}|${dir}`;
}

export async function applyConsensusAndAlert(
  db: PrismaClient,
  parsed: ParsedTip,
  opts: ConsensusApplyOptions,
): Promise<ConsensusApplyResult> {
  const { config, sendEnabled, send, qualityGate, qualityGateAsync, resolveOddsSamplesAtAlert, sourceChatId, trustedChatIds } = opts;

  // 1. Measure only. Claiming here is what let observation mode and failed
  //    sends burn a consensus for good.
  const strict = await checkConsensus(db, parsed.fingerprint, config, { claim: false, sourceChatId, trustedChatIds });
  let fired = strict;
  let mode: ConsensusMode | null = strict.triggered ? "strict" : null;

  if (!strict.triggered) {
    const directional = await checkDirectionalConsensus(
      db,
      parsed.fingerprint,
      { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam },
      config,
      { claim: false, sourceChatId, trustedChatIds },
    );
    if (directional.triggered) {
      fired = directional;
      mode = "directional";
    }
  }

  // Claim on the (match, direction) key regardless of which check fired —
  // one alert per match direction, enforced by the DB unique constraint.
  const claimFingerprint = directionalClaimKey(parsed);

  if (!mode) {
    return {
      mode: null,
      triggered: false,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: null,
      reason: "below-threshold",
    };
  }

  // 2. Observation mode: threshold met, but send nothing AND claim nothing —
  //    the very same tips must still be able to fire a real alert once
  //    SEND_TIP_CONSENSUS_ALERTS is turned on.
  if (!sendEnabled) {
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: "observation",
    };
  }

  // 3. Quality gate — still nothing claimed.
  const gate = qualityGate ? qualityGate(parsed) : { ok: true as const };
  if (!gate.ok) {
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: `quality-gate:${gate.reason ?? "rejected"}`,
    };
  }

  // 3a. Async quality gate — runs only when we're otherwise about to post,
  //     so its network cost never pays for a pick already rejected by the
  //     sync gate. Concrete use: fixture-existence check.
  if (qualityGateAsync) {
    const asyncGate = await qualityGateAsync(parsed);
    if (!asyncGate.ok) {
      return {
        mode,
        triggered: true,
        groupCount: fired.groupCount,
        sent: false,
        claimed: false,
        fingerprint: claimFingerprint,
        reason: `quality-gate:${asyncGate.reason ?? "async-rejected"}`,
      };
    }
  }

  // 3b. Cross-spelling / cross-line de-dup: this exact pick direction on
  //     this match was already posted to the VIP under a different
  //     spelling or a nearby line. Nothing claimed yet, so just bail.
  if (await alreadyDeliveredSameDirection(db, parsed)) {
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: "duplicate-direction",
    };
  }

  // 4. Claim now (concurrency latch).
  const claim = await claimConsensusAlert(db, claimFingerprint, fired.groupCount);
  if (!claim.claimed) {
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: "already-claimed",
    };
  }

  const oddsSamples = resolveOddsSamplesAtAlert ? await resolveOddsSamplesAtAlert() : [];
  // Persist the lowest stated price as the single reference value (the
  // outcome reply shows one number); the alert message itself renders the
  // full spread from oddsSamples.
  const inBand = oddsSamples.filter((n) => Number.isFinite(n) && n >= 1.15 && n <= 15);
  const oddsAtAlert = inBand.length ? Math.min(...inBand) : null;

  // 5. Send. Any failure releases the claim so a later message retries.
  let posted: { chatId: string; messageId: number } | null;
  try {
    posted = await send({ ...parsed, groupCount: fired.groupCount, oddsAtAlert, oddsSamples });
  } catch (err) {
    await releaseConsensusAlert(db, claimFingerprint);
    console.error("[tipConsensus] VIP send threw — released consensus claim for retry:", err);
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: "send-failed",
    };
  }
  if (!posted) {
    await releaseConsensusAlert(db, claimFingerprint);
    return {
      mode,
      triggered: true,
      groupCount: fired.groupCount,
      sent: false,
      claimed: false,
      fingerprint: claimFingerprint,
      reason: "send-returned-null",
    };
  }

  // 6. Persist metadata on EXACTLY the row we claimed, by its unique
  //    fingerprint — never "the most recent dir: row", which is a different
  //    match's alert when two directional consensuses fire close together.
  await db.consensusAlert.update({
    where: { fingerprint: claimFingerprint },
    data: {
      homeTeam: parsed.homeTeam,
      awayTeam: parsed.awayTeam,
      market: parsed.market,
      selection: parsed.selection,
      oddsAtAlert,
      sentChatId: posted.chatId,
      sentMessageId: BigInt(posted.messageId),
    },
  });

  return {
    mode,
    triggered: true,
    groupCount: fired.groupCount,
    sent: true,
    claimed: true,
    fingerprint: claimFingerprint,
  };
}
