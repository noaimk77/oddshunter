/**
 * TheSportsDB — free, keyless (the shared demo key "3"), no signup. Used as
 * the metadata source for the VIP consensus alert after Sofascore started
 * returning 403 to the worker on every endpoint (hard Cloudflare bot block,
 * confirmed 2026-09-03 from both the Fly box and a normal machine).
 *
 * Two jobs:
 *   - resolveFixtureMeta: team names -> { country, sport, league }. Powers
 *     the "🌍 Pays" line AND a sport sanity-check (a "plus de 5,5 buts" pick
 *     on a basketball fixture is nonsense — we suppress those).
 *   - fetchFinishedEvent: team names -> final score, for the outcome
 *     resolver's "✅ Passé / ❌ Perdu" reply.
 *
 * Coverage is good on named domestic leagues (incl. Argentine/Turkish lower
 * divisions), thinner on reserve/youth sides — a miss just means the line
 * is omitted / the outcome stays UNRESOLVED, never a wrong value.
 */

const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const REQUEST_TIMEOUT_MS = 8_000;

export interface FixtureMeta {
  country: string | null;
  /** Normalized: "football" | "basketball" | other lowercased sport slug. */
  sport: string | null;
  league: string | null;
}

interface TsdbTeam {
  idTeam: string;
  strTeam: string;
  strSport?: string;
  strLeague?: string;
  strCountry?: string;
}

