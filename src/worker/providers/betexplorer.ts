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

export const DEFAULT_BETEXPLORER_CONFIG: BetExplorerConfig = {
  maxDetailFetchesPerCycle: 15,
  minRequestIntervalMs: 1500,
  minDropPercentForDetail: 30,
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

const MARKET_COLUMN_LABELS: Record<string, string[]> = {
  "1x2": ["home", "draw", "away"],
};

async function politeFetch(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" } });
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
      if (sport !== "football") return [];

      const droppingHtml = await politeFetch(`${BASE_URL}/football/dropping-odds/`);
      const rows = parseDroppingOddsPage(droppingHtml);

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

      for (const row of candidates) {
        try {
          const body = await politeFetch(`${BASE_URL}/match-odds/${row.matchId}/0/1x2/bestOdds/?lang=en`);
          const bookiePoints = parseMatchOddsFragment(body);
          const labels = MARKET_COLUMN_LABELS["1x2"];

          for (const bp of bookiePoints) {
            const position = labels[bp.columnIndex] ?? `col${bp.columnIndex}`;
            points.push({
              providerName: "betexplorer",
              externalCompetitionId: `${row.country}:${row.league}`,
              externalEventId: row.matchId,
              externalMarketId: `${row.matchId}:1x2:${bp.bookmakerId}`,
              externalSelectionId: `${row.matchId}:1x2:${bp.bookmakerId}:${position}`,
              sport: "football",
              country: row.country,
              competitionName: row.league,
              homeTeam: row.homeTeam,
              awayTeam: row.awayTeam,
              kickoff: row.kickoff ?? now,
              marketType: "match_winner",
              marketName: `1X2 (${bp.bookmakerName})`,
              marketStatus: "open",
              selectionName: position,
              selectionPosition: position,
              price: bp.price,
              timestamp: bp.createdAt,
            });
          }
        } catch (err) {
          console.error(`[betexplorer] failed to fetch detail for match ${row.matchId}`, err);
        }
        await sleep(config.minRequestIntervalMs);
      }

      return points;
    },
  };
}
