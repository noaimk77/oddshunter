import type { MarketDataProvider, NormalizedOddsPoint } from "./types";
import { ProviderNotConfiguredError } from "./types";

/**
 * TheOddsAPI (theoddsapi.com) — not one of the providers named in the
 * original spec (which named Pinnacle/Bet365/SBOBET/SABA direct, plus
 * OddsMatrix/Sportradar as professional aggregators). Added after research
 * turned up that OddsMatrix has no self-serve trial (sales-gated) and
 * Sportradar starts at $10k+/month — neither realistic pre-revenue.
 *
 * Note the name: this is TheOddsAPI (theoddsapi.com, no hyphen), NOT the
 * similarly-named "The Odds API" (the-odds-api.com, with hyphens) this
 * adapter originally targeted — Noaim signed up on the former by the time
 * he had a working key (2026-08-18), so the adapter was rewritten to match
 * its actual request/response shape instead of asking him to redo signup.
 *
 * Confirmed 2026-08-18 (pricing page + live probe against Noaim's own key):
 * the FREE tier only covers NBA + MLB moneylines — football/soccer is
 * gated behind the $29/month Professional plan. `/sports/` on the free key
 * lists only `basketball_nba` and `baseball_mlb`, so the league keys below
 * are the vendor's documented naming convention, NOT yet confirmed against
 * a real listing — re-run the same `/sports/` probe once Professional is
 * active and fix any key that doesn't match.
 */

const API_HOST = "https://api.theoddsapi.com";

/**
 * V1 is football-only (spec section 20 Q3, decided 2026-08-18). UNVERIFIED
 * sport_key guesses (see file header) — confirm against GET /sports/ once
 * the Professional plan is active before relying on this list.
 */
const DEFAULT_LEAGUES: { key: string; name: string; country: string }[] = [
  { key: "soccer_epl", name: "Premier League", country: "England" },
  { key: "soccer_france_ligue_one", name: "Ligue 1", country: "France" },
  { key: "soccer_spain_la_liga", name: "La Liga", country: "Spain" },
  { key: "soccer_italy_serie_a", name: "Serie A", country: "Italy" },
  { key: "soccer_germany_bundesliga", name: "Bundesliga", country: "Germany" },
  { key: "soccer_uefa_champs_league", name: "UEFA Champions League", country: "Europe" },
];

interface TheOddsApiOutcome {
  name: string;
  price: number;
}
interface TheOddsApiBook {
  book: string;
  market: string;
  updated_at: string;
  outcomes: TheOddsApiOutcome[];
}
interface TheOddsApiEvent {
  event_id: string;
  home_team: string;
  away_team: string;
  start_time: string;
  books: TheOddsApiBook[];
}
interface TheOddsApiResponse {
  success: boolean;
  data: TheOddsApiEvent[];
}

function selectionPosition(outcomeName: string, homeTeam: string, awayTeam: string): string {
  if (outcomeName === homeTeam) return "home";
  if (outcomeName === awayTeam) return "away";
  return "draw";
}

export function createTheOddsApiProvider(leagues = DEFAULT_LEAGUES): MarketDataProvider {
  const isConfigured = () => Boolean(process.env.THE_ODDS_API_KEY);

  async function fetchLeagueOdds(league: (typeof DEFAULT_LEAGUES)[number]): Promise<NormalizedOddsPoint[]> {
    const apiKey = process.env.THE_ODDS_API_KEY!;
    const url = new URL(`${API_HOST}/odds/`);
    url.searchParams.set("sport_key", league.key);
    url.searchParams.set("markets", "h2h");
    url.searchParams.set("oddsFormat", "decimal"); // default is American — the rest of the app assumes decimal

    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!res.ok) {
      throw new Error(`TheOddsAPI request failed for ${league.key}: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as TheOddsApiResponse;

    const points: NormalizedOddsPoint[] = [];
    for (const event of body.data ?? []) {
      for (const book of event.books) {
        for (const outcome of book.outcomes) {
          points.push({
            providerName: "theoddsapi",
            externalCompetitionId: league.key,
            externalEventId: event.event_id,
            externalMarketId: `${event.event_id}:${book.market}:${book.book}`,
            externalSelectionId: `${event.event_id}:${book.market}:${book.book}:${outcome.name}`,
            sport: "football",
            country: league.country,
            competitionName: league.name,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            kickoff: new Date(event.start_time),
            marketType: book.market,
            marketName: book.market === "h2h" ? "1X2" : book.market,
            marketStatus: "open",
            selectionName: outcome.name,
            selectionPosition: selectionPosition(outcome.name, event.home_team, event.away_team),
            price: outcome.price,
            timestamp: new Date(book.updated_at),
          });
        }
      }
    }
    return points;
  }

  return {
    name: "theoddsapi",
    isConfigured,
    async fetchPreMatchOdds(sport: string): Promise<NormalizedOddsPoint[]> {
      if (!isConfigured()) throw new ProviderNotConfiguredError("TheOddsAPI");
      if (sport !== "football") return [];

      const results = await Promise.all(
        leagues.map((league) =>
          fetchLeagueOdds(league).catch((err) => {
            console.error(`[theoddsapi] failed to fetch ${league.key}`, err);
            return [] as NormalizedOddsPoint[];
          }),
        ),
      );
      return results.flat();
    },
  };
}