interface TsdbEvent {
  strEvent?: string;
  dateEvent?: string | null;
  strTime?: string | null;
  strTimestamp?: string | null;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string;
  strProgress?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) {
      if (res.status !== 404) console.warn(`[thesportsdb] ${res.status} on ${url}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[thesportsdb] fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSport(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "soccer" || s === "football") return "football";
  if (s === "basketball") return "basketball";
  return s || null;
}

/** First token of a team name that's long enough to search on — drops
 *  "II"/"FC"/"U20"-only queries that return everything. */
function searchableName(name: string): string {
  return name.replace(/\b(II|III|B|U\d{2}|FC|SC|CF|AC)\b/gi, " ").replace(/\s+/g, " ").trim() || name.trim();
}

const metaCache = new Map<string, { at: number; meta: FixtureMeta | null }>();
const META_TTL_MS = 6 * 3600_000;

const teamCache = new Map<string, { at: number; team: TsdbTeam | null }>();
const TEAM_TTL_MS = 6 * 3600_000;

async function searchTeam(name: string): Promise<TsdbTeam | null> {
  const q = searchableName(name);
  if (q.length < 3) return null;
  const key = q.toLowerCase();
  const hit = teamCache.get(key);
  if (hit && Date.now() - hit.at < TEAM_TTL_MS) return hit.team;
  const data = await fetchJson<{ teams: TsdbTeam[] | null }>(`${BASE}/searchteams.php?t=${encodeURIComponent(q)}`);
  const team = data?.teams?.[0] ?? null;
  teamCache.set(key, { at: Date.now(), team });
  return team;
}

function firstWord(name: string): string {
  return searchableName(name).toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
}

/** TheSportsDB timestamps are UTC but not always suffixed. Parse robustly. */
function parseTsdbTimestamp(ev: { strTimestamp?: string | null; dateEvent?: string | null; strTime?: string | null }): number | null {
  const raw = ev.strTimestamp?.trim();
  if (raw) {
    const withTz = /[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? raw : `${raw}Z`;
    const t = Date.parse(withTz);
    if (Number.isFinite(t)) return t;
  }
  if (ev.dateEvent) {
    const t = Date.parse(`${ev.dateEvent}T${(ev.strTime || "00:00:00").slice(0, 8)}Z`);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

export interface FixtureTiming {
  /** Scheduled kickoff, ms since epoch. Null when TheSportsDB has no time. */
  startMs: number | null;
  status: "notstarted" | "finished" | "unknown";
}

/**
 * Club-type prefixes and generic descriptors that are NOT distinctive
 * enough to confirm which fixture a schedule row is. "Real Betis" checked
 * against a "Real Madrid" events feed matched on the shared word "real"
 * alone, locked onto Madrid's next (unrelated) fixture and reported it
 * "not started" — so a 3-week-old Real Madrid–Real Betis repost sailed
 * straight through with no timing guard (Noaim 2026-09-09).
 */
const FIXTURE_STOPWORDS = new Set([
  "real", "club", "deportivo", "deportes", "atletico", "athletic", "sporting",
  "racing", "union", "unione", "dynamo", "dinamo", "spartak", "lokomotiv",
  "united", "city", "town", "county", "rovers", "wanderers", "albion",
  "reserve", "reserves", "academy", "youth", "juniors", "women", "ladies",
  "fc", "cf", "sc", "ac", "cd", "ca", "afc", "cska", "kf", "fk", "sk", "sv",
  "us", "as", "ss", "ssc", "u17", "u18", "u19", "u20", "u21", "u23",
]);

/**
 * Distinctive lowercase tokens of `name` for confirming a fixture row:
 * words ≥3 chars, minus generic club words, minus anything the two sides
 * SHARE (so "Real Madrid" vs "Real Betis" no longer match each other on
 * "real"). Empty result ⇒ the caller can't safely confirm the opponent
 * and skips the timing guard rather than locking onto the wrong match.
 */
export function distinctiveTokens(name: string, other: string): string[] {
  const shared = new Set(searchableName(other).toLowerCase().split(/\s+/).filter(Boolean));
  return searchableName(name)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !FIXTURE_STOPWORDS.has(w) && !shared.has(w));
}

/**
 * Scheduled kickoff + finished/not-started status for a fixture. Used to
 * suppress consensus alerts that can no longer be acted on: a first-half
 * pick once the match has kicked off (the goal is often already in — real
 * complaint from Noaim 2026-09-03), or any pick on a match that already
 * ended (a stale repost of a played fixture — Noaim 2026-09-09, Real
 * Madrid–Betis). Matches on the home team's recent-results feed FIRST (a
 * row there means the match is over even when the status text is blank),
 * then the upcoming feed, and requires a token that actually identifies
 * the OPPONENT — not a club word both sides share. Returns null when the
 * opponent can't be pinned down (caller then sends without the guard).
 */
export async function fetchFixtureTiming(homeTeam: string, awayTeam: string): Promise<FixtureTiming | null> {
  const home = await searchTeam(homeTeam);
  if (!home?.idTeam) return null;

  const awayTokens = distinctiveTokens(awayTeam, homeTeam);
  const homeTokens = distinctiveTokens(homeTeam, awayTeam);
  if (awayTokens.length === 0) return null;

  const matchesOpponent = (ev: TsdbEvent): boolean => {
    const hay = `${ev.strHomeTeam ?? ""} ${ev.strAwayTeam ?? ""} ${ev.strEvent ?? ""}`.toLowerCase();
    if (!awayTokens.some((t) => hay.includes(t))) return false;
    // A different competition entirely (the feed can carry cup/friendly
    // rows) — the home side should show up in the row too.
    if (homeTokens.length > 0 && !homeTokens.some((t) => hay.includes(t))) return false;
    return true;
  };

  const classify = (ev: TsdbEvent): FixtureTiming["status"] => {
    const st = (ev.strStatus ?? "").toUpperCase();
    if (st === "FT" || st === "AET" || st === "PEN" || st.includes("FINISH") || (ev.strProgress ?? "").toUpperCase() === "FT") return "finished";
    if (st === "NS" || st === "" || st === "NOT STARTED") return "notstarted";
    return "unknown";
  };

  // Recent-results feed first. Anything here that matches the opponent is a
  // played fixture — treat it as finished even if the status field is
  // empty or the score hasn't populated, as long as its kickoff is in the
  // past. This is the case that bit us: a channel reposting an old pick.
  const last = await fetchJson<{ results?: TsdbEvent[] | null; events?: TsdbEvent[] | null }>(`${BASE}/eventslast.php?id=${home.idTeam}`);
  for (const ev of last?.results ?? last?.events ?? []) {
    if (!matchesOpponent(ev)) continue;
    const ts = parseTsdbTimestamp(ev);
    const scored = toInt(ev.intHomeScore) != null && toInt(ev.intAwayScore) != null;
    if (classify(ev) === "finished" || scored || (ts != null && ts < Date.now())) {
      return { startMs: ts, status: "finished" };
    }
    return { startMs: ts, status: classify(ev) };
  }

  const next = await fetchJson<{ events?: TsdbEvent[] | null; results?: TsdbEvent[] | null }>(`${BASE}/eventsnext.php?id=${home.idTeam}`);
  for (const ev of next?.events ?? next?.results ?? []) {
    if (!matchesOpponent(ev)) continue;
    return { startMs: parseTsdbTimestamp(ev), status: classify(ev) };
  }

  return null;
}

/**
 * Confirms the OTHER side of a fixture actually shows up in `teamId`'s
 * schedule (next or last events) before we trust anything resolved from a
 * bare team-name search. Without this, `searchteams.php?t=Rome` happily
 * returns AS Roma (Italian football) for an OCR-garbled "Rome" that was
 * really the home side of an El Salvador WOMEN'S BASKETBALL match ("Rome
 * VS QO (Women)") — real case 2026-09-09, alert went out with "🌍 Pays :
 * Italy" and "buts" (football) for a 139,5-point basketball line, on a
 * fixture that doesn't exist anywhere because the team names are OCR junk.
 * Too-short opponent names (<3 chars after stripping, e.g. "QO") can't be
 * safely verified either way — treated as unconfirmed rather than trusted.
 */
async function teamScheduleIncludesOpponent(teamId: string, opponentTeam: string): Promise<boolean> {
  const opponentKey = firstWord(opponentTeam);
  if (opponentKey.length < 3) return false;
  for (const ep of ["eventsnext", "eventslast"] as const) {
    const data = await fetchJson<{ events?: TsdbEvent[] | null; results?: TsdbEvent[] | null }>(`${BASE}/${ep}.php?id=${teamId}`);
    const arr = data?.events ?? data?.results ?? [];
    for (const ev of arr) {
      const hay = `${ev.strHomeTeam ?? ""} ${ev.strAwayTeam ?? ""} ${ev.strEvent ?? ""}`.toLowerCase();
      if (hay.includes(opponentKey)) return true;
    }
  }
  return false;
}

/**
 * Country + sport + league for a fixture, resolved from whichever side
 * TheSportsDB knows. Cached in-memory (6h) since the same fixtures recur
 * across many scraped tips. Returns null when neither team resolves OR the
 * resolved team can't be confirmed against the other side's name (see
 * teamScheduleIncludesOpponent) — an unconfirmed guess is worse than no
 * metadata at all, since it renders as a confidently wrong country/sport
 * on the VIP alert.
 */
export async function resolveFixtureMeta(homeTeam: string, awayTeam: string): Promise<FixtureMeta | null> {
  const key = `${homeTeam}|${awayTeam}`.toLowerCase();
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < META_TTL_MS) return hit.meta;

  let team = await searchTeam(homeTeam);
  let opponent = awayTeam;
  if (!team || (!team.strCountry && !team.strSport)) {
    const alt = await searchTeam(awayTeam);
    if (alt && (alt.strCountry || alt.strSport)) {
      team = alt;
      opponent = homeTeam;
    }
  }

  let meta: FixtureMeta | null = null;
  if (team?.idTeam && (await teamScheduleIncludesOpponent(team.idTeam, opponent))) {
    meta = {
      country: team.strCountry?.trim() || null,
      sport: normalizeSport(team.strSport),
      league: team.strLeague?.trim() || null,
    };
  }

  metaCache.set(key, { at: Date.now(), meta });
  return meta;
}

export interface FinishedEvent {
  homeScore: number;
  awayScore: number;
  /** TheSportsDB free tier almost never carries a half-time breakdown —
   *  null the vast majority of the time. */
  homeScoreHT: number | null;
  awayScoreHT: number | null;
}

function toInt(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Best-effort final score for a fixture, via the home team's recent-events
 * feed (eventslast.php). Only returns a row that looks finished and whose
 * opponent name loosely matches the away team. Null when nothing matches —
 * the outcome resolver then leaves the alert UNRESOLVED.
 */
export async function fetchFinishedEvent(homeTeam: string, awayTeam: string): Promise<FinishedEvent | null> {
  const home = await searchTeam(homeTeam);
  if (!home?.idTeam) return null;
  const data = await fetchJson<{ results: TsdbEvent[] | null }>(`${BASE}/eventslast.php?id=${home.idTeam}`);
  const events = data?.results ?? [];
  const awayNorm = searchableName(awayTeam).toLowerCase();

  for (const ev of events) {
    const hs = toInt(ev.intHomeScore);
    const as = toInt(ev.intAwayScore);
    if (hs == null || as == null) continue;
    const finished = (ev.strStatus ?? "").toUpperCase() === "FT" || (ev.strStatus ?? "").toLowerCase() === "match finished" || (ev.strProgress ?? "").toUpperCase() === "FT";
    if (!finished) continue;
    const opponent = `${ev.strHomeTeam ?? ""} ${ev.strAwayTeam ?? ""}`.toLowerCase();
    if (awayNorm.length >= 3 && !opponent.includes(awayNorm.split(" ")[0])) continue;
    // eventslast gives the team's fixtures from its own perspective; make
    // sure home/away line up with the query order.
    const evHomeIsQueryHome = (ev.strHomeTeam ?? "").toLowerCase().includes(searchableName(homeTeam).toLowerCase().split(" ")[0]);
    return {
      homeScore: evHomeIsQueryHome ? hs : as,
      awayScore: evHomeIsQueryHome ? as : hs,
      homeScoreHT: null,
      awayScoreHT: null,
    };
  }
  return null;
}

export interface LiveScore {
  homeScore: number;
  awayScore: number;
  /** TheSportsDB status codes: "1H" / "HT" / "2H" / "ET" / "FT" / … */
  status: string;
  /** Elapsed minute from strProgress when it's numeric, else null. */
  minute: number | null;
}

interface TsdbLiveRow {
  strSport?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  strStatus?: string;
  strProgress?: string;
}

let liveCache: { at: number; rows: TsdbLiveRow[] } | null = null;
const LIVE_TTL_MS = 60_000;

/**
 * Current score + phase for an in-play match, from the free `/livescore.php`
 * feed (one request returns every live soccer match worldwide — confirmed
 * working with the demo key "3" on 2026-09-05). Lets the consensus resolver
 * grade a first-half over/under BEFORE full-time (Noaim 2026-09-05: "pour
 * les pronostics 1ère mi-temps tu peux mettre le résultat même si le match
 * n'est pas fini"): at status "HT" the score IS the half-time score.
 * Fuzzy-matched on the first significant word of each side, same loose
 * approach as fetchFinishedEvent. Cached 60s so a batch of pending alerts
 * doesn't refetch it per alert.
 */
export async function fetchLiveScore(homeTeam: string, awayTeam: string): Promise<LiveScore | null> {
  if (!liveCache || Date.now() - liveCache.at > LIVE_TTL_MS) {
    const data = await fetchJson<{ livescore: TsdbLiveRow[] | null }>(`${BASE}/livescore.php?s=Soccer`);
    liveCache = { at: Date.now(), rows: data?.livescore ?? [] };
  }

  const homeKey = searchableName(homeTeam).toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
  const awayKey = searchableName(awayTeam).toLowerCase().split(/\s+/).filter(Boolean)[0] ?? "";
  if (homeKey.length < 3 || awayKey.length < 3) return null;

  for (const row of liveCache.rows) {
    const h = (row.strHomeTeam ?? "").toLowerCase();
    const a = (row.strAwayTeam ?? "").toLowerCase();
    const straight = h.includes(homeKey) && a.includes(awayKey);
    const swapped = h.includes(awayKey) && a.includes(homeKey);
    if (!straight && !swapped) continue;
    const hs = toInt(row.intHomeScore);
    const as = toInt(row.intAwayScore);
    if (hs == null || as == null) continue;
    const progress = (row.strProgress ?? "").trim();
    const minuteMatch = progress.match(/(\d{1,3})/);
    return {
      homeScore: straight ? hs : as,
      awayScore: straight ? as : hs,
      status: (row.strStatus ?? row.strProgress ?? "").toUpperCase(),
      minute: minuteMatch ? Number.parseInt(minuteMatch[1], 10) : null,
    };
  }
  return null;
}
