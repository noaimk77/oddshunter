import type { LiveStateProvider, NormalizedLiveState } from "./types";

/**
 * Sofascore — free, no key, no signup. Powers the match-state context that
 * lets the suspicious-alerts pipeline distinguish "line moved because a red
 * card just fell" (legit) from "line moved with no on-pitch cause" (the
 * signal we actually want). Without this, every genuine goal/card/injury
 * event fires a false-positive ODDS_DROP alert.
 *
 * Their web app calls api.sofascore.com/api/v1/* endpoints as unauthenticated
 * JSON. Rate limiting is aggressive on bursts but forgiving at a steady <1
 * req/sec — the worker's per-signal fetch pattern (one lookup per candidate
 * signal, not a full scan of all live matches) stays comfortably below that.
 *
 * Not registered in the ingest pipeline: this provider is queried on-demand
 * from inside the detection pass (given an external event id + team names),
 * not on a poll cycle. Downstream code resolves Sofascore's own match id
 * from the fixture team names via /search/all and caches the resolved id on
 * the Event row for subsequent state fetches — a one-time O(1) lookup per
 * event, not a per-tick cost.
 */

const API_BASE = "https://api.sofascore.com/api/v1";
const UA = "Mozilla/5.0 (compatible; oddshunter-worker/1.0)";
const REQUEST_TIMEOUT_MS = 8_000;

interface SofascoreEventPayload {
  event: {
    id: number;
    status: { code: number; description: string; type: string };
    homeScore: { current?: number; period1?: number; period2?: number };
    awayScore: { current?: number; period1?: number; period2?: number };
    time?: { currentPeriodStartTimestamp?: number; injuryTime1?: number; injuryTime2?: number };
    startTimestamp: number;
  };
}

interface SofascoreIncidentsPayload {
  incidents: {
    time: number;
    incidentType: string;
    incidentClass?: string;
    isHome?: boolean;
    text?: string;
  }[];
}

interface SofascoreStatsPayload {
  statistics: {
    period: string;
    groups: {
      groupName: string;
      statisticsItems: {
        name: string;
        home: string;
        away: string;
      }[];
    }[];
  }[];
}

