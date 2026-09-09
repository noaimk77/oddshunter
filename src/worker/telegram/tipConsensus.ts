import type { PrismaClient } from "@/generated/prisma/client";
import { getDirectionKey, fuzzyFixtureMatch, slugTeam, type Fixture } from "./tipParser";
import type { ParsedTip } from "./tipParser";

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
  options: { claim?: boolean } = {},
): Promise<ConsensusCheckResult> {
  const { claim = true } = options;
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000);

  const recentTips = await db.scrapedTip.findMany({
    where: { fingerprint, detectedAt: { gte: windowStart } },
    orderBy: { detectedAt: "desc" },
  });

  const distinctChatIds = new Set(recentTips.map((t) => t.sourceChatId));
  const groupCount = distinctChatIds.size;
  if (groupCount < config.minGroups) {
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
  options: { claim?: boolean } = {},
): Promise<ConsensusCheckResult> {
  const { claim = true } = options;
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

  const distinctChatIds = new Set<string>();
  let sample: (typeof recent)[number] | null = null;
  for (const tip of recent) {
    if (!tip.homeTeam || !tip.awayTeam) continue;
    if (!fuzzyFixtureMatch(fixture, { homeTeam: tip.homeTeam, awayTeam: tip.awayTeam })) continue;
    const dir = getDirectionKey(tip.market ?? "", tip.selection ?? "", { homeTeam: tip.homeTeam, awayTeam: tip.awayTeam });
    if (dir !== currentDirection) continue;
    if (!sample) sample = tip;
    distinctChatIds.add(tip.sourceChatId);
  }
  const groupCount = distinctChatIds.size;
  if (groupCount < config.minGroups) {
    return { triggered: false, groupCount, fingerprint: dirFingerprint };
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
   * Lazily resolves every distinct labeled odds the contributing groups
   * stated (for the "Cotes au signalement" spread — never averaged). Only
   * called for the caller that will actually send, so its DB lookup never
   * runs on the common "no consensus" path.
   */
  resolveOddsSamplesAtAlert?: () => Promise<number[]>;
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
  const { config, sendEnabled, send, qualityGate, resolveOddsSamplesAtAlert } = opts;

  // 1. Measure only. Claiming here is what let observation mode and failed
  //    sends burn a consensus for good.
  const strict = await checkConsensus(db, parsed.fingerprint, config, { claim: false });
  let fired = strict;
  let mode: ConsensusMode | null = strict.triggered ? "strict" : null;

  if (!strict.triggered) {
    const directional = await checkDirectionalConsensus(
      db,
      parsed.fingerprint,
      { homeTeam: parsed.homeTeam, awayTeam: parsed.awayTeam },
      config,
      { claim: false },
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
