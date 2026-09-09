import * as cheerio from "cheerio";
import type { MarketDataProvider, NormalizedOddsPoint } from "./types";

/**
 * BetExplorer — free, public, no account/key required. Chosen after
 * verifying every source in Noaim's priority list (PS3838, SBOBET, OrbitX,
 * Betfair Exchange) is either closed to retail clients, geo-blocked for
 * France, or has no API at all (see the 2026-08-19 audit). BetExplorer is
 * server-rendered HTML (confirmed via a raw curl — no headless browser
 * needed) and its robots.txt only disallows `/ad/`, `/redirect/`,
 * `/bookmaker/` and a handful of filter query params — the two paths this
 * adapter uses (`/football/dropping-odds/` and `/match-odds/...`) are not
 * on that list.
 *
 * Two-stage fetch, deliberately cheap on requests:
 *
 * 1. `/football/dropping-odds/` — one request returns EVERY match across
 *    every league currently showing a significant drop, pre-aggregated by
 *    BetExplorer itself across however many bookmakers it tracks
 *    (including some Asian-facing ones like BetInAsia, alongside 1xBet,
 *    Betsson, Betfair...). This alone already covers Noaim's exotic-league
 *    priority (Scotland Highland League, Iran, small Australian leagues
 *    show up naturally — no need to enumerate leagues ourselves).
 *
 * 2. `/match-odds/{matchId}/0/{market}/bestOdds/?lang=en` — per-bookmaker
 *    detail (name, price, timestamp) for a CAPPED number of the biggest
 *    movers each cycle, not every match — keeps this a polite, low-volume
 *    scraper rather than hammering every match page on every poll.
 */

const BASE_URL = "https://www.betexplorer.com";
const USER_AGENT = "OddshunterWorker/1.0 (+https://oddshunter98.netlify.app)";

export interface BetExplorerConfig {
  /** Cap on how many matches get the detailed per-bookmaker fetch per cycle. */
  maxDetailFetchesPerCycle: number;
  /** Minimum delay between two requests to betexplorer.com, in ms — politeness, not evasion. */
  minRequestIntervalMs: number;
  /** Only fetch bookmaker detail for matches with at least this much drop, per BetExplorer's own figure. */
  minDropPercentForDetail: number;
}

/**
 * `minDropPercentForDetail` lowered 30 -> 15 (2026-08-20): live-checked the
 * real dropping-odds page and only 6 of 17 currently-listed matches cleared
 * the old 30% bar — the other 11 (23-29% drops, still large moves) never
 * got a per-bookmaker breakdown at all, so MULTI_BOOK_CONFIRMATION had far
 * fewer matches to even look at than it should. `maxDetailFetchesPerCycle`
 * raised 15 -> 25 to match (more matches now qualify per cycle).
 *
 * `maxDetailFetchesPerCycle` lowered 25 -> 8 (2026-08-23): each candidate
 * costs 4 sequential requests (DETAIL_MARKET_CODES), so 25 candidates was
 * up to 100 requests spaced `minRequestIntervalMs` apart — 150s+ of sleeping
 * alone, before real request latency. That fit fine under the old 20-minute
 * INGEST_POLL_INTERVAL_MS but silently ate 3-4 minutes of every cycle once
 * it was dropped to 2 minutes for the Ultra plan (looked exactly like a
 * hang: no per-step logging existed yet to show it was just working
 * through a long, deliberately-polite queue). 8 candidates keeps this phase
 * to roughly 30-60s so it actually fits the faster cadence.
 */
