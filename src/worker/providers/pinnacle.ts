/**
 * Pinnacle — the sharp book Noaim's subscribers actually bet on, and the
 * primary "can this pick even be placed?" check for the VIP consensus feed
 * (Noaim 2026-09-03: "regarde surtout sur 1xbet et pinnacle pour retrouver
 * les match"). 1xbet's API sits behind a Cloudflare challenge from the
 * worker so it can't be queried directly; Pinnacle's guest API (the one
 * their own website uses) works with a fixed public key and no auth.
 *
 * Endpoint: guest.api.arcadia.pinnacle.com/0.1/sports/{id}/matchups — one
 * request returns every upcoming + in-play matchup for a sport (soccer id
 * 29 ≈ 1200 rows incl. reserve/youth leagues; basketball id 4). We pull
 * both once, cache ~5 min, and search team names in memory. A hit gives us:
 * the competition country (league.group), the sport, the kickoff time, and
 * whether it's already live — everything the alert's country line and the
 * "don't post an already-started first-half pick" guard need.
 *
 * Not a results source: the guest feed drops finished matches, so outcome
 * grading stays on TheSportsDB.
 */

const BASE = "https://guest.api.arcadia.pinnacle.com/0.1";
// The public key the pinnacle.com frontend ships in its JS — not a secret,
// not tied to an account, rotated rarely. If Pinnacle changes it the calls
// 401 and every lookup falls back to TheSportsDB (never an error path).
const PUBLIC_KEY = "CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

const SPORT_IDS: Record<string, number> = { football: 29, basketball: 4 };

interface PinnacleMatchup {
  id: number;
  type: string;
  parent: unknown;
  parentId?: number | null;
  startTime?: string;
  isLive?: boolean;
  /** Object like `{ minutes: 38, state: 1 }` on a live match, `{}` otherwise. */
  state?: { minutes?: number; state?: number } | Record<string, never> | string;
  /** "pending" (not started) | "started" (in-play). Finished matches drop
   *  off this feed entirely. */
  status?: string;
  league?: { name?: string; group?: string; sport?: { id?: number; name?: string } };
  participants?: { name?: string; alignment?: string }[];
}

export interface PinnacleFixture {
  /** Competition country ("Argentina", "Turkey", "World"…). */
  country: string | null;
  league: string | null;
  sport: "football" | "basketball";
  /** Scheduled kickoff, ms since epoch (null if Pinnacle omitted it). */
  startMs: number | null;
  /** Pinnacle flags the match as in-play (isLive, status "started", or a
   *  kickoff already in the past). */
  isLive: boolean;
  /** Live match clock in minutes when Pinnacle exposes it, else null. */
  liveMinute: number | null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "x-api-key": PUBLIC_KEY,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://www.pinnacle.com/",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[pinnacle] ${res.status} on ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[pinnacle] fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const listCache = new Map<string, { at: number; rows: PinnacleMatchup[] }>();

async function getMatchups(sport: "football" | "basketball"): Promise<PinnacleMatchup[]> {
  const hit = listCache.get(sport);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
  const data = await fetchJson<PinnacleMatchup[]>(`${BASE}/sports/${SPORT_IDS[sport]}/matchups?brandId=0&withSpecials=false`);
  const rows = Array.isArray(data)
    ? data.filter((r) => r.type === "matchup" && r.parent == null && Array.isArray(r.participants) && r.participants.length >= 2)
    : [];
  // Keep a stale list on a failed refresh rather than losing coverage.
  if (rows.length === 0 && hit) return hit.rows;
  listCache.set(sport, { at: Date.now(), rows });
  return rows;
}

const ACCENTS_RE = /[̀-ͯ]/g;
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(ACCENTS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\b(fc|sc|ac|cf|cd|afc|club|team|reserves?|ii|iii|u\d{2}|women|w)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One side matches a Pinnacle participant: exact, containment (≥4 chars),
 *  or a shared word ≥4 chars. Deliberately loose — the tipster OCR names
 *  are messy and a false negative just sends the alert to TheSportsDB. */
function sideMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const wa = new Set(a.split(" ").filter((w) => w.length >= 4));
  return b.split(" ").some((w) => w.length >= 4 && wa.has(w));
}

function toMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const withTz = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const t = Date.parse(withTz);
  return Number.isFinite(t) ? t : null;
}

/**
 * Look a fixture up on Pinnacle by team names. Checks soccer first, then
 * basketball. Returns null when neither list has both sides — the caller
 * then falls back to TheSportsDB. A non-null result means the match is
 * genuinely on the board (a VIP subscriber can place the bet).
 */
export async function findPinnacleFixture(homeTeam: string, awayTeam: string): Promise<PinnacleFixture | null> {
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  if (h.length < 3 || a.length < 3) return null;

  for (const sport of ["football", "basketball"] as const) {
    let rows: PinnacleMatchup[];
    try {
      rows = await getMatchups(sport);
    } catch {
      continue;
    }
    for (const row of rows) {
      const names = (row.participants ?? []).map((p) => norm(p.name ?? ""));
      if (names.length < 2) continue;
      const straight = sideMatches(h, names[0]) && sideMatches(a, names[1]);
      const swapped = sideMatches(h, names[1]) && sideMatches(a, names[0]);
      if (!straight && !swapped) continue;
      const startMs = toMs(row.startTime);
      const statusStr = String(row.status ?? "").toLowerCase();
      const liveMinute =
        row.state && typeof row.state === "object" && typeof (row.state as { minutes?: number }).minutes === "number"
          ? (row.state as { minutes?: number }).minutes ?? null
          : null;
      const isLive =
        row.isLive === true ||
        statusStr === "started" ||
        statusStr === "live" ||
        liveMinute != null ||
        (startMs != null && Date.now() >= startMs);
      return {
        country: row.league?.group?.trim() || null,
        league: row.league?.name?.trim() || null,
        sport,
        startMs,
        isLive,
        liveMinute,
      };
    }
  }
  return null;
}
