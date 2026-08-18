import { DEFAULT_ODDS_DROP_CONFIG, type OddsDropConfig } from "./detectors/oddsDrop";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./detectors/score";

/**
 * Every threshold the worker uses, in one place, overridable by env var
 * without a redeploy — spec section 6 explicitly asks for configurable
 * parameters over hardcoded numbers since no weighting is confirmed yet.
 */

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getOddsDropConfig(): OddsDropConfig {
  return {
    dropThresholdPercent: envFloat("ODDS_DROP_THRESHOLD_PERCENT", DEFAULT_ODDS_DROP_CONFIG.dropThresholdPercent),
    minPersistenceSec: envFloat("ODDS_DROP_MIN_PERSISTENCE_SEC", DEFAULT_ODDS_DROP_CONFIG.minPersistenceSec),
    correctionReboundPercent: envFloat(
      "ODDS_DROP_CORRECTION_REBOUND_PERCENT",
      DEFAULT_ODDS_DROP_CONFIG.correctionReboundPercent,
    ),
  };
}

export function getScoreWeights(): ScoreWeights {
  // Individual weight overrides can be added the same way as the odds-drop
  // config above once real signal outcomes justify recalibrating a specific
  // factor (spec section 15) — left as the compile-time default until then.
  return DEFAULT_SCORE_WEIGHTS;
}

export const WORKER_POLL_INTERVAL_MS = envFloat("WORKER_POLL_INTERVAL_MS", 30_000);

/**
 * Ingestion (hitting the real provider API) runs far less often than
 * detection (which just re-reads what's already in the DB) — API-Football's
 * free tier caps at 100 requests/day, so polling every WORKER_POLL_INTERVAL_MS
 * (30s) would exhaust the daily quota in minutes. Default: 20 minutes.
 */
export const INGEST_POLL_INTERVAL_MS = envFloat("INGEST_POLL_INTERVAL_MS", 20 * 60 * 1000);

/**
 * Countries the odds ingestion targets — deliberately NOT the major
 * commercial leagues (EPL, La Liga, etc.): those are the most scrutinized,
 * least likely markets for an undetected suspicious move (Noaim's explicit
 * call, 2026-08-18). Smaller, less-watched leagues and lower divisions are
 * where a real signal is more likely to be worth something. Comma-separated
 * country names must match API-Football's own country naming exactly
 * (verify via GET /leagues once a real key exists).
 */
export function getIngestTargetCountries(): string[] {
  const raw = process.env.API_FOOTBALL_TARGET_COUNTRIES ?? "India,Bolivia,Paraguay,Peru,Ecuador,Venezuela";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Mode observation (spec section 15): the engine must run collecting and
 * scoring signals WITHOUT sending paid alerts until explicitly turned on.
 * Defaults to false so a fresh deploy never accidentally goes live.
 */
export const SEND_LIVE_ALERTS = process.env.SEND_LIVE_ALERTS === "true";