export const DEFAULT_BETEXPLORER_CONFIG: BetExplorerConfig = {
  maxDetailFetchesPerCycle: 8,
  minRequestIntervalMs: 1500,
  // Lowered 15 -> 5 (2026-08-25): confirmed live that a real, delivered
  // ODDS_DROP (UAI Urquiza, 8.2% drop) fell BETWEEN the two thresholds —
  // above ODDS_DROP's own 5% trigger, below this 15% detail cutoff — so it
  // never got a per-bookmaker breakdown and shipped as a bare "-8.2%" with
  // no MULTI_BOOK_CONFIRMATION metadata, no bookmaker names, nothing that
  // reads as a real signal rather than a raw number (Noaim, 2026-08-25:
  // "il faut qu'il y ait une logique derrière"). Matching this to
  // ODDS_DROP's own threshold means almost every signal that's actually
  // eligible to fire also has the richer context to back it up. Safe now
  // that ingest.ts is batched (2026-08-24) — the detail-fetch count is no
  // longer the free-tier database cost driver it used to be; the real
  // ceiling is maxDetailFetchesPerCycle + request time, unchanged here.
  minDropPercentForDetail: 5,
};

export interface DroppingOddsRow {
  matchId: string;
  matchPath: string;
  country: string;
  league: string;
  kickoff: Date | null;
  homeTeam: string;
  awayTeam: string;
  dropPercent: number;
  current: { home: number | null; draw: number | null; away: number | null };
}

export interface BookmakerOddsPoint {
  bookmakerId: string;
  bookmakerName: string;
  outcomeId: string;
  /** Column position within the row: 0 = first outcome (home/over/etc.), 1 = second, 2 = third. */
  columnIndex: number;
  price: number;
  createdAt: Date;
}

