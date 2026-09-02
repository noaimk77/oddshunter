import type { PrismaClient } from "@/generated/prisma/client";
import type { Fixture } from "./tipParser";

/**
 * Bridges the messy tipster world to the fixtures this worker already
 * ingests from BetExplorer. Two channels posting "Blooming vs Real Oruro"
 * and "Bloomng - R. Oruro" (one of them via shaky OCR) need to collapse to
 * the *same* pick — matching raw slug against raw slug never does that, so
 * instead we snap both to a canonical `Event` row and fingerprint on its
 * id. If nothing in the near-term fixture list matches with confidence we
 * return null and the caller keeps its raw-name behavior.
 */

export interface ResolvedFixture {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
}

const ACCENTS_RE = /[̀-ͯ]/g;

// Club-type noise words that carry no identifying weight — dropped before
// comparison so "Atletico El Vigia" still matches "El Vigia" and "JDT FC"
// matches "JDT". Kept deliberately small: anything that can actually
// distinguish two clubs in the same league (colours, saints, cities,
// "Real", "Sporting", roman numerals for reserve sides) stays.
const GENERIC_TOKENS = new Set([
  "fc", "sc", "cf", "ac", "afc", "cd", "ca", "sd", "ud", "if", "ff", "bk", "fk", "kf",
  "cs", "ce", "ec", "sv", "tsv", "club", "clube", "calcio", "kalcio",
  "the", "de", "do", "da", "des", "del", "di", "us", "usd", "ssd", "as", "rc", "sk",
]);

export function normalizeTeam(raw: string): { tokens: string[]; joined: string } {
  const cleaned = raw
    .normalize("NFD")
    .replace(ACCENTS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter((t) => t && !GENERIC_TOKENS.has(t));
  const kept = tokens.length > 0 ? tokens : cleaned.split(" ").filter(Boolean);
  return { tokens: kept, joined: kept.join("") };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + cost));
    }
    prev = cur;
  }
  return prev[b.length];
}

function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * 0..1 confidence that `raw` and `candidate` name the same team. Substring
 * containment (either direction, once both are stripped of noise words)
 * scores highest — OCR routinely truncates a name rather than garbling it.
 * Otherwise falls back to a token-overlap score blended with the overall
 * edit-distance ratio.
 */
/** Best 0..1 affinity between one token and a set — exact hit, near-hit by
 *  edit distance, substring, or (for a lone initial like the "R." in
 *  "R. Oruro") a shared first letter. */
function tokenAffinity(t: string, others: Set<string>): number {
  if (others.has(t)) return 1;
  let best = 0;
  for (const u of others) {
    if (t === u) return 1;
    if (t.length === 1 || u.length === 1) {
      if (t[0] === u[0]) best = Math.max(best, 0.7);
      continue;
    }
    if (t.length >= 4 && u.length >= 4) {
      if (t.includes(u) || u.includes(t)) best = Math.max(best, 0.9);
      else if (ratio(t, u) >= 0.82) best = Math.max(best, 0.8);
    }
  }
  return best;
}

export function scoreTeamMatch(raw: string, candidate: string): number {
  const a = normalizeTeam(raw);
  const b = normalizeTeam(candidate);
  if (!a.joined || !b.joined) return 0;

  if (a.joined === b.joined) return 1;
  const [shorter, longer] = a.joined.length <= b.joined.length ? [a.joined, b.joined] : [b.joined, a.joined];
  if (shorter.length >= 4 && longer.includes(shorter)) return 0.92;

  const setA = new Set(a.tokens);
  const setB = new Set(b.tokens);
  let shared = 0;
  for (const t of setA) shared += tokenAffinity(t, setB);

  const overlap = shared / Math.max(setA.size, setB.size);
  const whole = ratio(a.joined, b.joined);
  return Math.max(overlap * 0.7 + whole * 0.3, whole >= 0.8 ? whole : 0);
}

/** Both sides must clear MIN_SIDE and the average must clear MIN_COMBINED,
 *  tried in listed and swapped orientation. Returns the better orientation's
 *  score, or 0. */
export function scoreFixtureMatch(
  raw: Fixture,
  candidate: { homeTeam: string; awayTeam: string },
): number {
  const straight = [scoreTeamMatch(raw.homeTeam, candidate.homeTeam), scoreTeamMatch(raw.awayTeam, candidate.awayTeam)];
  const swapped = [scoreTeamMatch(raw.homeTeam, candidate.awayTeam), scoreTeamMatch(raw.awayTeam, candidate.homeTeam)];
  const best = (straight[0] + straight[1] >= swapped[0] + swapped[1] ? straight : swapped) as [number, number];
  const MIN_SIDE = 0.62;
  if (best[0] < MIN_SIDE || best[1] < MIN_SIDE) return 0;
  return (best[0] + best[1]) / 2;
}

interface EventRow {
  id: string;
  homeTeam: string;
  awayTeam: string;
}

let cache: { at: number; rows: EventRow[] } | null = null;
const CACHE_TTL_MS = 120_000;

async function nearTermEvents(db: PrismaClient): Promise<EventRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const now = Date.now();
  const rows = await db.event.findMany({
    where: {
      kickoff: { gte: new Date(now - 6 * 3_600_000), lte: new Date(now + 72 * 3_600_000) },
    },
    select: { id: true, homeTeam: true, awayTeam: true },
    take: 2000,
  });
  cache = { at: Date.now(), rows };
  return rows;
}

const MIN_COMBINED = 0.74;

/**
 * Resolves a raw tipster fixture to a canonical Event, or null. Ambiguity
 * guard: if the two best candidates are near-tied on different events we
 * decline rather than risk merging two different matches into one pick.
 */
export async function resolveFixture(db: PrismaClient, raw: Fixture): Promise<ResolvedFixture | null> {
  let events: EventRow[];
  try {
    events = await nearTermEvents(db);
  } catch (err) {
    console.error("[fixtureResolver] event lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }

  let best: { row: EventRow; score: number } | null = null;
  let runnerUp = 0;
  for (const row of events) {
    const score = scoreFixtureMatch(raw, row);
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { row, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  if (!best || best.score < MIN_COMBINED) return null;
  if (runnerUp >= best.score - 0.03 && runnerUp >= MIN_COMBINED) {
    console.log(
      `[fixtureResolver] ambiguous "${raw.homeTeam} vs ${raw.awayTeam}" (top ${best.score.toFixed(2)} vs ${runnerUp.toFixed(2)}) — not resolving`,
    );
    return null;
  }

  return { eventId: best.row.id, homeTeam: best.row.homeTeam, awayTeam: best.row.awayTeam };
}
