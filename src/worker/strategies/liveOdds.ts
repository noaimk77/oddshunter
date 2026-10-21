/**
 * Live in-play odds lookup for the HT-goals strategies. Exists as a distinct
 * helper (rather than reusing apiFootball.ts's pre-match provider) because:
 *  - The endpoint is `/odds/live?fixture=X`, not `/odds`, and returns a
 *    completely different payload shape keyed on in-play "bets" like
 *    "Goals Over/Under First Half" and "Next Goal".
 *  - The strategy engine only ever needs ONE specific selection per fixture
 *    (Over 0.5 HT or Over 1.5 HT at a given handicap), so returning the
 *    entire market table would be wasteful.
 *
 * One API call per fixture, only made after a live monitor state matched a
 * strategy's trigger — so the number of live-odds calls is bounded by the
 * (usually small) number of currently-tradable early-first-half fixtures.
 */

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

interface LiveOddsResponse {
  response?: Array<{
    fixture: { id: number };
    odds?: Array<{
      id: number;
      name: string;
      values?: Array<{ value: string; odd: string; handicap?: string | null; main?: boolean | null; suspended?: boolean }>;
    }>;
  }>;
  errors?: unknown;
}

export interface LiveOddsResult {
  bookmakerName: string | null;
  odds: number;
}

/**
 * Fetches the current live odds for a specific (fixture, market, handicap,
 * selection) combination. Returns null when the market isn't currently
 * offered (suspended, not published yet, or fixture too old).
 *
 * `marketName` is API-Football's live-odds market name — e.g. "Goals
 * Over/Under First Half". `handicap` is the line as a string ("0.5",
 * "1.5"). `selection` is "Over" or "Under".
 */
export async function fetchLiveOdds(
  apiKey: string,
  fixtureId: number,
  marketName: string,
  handicap: string,
  selection: "Over" | "Under",
): Promise<LiveOddsResult | null> {
  const url = `${API_FOOTBALL_BASE}/odds/live?fixture=${fixtureId}`;
  const res = await fetch(url, { headers: { "x-apisports-key": apiKey } });
  if (!res.ok) return null;
  const data = (await res.json()) as LiveOddsResponse;
  const errors = data.errors as Record<string, string> | string[] | undefined;
  if (Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0) {
    // Rate limit / no coverage — not a bug, just no odds this pass.
    return null;
  }

  const fixture = data.response?.[0];
  if (!fixture?.odds) return null;

  const market = fixture.odds.find((m) => m.name === marketName);
  if (!market?.values) return null;

  const match = market.values.find(
    (v) => v.value === selection && (v.handicap ?? "") === handicap && !v.suspended,
  );
  if (!match) return null;

  const odds = Number.parseFloat(match.odd);
  if (!Number.isFinite(odds) || odds < 1.01) return null;

  return { bookmakerName: null, odds };
}