function parseDateHeader(text: string): { day: number; month: number; year: number } | null {
  const m = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

function combineDateAndTime(date: { day: number; month: number; year: number } | null, time: string): Date | null {
  const tm = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const base = date ?? (() => {
    const now = new Date();
    return { day: now.getUTCDate(), month: now.getUTCMonth() + 1, year: now.getUTCFullYear() };
  })();
  // BetExplorer times are not explicitly timezoned on this page — treated as
  // UTC here (documented simplification, matches the precision this
  // detector family needs: minutes-scale movement, not exact kickoff).
  return new Date(Date.UTC(base.year, base.month - 1, base.day, Number(tm[1]), Number(tm[2])));
}

function parsePercent(text: string): number {
  const m = text.trim().match(/(\d+(?:\.\d+)?)%/);
  return m ? Number.parseFloat(m[1]) : 0;
}

function matchIdFromHref(href: string): string {
  const parts = href.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? href;
}

/**
 * Pure parser — no network. Each `<tbody>` on the page groups one league:
 * first row is the league header, an optional `<th class="table-main__date">`
 * row updates the running date for subsequent match rows in that block
 * (rows with no date header yet are "today").
 */
export function parseDroppingOddsPage(html: string): DroppingOddsRow[] {
  const $ = cheerio.load(html);
  const rows: DroppingOddsRow[] = [];

  $("#odds-movements tbody").each((_, tbody) => {
    const $tbody = $(tbody);
    const headerLink = $tbody.find("th.h-text-left a.table-main__tournament").first();
    if (headerLink.length === 0) return;

    const headerText = headerLink.text().trim(); // e.g. "Scotland: Highland League"
    const [country, league] = headerText.includes(":")
      ? [headerText.slice(0, headerText.indexOf(":")).trim(), headerText.slice(headerText.indexOf(":") + 1).trim()]
      : [headerText, headerText];

    let currentDate: { day: number; month: number; year: number } | null = null;

    $tbody.find("> tr").each((__, tr) => {
      const $tr = $(tr);

      const dateHeader = $tr.find("th.table-main__date");
      if (dateHeader.length > 0) {
        currentDate = parseDateHeader(dateHeader.text());
        return;
      }

      const matchCell = $tr.find("td.table-main__tt");
      if (matchCell.length === 0) return; // header row, skip

      const time = matchCell.find(".table-main__time").text();
      const link = matchCell.find("a").first();
      const href = link.attr("href") ?? "";
      const teamsText = link.text().trim(); // "Team A - Team B"
      const sepIdx = teamsText.indexOf(" - ");
      const homeTeam = sepIdx >= 0 ? teamsText.slice(0, sepIdx).trim() : teamsText;
      const awayTeam = sepIdx >= 0 ? teamsText.slice(sepIdx + 3).trim() : "";

      const dropText = $tr.find("td.table-main__drop").text();
      const oddsCells = $tr.find("td.table-main__odds");
      const readOdd = (i: number): number | null => {
        // `data-odd` lives on a nested <a> (desktop/mobile variants), not on
        // the <td> itself.
        const raw = oddsCells.eq(i).find("[data-odd]").first().attr("data-odd");
        const parsed = raw ? Number.parseFloat(raw) : NaN;
        return Number.isFinite(parsed) ? parsed : null;
      };

      if (!href || !teamsText) return;

      rows.push({
        matchId: matchIdFromHref(href),
        matchPath: href,
        country,
        league,
        kickoff: combineDateAndTime(currentDate, time),
        homeTeam,
        awayTeam,
        dropPercent: parsePercent(dropText),
        current: { home: readOdd(0), draw: readOdd(1), away: readOdd(2) },
      });
    });
  });

  return rows;
}

/**
 * The `/match-odds/...` endpoint returns `{"odds": "<html fragment>"}` — a
 * table with one row per bookmaker, each cell carrying `data-odd`,
 * `data-created` (DD,MM,YYYY,HH,mm), `data-bookie`, `data-bid`, `data-oid`.
 * Column order matches the market's outcome order (1/X/2 for match winner,
 * etc.) — same convention as parseDroppingOddsPage's `current` object.
 */
export function parseMatchOddsFragment(responseBody: string): BookmakerOddsPoint[] {
  let html: string;
  try {
    const parsed = JSON.parse(responseBody) as { odds?: string };
    html = parsed.odds ?? "";
  } catch {
    html = responseBody; // tolerate being handed the fragment directly (e.g. in tests)
  }

  const $ = cheerio.load(html);
  const points: BookmakerOddsPoint[] = [];

  $("table.oddsComparison__table tbody tr[data-bid]").each((_, tr) => {
    const $tr = $(tr);
    const bookmakerId = $tr.attr("data-bid") ?? "";
    const bookmakerName = $tr.find("a.in-bookmaker-logo-link").first().text().trim();

    $tr.find("td[data-oid]").each((columnIndex, td) => {
      const $td = $(td);
      const priceRaw = $td.attr("data-odd");
      const price = priceRaw ? Number.parseFloat(priceRaw) : NaN;
      if (!Number.isFinite(price)) return;

      const outcomeId = $td.attr("data-oid") ?? "";
      const createdRaw = $td.attr("data-created"); // "19,08,2026,14,59"
      let createdAt = new Date();
      const cm = createdRaw?.match(/^(\d{2}),(\d{2}),(\d{4}),(\d{1,2}),(\d{2})$/);
      if (cm) {
        createdAt = new Date(Date.UTC(Number(cm[3]), Number(cm[2]) - 1, Number(cm[1]), Number(cm[4]), Number(cm[5])));
      }

      points.push({ bookmakerId, bookmakerName: bookmakerName || `bookie-${bookmakerId}`, outcomeId, columnIndex, price, createdAt });
    });
  });

  return points;
}

export interface LinedBookmakerOddsPoint extends BookmakerOddsPoint {
  /** The total/handicap this price applies to, e.g. "2.5" or "-0.75" —
   *  BetExplorer bundles every line into one response for `ou`/`ah`
   *  (see parseLinedMatchOddsFragment header), so this is what keeps
   *  different lines from being silently merged as if they were the same
   *  market. */
  line: string;
}

/**
 * `ou` (Over/Under) and `ah` (Asian Handicap) responses bundle EVERY line
 * into one fragment as a separate `<table class="... best-odds-X.XX ...">`
 * per line (confirmed live 2026-08-25: 23 line-tables for a real `ou`
 * fragment, from 0.50 up to 8.50; AH lines carry a sign, e.g.
 * `best-odds--0.75` for a -0.75 handicap, `best-odds-0` for the pick'em
 * line) — NOT one table for the whole market like `1x2`/`ha`/`dc`/`bts`.
 * Each line-table has the identical per-bookmaker row shape the other
 * markets already use (`tr[data-bid]`, then `td[data-odd]` in column
 * order), so this reuses that same reading logic per table, tagging every
 * point with the line read from the table's own class name.
 */
export function parseLinedMatchOddsFragment(responseBody: string): LinedBookmakerOddsPoint[] {
  let html: string;
  try {
    const parsed = JSON.parse(responseBody) as { odds?: string };
    html = parsed.odds ?? "";
  } catch {
    html = responseBody;
  }

  const $ = cheerio.load(html);
  const points: LinedBookmakerOddsPoint[] = [];

  $("table.table-main.sortable").each((_, table) => {
    const $table = $(table);
    const classAttr = $table.attr("class") ?? "";
    const lineMatch = classAttr.match(/best-odds-(-?\d+(?:\.\d+)?)/);
    if (!lineMatch) return; // not a per-line odds table (e.g. a stray archive/aodds table)
    const line = lineMatch[1];

    $table.find("tr[data-bid]").each((_, tr) => {
      const $tr = $(tr);
      const bookmakerId = $tr.attr("data-bid") ?? "";

      $tr.find("td[data-odd]").each((columnIndex, td) => {
        const $td = $(td);
        const priceRaw = $td.attr("data-odd");
        const price = priceRaw ? Number.parseFloat(priceRaw) : NaN;
        if (!Number.isFinite(price)) return;

        // `data-oid` is only present on some cells (the row's "best price"
        // cell carries the fuller attribute set) — fall back to a
        // line+bookmaker+column composite so every price still gets a
        // stable, unique id even without it.
        const outcomeId = $td.attr("data-oid") ?? `${line}:${bookmakerId}:${columnIndex}`;
        const bookmakerName = $td.attr("data-bookie") ?? "";
        const createdRaw = $td.attr("data-created");
        let createdAt = new Date();
        const cm = createdRaw?.match(/^(\d{2}),(\d{2}),(\d{4}),(\d{1,2}),(\d{2})$/);
        if (cm) {
          createdAt = new Date(Date.UTC(Number(cm[3]), Number(cm[2]) - 1, Number(cm[1]), Number(cm[4]), Number(cm[5])));
        }

        points.push({
          bookmakerId,
          bookmakerName: bookmakerName || `bookie-${bookmakerId}`,
          outcomeId,
          columnIndex,
          price,
          createdAt,
          line,
        });
      });
    });
  });

  return points;
}

export interface ResultRow {
  matchId: string;
  /** Added 2026-09-05 so results can be looked up by team name (fuzzy
   *  match), not just BetExplorer's own matchId — the consensus outcome
   *  resolver has no matchId, only the home/away names a tipster posted.
   *  TheSportsDB has thin coverage of the reserve/youth leagues this feed
   *  targets (confirmed miss: Croatian U19 sides never resolved); this
   *  results listing is the same site the odds already come from, so its
   *  league coverage lines up with what gets detected in the first place —
   *  confirmed live 2026-09-05: "Sesvete", "Croatia", "U19" all present on
   *  a single fetch of this page. */
  homeTeam: string;
  awayTeam: string;
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halftimeHomeGoals: number | null;
  halftimeAwayGoals: number | null;
}

/**
 * `/football/results/` — unlike the individual match page, this listing
 * renders full content server-side even from a French-detected visitor;
 * the per-match page returns nothing but a mandatory age-verification gate
 * for FR traffic (confirmed live, 2026-08-22 — `x-country-code: FR` on the
 * response, real content entirely replaced by the gate). This listing was
 * the only result-bearing page that wasn't gated, so it's the one this
 * scraper uses instead of trying to defeat the per-match gate.
 *
 * Score format confirmed live: `td.table-main__result` holds full-time as
 * "H:A" (e.g. "2:2"), `td.table-main__partial` holds "(HT, FT)" (e.g.
 * "(0:0, 2:2)") — half-time is the first pair, full-time the second
 * (redundant with `.table-main__result` but confirms the format).
 */
export function parseResultsPage(html: string): ResultRow[] {
  const $ = cheerio.load(html);
  const rows: ResultRow[] = [];

  $("table.table-main tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const link = $tr.find("td.table-main__tt a").first();
    const href = link.attr("href");
    if (!href) return; // header row (tournament name), skip

    const resultText = $tr.find("td.table-main__result").text();
    const ftMatch = resultText.match(/(\d+):(\d+)/);
    if (!ftMatch) return; // not started / postponed — no score to read yet

    const partialText = $tr.find("td.table-main__partial").text();
    const partialMatches = [...partialText.matchAll(/(\d+):(\d+)/g)];
    const ht = partialMatches[0];

    // "Team A - Team B" — cheerio's .text() already strips the <strong>
    // wrapping whichever side is the favorite, same convention as
    // parseDroppingOddsPage's teamsText.
    const teamsText = link.text().trim();
    const sepIdx = teamsText.indexOf(" - ");
    const homeTeam = sepIdx >= 0 ? teamsText.slice(0, sepIdx).trim() : teamsText;
    const awayTeam = sepIdx >= 0 ? teamsText.slice(sepIdx + 3).trim() : "";

    rows.push({
      matchId: matchIdFromHref(href),
      homeTeam,
      awayTeam,
      fullTimeHomeGoals: Number.parseInt(ftMatch[1], 10),
      fullTimeAwayGoals: Number.parseInt(ftMatch[2], 10),
      halftimeHomeGoals: ht ? Number.parseInt(ht[1], 10) : null,
      halftimeAwayGoals: ht ? Number.parseInt(ht[2], 10) : null,
    });
  });

  return rows;
}

