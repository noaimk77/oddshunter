import type { PrismaClient } from "@/generated/prisma/client";
import { getDirectionKey, fuzzyFixtureMatch, slugTeam, type Fixture } from "./tipParser";

export interface ConsensusCheckResult {
  triggered: boolean;
  groupCount: number;
  sample?: { homeTeam: string | null; awayTeam: string | null; market: string | null; selection: string | null };
}

/**
 * Counts distinct source chats that posted this fingerprint within the
 * window, and claims the alert (via ConsensusAlert's unique fingerprint) the
 * first time the threshold is crossed. The unique-constraint insert is what
 * makes this safe under concurrency — two messages landing in the same tick
 * can only ever have one caller win the create and return triggered: true.
 */
export async function checkConsensus(
  db: PrismaClient,
  fingerprint: string,
  config: { minGroups: number; windowMinutes: number },
): Promise<ConsensusCheckResult> {
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000);

  const recentTips = await db.scrapedTip.findMany({
    where: { fingerprint, detectedAt: { gte: windowStart } },
    orderBy: { detectedAt: "desc" },
  });

  const distinctChatIds = new Set(recentTips.map((t) => t.sourceChatId));
  if (distinctChatIds.size < config.minGroups) {
    return { triggered: false, groupCount: distinctChatIds.size };
  }

  try {
    await db.consensusAlert.create({ data: { fingerprint, groupCount: distinctChatIds.size } });
  } catch (err) {
    const isDuplicate = Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
    if (isDuplicate) return { triggered: false, groupCount: distinctChatIds.size };
    throw err;
  }

  const sample = recentTips[0];
  return {
    triggered: true,
    groupCount: distinctChatIds.size,
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
 * makes this concurrency-safe the same way as the strict path.
 */
export async function checkDirectionalConsensus(
  db: PrismaClient,
  fingerprint: string,
  fixture: Fixture,
  config: { minGroups: number; windowMinutes: number },
): Promise<ConsensusCheckResult> {
  const windowStart = new Date(Date.now() - config.windowMinutes * 60_000);
  const currentDirection = getDirectionKey(fingerprint.split("|").at(-2) ?? "", fingerprint.split("|").at(-1) ?? "", fixture);
  if (!currentDirection) return { triggered: false, groupCount: 0 };

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
  if (distinctChatIds.size < config.minGroups) {
    return { triggered: false, groupCount: distinctChatIds.size };
  }

  try {
    await db.consensusAlert.create({ data: { fingerprint: dirFingerprint, groupCount: distinctChatIds.size } });
  } catch (err) {
    const isDuplicate = Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
    if (isDuplicate) return { triggered: false, groupCount: distinctChatIds.size };
    throw err;
  }

  return {
    triggered: true,
    groupCount: distinctChatIds.size,
    sample: sample
      ? { homeTeam: sample.homeTeam, awayTeam: sample.awayTeam, market: sample.market, selection: sample.selection }
      : undefined,
  };
}