interface SofascoreSearchPayload {
  results: {
    type: string;
    entity?: {
      id: number;
      homeTeam?: { name: string; slug: string };
      awayTeam?: { name: string; slug: string };
      startTimestamp?: number;
    };
  }[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status !== 404) {
        console.warn(`[sofascore] ${res.status} on ${url}`);
      }
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[sofascore] fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sofascore's status codes map to a period identifier we care about only to
 * derive a real "minute" number — the /event/{id} payload doesn't give the
 * clock directly, it gives the current period start timestamp and we compute
 * (now - start)/60. Undefined for pre-match or finished matches.
 */
function computeMinute(payload: SofascoreEventPayload): number | null {
  const startTs = payload.event.time?.currentPeriodStartTimestamp;
  if (!startTs) return null;
  const statusCode = payload.event.status.code;
  // 6 = 1st half, 7 = 2nd half, 8 = HT (paused), 60 = paused. Skip pre-match (0) and finished (100+).
  if (statusCode !== 6 && statusCode !== 7 && statusCode !== 8) return null;
  const elapsedSec = Math.floor(Date.now() / 1000) - startTs;
  const baseMinute = statusCode === 7 ? 45 : 0;
  return Math.max(0, Math.min(120, baseMinute + Math.floor(elapsedSec / 60)));
}

function mapIncidentType(sofascoreType: string, incidentClass?: string): string | null {
  switch (sofascoreType) {
    case "goal":
      return "goal";
    case "card":
      if (incidentClass === "red" || incidentClass === "yellowRed") return "red_card";
      return "yellow_card";
    case "injuryTime":
      return "injury_time";
    case "substitution":
      return null;
    case "penaltyShootout":
      return "penalty";
    case "varDecision":
      return "var";
    case "period":
      return null;
    default:
      return null;
  }
}

function parseStatNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStatPair(
  stats: SofascoreStatsPayload,
  statName: string,
): { home: number; away: number } | undefined {
  for (const period of stats.statistics) {
    if (period.period !== "ALL") continue;
    for (const group of period.groups) {
      for (const item of group.statisticsItems) {
        if (item.name.toLowerCase() === statName.toLowerCase()) {
          const home = parseStatNumber(item.home);
          const away = parseStatNumber(item.away);
          if (home != null && away != null) return { home, away };
        }
      }
    }
  }
  return undefined;
}

/**
 * Best-effort fixture-id resolution: search Sofascore for a fixture matching
 * both team names (case-insensitive substring). Returns the Sofascore event
 * id or null if no clean match — caller is expected to cache the resolved
 * id on the Event row and never re-search for the same fixture twice.
 */
export async function resolveSofascoreEventId(
  homeTeam: string,
  awayTeam: string,
): Promise<number | null> {
  const query = encodeURIComponent(`${homeTeam} ${awayTeam}`);
  const payload = await fetchJson<SofascoreSearchPayload>(`${API_BASE}/search/all?q=${query}`);
  if (!payload) return null;

  const homeLower = homeTeam.toLowerCase();
  const awayLower = awayTeam.toLowerCase();

  for (const result of payload.results) {
    if (result.type !== "event" || !result.entity) continue;
    const eventHome = result.entity.homeTeam?.name?.toLowerCase() ?? "";
    const eventAway = result.entity.awayTeam?.name?.toLowerCase() ?? "";
    const homeMatch = eventHome.includes(homeLower) || homeLower.includes(eventHome);
    const awayMatch = eventAway.includes(awayLower) || awayLower.includes(eventAway);
    if (homeMatch && awayMatch) return result.entity.id;
  }
  return null;
}

export function createSofascoreLiveStateProvider(): LiveStateProvider {
  return {
    name: "sofascore",
    isConfigured: () => true, // no credential required — always available
    async fetchLiveState(externalEventId: string): Promise<NormalizedLiveState | null> {
      const id = Number.parseInt(externalEventId, 10);
      if (!Number.isFinite(id)) return null;

      const [eventPayload, incidentsPayload, statsPayload] = await Promise.all([
        fetchJson<SofascoreEventPayload>(`${API_BASE}/event/${id}`),
        fetchJson<SofascoreIncidentsPayload>(`${API_BASE}/event/${id}/incidents`),
        fetchJson<SofascoreStatsPayload>(`${API_BASE}/event/${id}/statistics`),
      ]);

      if (!eventPayload) return null;

      const recentEvents = (incidentsPayload?.incidents ?? [])
        .map((inc) => {
          const type = mapIncidentType(inc.incidentType, inc.incidentClass);
          if (!type) return null;
          return {
            type,
            minute: inc.time ?? 0,
            team: (inc.isHome ? "home" : "away") as "home" | "away",
          };
        })
        .filter((x): x is { type: string; minute: number; team: "home" | "away" } => x !== null)
        .sort((a, b) => b.minute - a.minute);

      const state: NormalizedLiveState = {
        externalEventId,
        minute: computeMinute(eventPayload),
        homeScore: eventPayload.event.homeScore.current ?? 0,
        awayScore: eventPayload.event.awayScore.current ?? 0,
        recentEvents,
        timestamp: new Date(),
      };

      if (statsPayload) {
        const shots = extractStatPair(statsPayload, "Shots on target");
        if (shots) state.shotsOnTarget = shots;
        const xg = extractStatPair(statsPayload, "Expected goals");
        if (xg) state.xg = xg;
        const corners = extractStatPair(statsPayload, "Corner kicks");
        if (corners) state.corners = corners;
        const possession = extractStatPair(statsPayload, "Ball possession");
        if (possession) state.possessionPct = possession;
      }

      return state;
    },
  };
}

/**
 * Convenience for the detector layer: given a signal's fired-at timestamp
 * and a live state, was there a real on-pitch event in the last N minutes
 * that could plausibly explain the odds move? True = probably NOT
 * suspicious, filter out. Used to gate SEND_SUSPICIOUS_ALERTS output.
 */
export function hasRecentExplanatoryEvent(
  liveState: NormalizedLiveState,
  windowMinutes = 5,
): boolean {
  const currentMinute = liveState.minute ?? 0;
  return liveState.recentEvents.some((event) => {
    const withinWindow = currentMinute - event.minute <= windowMinutes && currentMinute - event.minute >= 0;
    if (!withinWindow) return false;
    return event.type === "goal" || event.type === "red_card" || event.type === "penalty" || event.type === "var";
  });
}
