import { DEFAULT_ODDS_DROP_CONFIG, type OddsDropConfig } from "./detectors/oddsDrop";
import { DEFAULT_ODDS_RISE_CONFIG, type OddsRiseConfig } from "./detectors/oddsRise";
import { DEFAULT_VIG_EXPLOSION_CONFIG, type VigExplosionConfig } from "./detectors/vigExplosion";
import {
  DEFAULT_MULTI_BOOK_CONFIRMATION_CONFIG,
  type MultiBookConfirmationConfig,
} from "./detectors/multiBookConfirmation";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./detectors/score";
import { DEFAULT_BETEXPLORER_CONFIG, type BetExplorerConfig } from "./providers/betexplorer";

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

export function getOddsRiseConfig(): OddsRiseConfig {
  return {
    riseThresholdPercent: envFloat("ODDS_RISE_THRESHOLD_PERCENT", DEFAULT_ODDS_RISE_CONFIG.riseThresholdPercent),
    minPersistenceSec: envFloat("ODDS_RISE_MIN_PERSISTENCE_SEC", DEFAULT_ODDS_RISE_CONFIG.minPersistenceSec),
    correctionReboundPercent: envFloat(
      "ODDS_RISE_CORRECTION_REBOUND_PERCENT",
      DEFAULT_ODDS_RISE_CONFIG.correctionReboundPercent,
    ),
  };
}

export function getVigExplosionConfig(): VigExplosionConfig {
  return {
    minIncreasePercentPoints: envFloat(
      "VIG_EXPLOSION_MIN_INCREASE_PP",
      DEFAULT_VIG_EXPLOSION_CONFIG.minIncreasePercentPoints,
    ),
  };
}

export function getMultiBookConfirmationConfig(): MultiBookConfirmationConfig {
  return {
    minConfirmingBookmakers: envInt(
      "MULTI_BOOK_MIN_CONFIRMING_BOOKMAKERS",
      DEFAULT_MULTI_BOOK_CONFIRMATION_CONFIG.minConfirmingBookmakers,
    ),
  };
}

/**
 * BetExplorer — free, no key. Opt-in via env only to allow disabling the
 * scraper (e.g. if betexplorer.com changes its markup) without a code
 * change. Defaults to enabled since it costs nothing to try.
 */
export const BETEXPLORER_ENABLED = process.env.BETEXPLORER_ENABLED !== "false";

export function getBetExplorerConfig(): BetExplorerConfig {
  return {
    maxDetailFetchesPerCycle: envInt(
      "BETEXPLORER_MAX_DETAIL_FETCHES_PER_CYCLE",
      DEFAULT_BETEXPLORER_CONFIG.maxDetailFetchesPerCycle,
    ),
    minRequestIntervalMs: envInt("BETEXPLORER_MIN_REQUEST_INTERVAL_MS", DEFAULT_BETEXPLORER_CONFIG.minRequestIntervalMs),
    minDropPercentForDetail: envFloat(
      "BETEXPLORER_MIN_DROP_PERCENT_FOR_DETAIL",
      DEFAULT_BETEXPLORER_CONFIG.minDropPercentForDetail,
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
