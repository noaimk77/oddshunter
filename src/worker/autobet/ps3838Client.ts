import { randomUUID } from "node:crypto";

/**
 * PS3838 REST client. Auth is HTTP Basic with the account's own
 * username/password (PS3838_USERNAME / PS3838_PASSWORD Fly secrets) — this
 * is NOT a scoped, revocable API key, it's the same credential that logs
 * into the account on the website. Set only via `flyctl secrets set` on
 * Noaim's own machine, never pasted into chat (see 2026-09-27 conversation).
 * Spec: https://ps3838api.github.io/docs/ (Lines API + Bets API, v4).
 */
const BASE_URL = "https://api.ps3838.com";

export class Ps3838ConfigError extends Error {}

function authHeader(): string {
  const user = process.env.PS3838_USERNAME;
  const pass = process.env.PS3838_PASSWORD;
  if (!user || !pass) {
    throw new Ps3838ConfigError("PS3838_USERNAME / PS3838_PASSWORD not set — see .env.example.");
  }
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf-8").toString("base64")}`;
}

async function request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE_URL + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PS3838 ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface Ps3838League {
  id: number;
  name: string;
}

export interface Ps3838Event {
  id: number;
  starts: string;
  home: string;
  away: string;
  rotNum?: string;
  liveStatus?: number;
  status?: string;
}

export interface Ps3838League2 extends Ps3838League {
  events: Ps3838Event[];
}

/** GET /v3/fixtures — every non-settled event for a sport, grouped by league. */
export async function getFixtures(sportId: number): Promise<Ps3838League2[]> {
  const data = await request<{ league: Ps3838League2[] }>("/v3/fixtures", { sportId });
  return data.league ?? [];
}

export type Ps3838BetType = "SPREAD" | "MONEYLINE" | "TOTAL_POINTS" | "TEAM_TOTAL_POINTS";
export type Ps3838Team = "Team1" | "Team2" | "Draw";
export type Ps3838Side = "OVER" | "UNDER";

export interface GetLineParams {
  sportId: number;
  leagueId: number;
  eventId: number;
  periodNumber: number;
  betType: Ps3838BetType;
  handicap?: number;
  team?: Ps3838Team;
  side?: Ps3838Side;
}

export interface Ps3838Line {
  lineId: number;
  price: number;
  team1Score?: number;
  team2Score?: number;
  status?: string;
}

/** GET /v2/line — the live, bettable lineId for one exact selection. Must
 *  be called right before placing the bet: lineId goes stale within
 *  seconds on a moving market. */
export async function getLine(p: GetLineParams): Promise<Ps3838Line> {
  return request<Ps3838Line>("/v2/line", {
    sportId: p.sportId,
    leagueId: p.leagueId,
    eventId: p.eventId,
    periodNumber: p.periodNumber,
    betType: p.betType,
    handicap: p.handicap,
    team: p.team,
    side: p.side,
    oddsFormat: "Decimal",
  });
}

export interface PlaceBetParams {
  lineId: number;
  altLineId?: number;
  sportId: number;
  eventId: number;
  periodNumber: number;
  betType: Ps3838BetType;
  team?: Ps3838Team;
  side?: Ps3838Side;
  handicap?: number;
  stake: number;
}

export interface PlaceBetResult {
  status: string; // ACCEPTED | REJECTED | PENDING_ACCEPTANCE | ...
  betId?: number;
  errorCode?: string;
}

/** POST /v4/bets/place — straight bet only (no parlay/teaser/special: out of
 *  scope, the VIP consensus feed only ever produces single picks). */
export async function placeBet(p: PlaceBetParams): Promise<PlaceBetResult> {
  const res = await fetch(`${BASE_URL}/v4/bets/place`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      oddsFormat: "Decimal",
      uniqueRequestId: randomUUID(),
      acceptBetterLine: true,
      stake: p.stake,
      winRiskStake: "RISK",
      lineId: p.lineId,
      altLineId: p.altLineId ?? null,
      fillType: "NORMAL",
      sportId: p.sportId,
      eventId: p.eventId,
      periodNumber: p.periodNumber,
      betType: p.betType,
      team: p.team,
      side: p.side,
      handicap: p.handicap,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as PlaceBetResult;
  if (!res.ok) {
    throw new Error(`PS3838 place bet -> HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

/** GET /v1/client/balance — used by the /solde command and pre-flight
 *  sanity checks (never bet more than the account actually holds). */
export async function getBalance(): Promise<{ availableBalance: number; currency: string }> {
  return request("/v1/client/balance");
}