/**
 * Fetches today's and yesterday's finished-match results in one pass (two
 * requests) — cheap and keyless, unlike API-Football's quota-gated
 * fixture lookup, so there's no reason to ration this the same way.
 * `dayOffset: 0` is today; BetExplorer's own date-navigation param is
 * `?year=&month=&day=`.
 */
export async function fetchRecentResults(): Promise<Map<string, ResultRow>> {
  const byMatchId = new Map<string, ResultRow>();

  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateParam = (d: Date) => `?year=${d.getUTCFullYear()}&month=${String(d.getUTCMonth() + 1).padStart(2, "0")}&day=${String(d.getUTCDate()).padStart(2, "0")}`;

  for (const d of [today, yesterday]) {
    try {
      const html = await politeFetch(`${BASE_URL}/football/results/${dateParam(d)}`);
      for (const row of parseResultsPage(html)) byMatchId.set(row.matchId, row);
    } catch (err) {
      console.error(`[betexplorer] failed to fetch results for ${d.toISOString().slice(0, 10)}`, err);
    }
  }

  return byMatchId;
}

/**
 * Markets beyond 1X2 — verified live 2026-08-20 against a real match before
 * adding, not assumed (BetExplorer's own market-tab codes, confirmed via
 * `data-bet-type` in the page's own JS, then cross-checked against the
 * actual bookmaker-row column count on `/match-odds/{id}/0/{code}/...`):
 * - `ha` (site labels it "DNB" — Draw No Bet): 2 columns, home/away.
 * - `dc` (Double Chance): 3 columns, 1X/12/X2.
 * - `bts` (Both Teams To Score): 2 columns, yes/no.
 * All three are single, unambiguous outcome sets per match — no "line"
 * dimension, so a plain column-position mapping is correct and complete.
 *
 * `ou` (Over/Under) and `ah` (Asian Handicap) added 2026-08-25: their
 * response bundles MULTIPLE totals/handicaps into one fragment as separate
 * per-line `<table class="... best-odds-X.XX ...">` blocks (verified live —
 * 23 line-tables in a real `ou` fragment) — `parseLinedMatchOddsFragment`
 * reads each one and tags every point with its line, so different lines
 * (Over 1.5 vs Over 3.5) are always distinct markets, never silently
 * averaged together. 2 columns each (over/under, home/away for AH).
 */
const MARKET_COLUMN_LABELS: Record<string, string[]> = {
  "1x2": ["home", "draw", "away"],
  ha: ["home", "away"],
  dc: ["1x", "12", "x2"],
  bts: ["yes", "no"],
  ou: ["over", "under"],
  ah: ["home", "away"],
};

const MARKET_META: Record<string, { type: string; name: string }> = {
  "1x2": { type: "match_winner", name: "1X2" },
  ha: { type: "dnb", name: "DNB" },
  dc: { type: "double_chance", name: "DC" },
  bts: { type: "btts", name: "BTTS" },
  ou: { type: "over_under", name: "O/U" },
  ah: { type: "asian_handicap", name: "AH" },
};

/** Market codes whose response bundles multiple lines into one fragment —
 *  see parseLinedMatchOddsFragment. Every other market code has exactly one
 *  outcome set per match and uses parseMatchOddsFragment instead. */
const LINED_MARKET_CODES = new Set(["ou", "ah"]);

/** See apiFootball.ts's FETCH_TIMEOUT_MS comment — a stalled request here
 *  blocks the same shared worker loop just as badly. */
const FETCH_TIMEOUT_MS = 15_000;

async function politeFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`BetExplorer request failed: ${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBetExplorerProvider(config: BetExplorerConfig = DEFAULT_BETEXPLORER_CONFIG): MarketDataProvider {
  return {
    name: "betexplorer",
    isConfigured: () => true, // no account/key needed — always available
    async fetchPreMatchOdds(sport: string): Promise<NormalizedOddsPoint[]> {
      console.log("[betexplorer] fetchPreMatchOdds: starting");
      if (sport !== "football") return [];

      const droppingHtml = await politeFetch(`${BASE_URL}/football/dropping-odds/`);
      const rows = parseDroppingOddsPage(droppingHtml);
      console.log(`[betexplorer] dropping-odds page: ${rows.length} rows`);

      const points: NormalizedOddsPoint[] = [];
      const now = new Date();

      // Coarse layer: BetExplorer's own consensus "best odds" per match, one
      // point per outcome — cheap (already have it from the page we just
      // fetched), covers every dropping match even beyond the detail cap.
      for (const row of rows) {
        const columns: [keyof typeof row.current, string][] = [
          ["home", "home"],
          ["draw", "draw"],
          ["away", "away"],
        ];
        for (const [key, position] of columns) {
          const price = row.current[key];
          if (price == null) continue;
          points.push({
            providerName: "betexplorer-summary",
            externalCompetitionId: `${row.country}:${row.league}`,
            externalEventId: row.matchId,
            externalMarketId: `${row.matchId}:1x2:consensus`,
            externalSelectionId: `${row.matchId}:1x2:consensus:${position}`,
            sport: "football",
            country: row.country,
            competitionName: row.league,
            homeTeam: row.homeTeam,
            awayTeam: row.awayTeam,
            kickoff: row.kickoff ?? now,
            marketType: "match_winner",
            marketName: "1X2",
            marketStatus: "open",
            selectionName: position,
            selectionPosition: position,
            price,
            timestamp: now,
          });
        }
      }

      // Detail layer: per-bookmaker breakdown for the biggest movers only —
      // this is what unlocks MULTI_BOOK_CONFIRMATION later and a real
      // per-bookmaker historical series, without hammering every match.
      const candidates = rows
        .filter((r) => r.dropPercent >= config.minDropPercentForDetail)
        .sort((a, b) => b.dropPercent - a.dropPercent)
        .slice(0, config.maxDetailFetchesPerCycle);
      console.log(`[betexplorer] detail layer: ${candidates.length} candidate match(es) to fetch`);

      for (const [i, row] of candidates.entries()) {
        console.log(`[betexplorer] detail ${i + 1}/${candidates.length}: match ${row.matchId}`);
        for (const marketCode of DETAIL_MARKET_CODES) {
          try {
            const body = await politeFetch(`${BASE_URL}/match-odds/${row.matchId}/0/${marketCode}/bestOdds/?lang=en`);
            const meta = MARKET_META[marketCode];

            if (LINED_MARKET_CODES.has(marketCode)) {
              // ou/ah: one response bundles every line — see
              // parseLinedMatchOddsFragment. Each (line, bookmaker) pair is
              // its own distinct market so ODDS_DROP etc. never compare
              // Over 1.5 against Over 3.5 as if they were the same thing.
              const labels = MARKET_COLUMN_LABELS[marketCode];
              const linedPoints = parseLinedMatchOddsFragment(body);
              for (const bp of linedPoints) {
                const position = labels[bp.columnIndex] ?? `col${bp.columnIndex}`;
                points.push({
                  providerName: "betexplorer",
                  externalCompetitionId: `${row.country}:${row.league}`,
                  externalEventId: row.matchId,
                  externalMarketId: `${row.matchId}:${marketCode}:${bp.line}:${bp.bookmakerId}`,
                  externalSelectionId: `${row.matchId}:${marketCode}:${bp.line}:${bp.bookmakerId}:${position}`,
                  sport: "football",
                  country: row.country,
                  competitionName: row.league,
                  homeTeam: row.homeTeam,
                  awayTeam: row.awayTeam,
                  kickoff: row.kickoff ?? now,
                  marketType: meta.type,
                  marketName: `${meta.name} ${bp.line} (${bp.bookmakerName})`,
                  marketStatus: "open",
                  selectionName: position,
                  selectionPosition: position,
                  price: bp.price,
                  timestamp: bp.createdAt,
                });
              }
            } else {
              const bookiePoints = parseMatchOddsFragment(body);
              const labels = MARKET_COLUMN_LABELS[marketCode];

              for (const bp of bookiePoints) {
                const position = labels[bp.columnIndex] ?? `col${bp.columnIndex}`;
                points.push({
                  providerName: "betexplorer",
                  externalCompetitionId: `${row.country}:${row.league}`,
                  externalEventId: row.matchId,
                  externalMarketId: `${row.matchId}:${marketCode}:${bp.bookmakerId}`,
                  externalSelectionId: `${row.matchId}:${marketCode}:${bp.bookmakerId}:${position}`,
                  sport: "football",
                  country: row.country,
                  competitionName: row.league,
                  homeTeam: row.homeTeam,
                  awayTeam: row.awayTeam,
                  kickoff: row.kickoff ?? now,
                  marketType: meta.type,
                  marketName: `${meta.name} (${bp.bookmakerName})`,
                  marketStatus: "open",
                  selectionName: position,
                  selectionPosition: position,
                  price: bp.price,
                  timestamp: bp.createdAt,
                });
              }
            }
          } catch (err) {
            console.error(`[betexplorer] failed to fetch ${marketCode} detail for match ${row.matchId}`, err);
          }
          await sleep(config.minRequestIntervalMs);
        }
      }

      console.log(`[betexplorer] fetchPreMatchOdds: done, ${points.length} points`);
      return points;
    },
  };
}

/**
 * Market codes fetched for the detail layer, in order. `1x2` first (highest
 * priority — what every other detector was built and tuned against), then
 * the three single-line markets, then `ou`/`ah` last (2026-08-25) since
 * their ~900KB-per-request lined responses are the most expensive part of
 * this phase — if a request budget/time limit is ever added, these are the
 * first two to skip.
 */
const DETAIL_MARKET_CODES = ["1x2", "ha", "dc", "bts", "ou", "ah"] as const;
