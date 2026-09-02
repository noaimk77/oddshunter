import { DEFAULT_ODDS_DROP_CONFIG, type OddsDropConfig } from "./detectors/oddsDrop";
import { DEFAULT_ODDS_RISE_CONFIG, type OddsRiseConfig } from "./detectors/oddsRise";
import { DEFAULT_VIG_EXPLOSION_CONFIG, type VigExplosionConfig } from "./detectors/vigExplosion";
import {
  DEFAULT_MULTI_BOOK_CONFIRMATION_CONFIG,
  type MultiBookConfirmationConfig,
} from "./detectors/multiBookConfirmation";
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from "./detectors/score";
import { DEFAULT_VALUE_BET_CONFIG, type ValueBetConfig } from "./detectors/valueBet";
import { DEFAULT_MOMENTUM_CONFIG, type MomentumConfig } from "./detectors/momentum";
import { DEFAULT_LIVE_SCORELESS_CONFIG, type LiveScorelessConfig } from "./detectors/liveScorelessPick";
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

/**
 * VALUE_BET — Pinnacle as the reference "sharp" price (present in
 * API-Football's bookmaker pool, confirmed 2026-08-22), 8% minimum edge
 * before it's even considered a candidate. The real "not too many" limit
 * is downstream: this only decides what counts as a candidate at all — how
 * many actually reach Telegram is still gated by getMinScoreToAlert(), the
 * same bar every other signal type clears.
 */
export function getValueBetConfig(): ValueBetConfig {
  return {
    referenceBookmaker: process.env.VALUE_BET_REFERENCE_BOOKMAKER ?? DEFAULT_VALUE_BET_CONFIG.referenceBookmaker,
    minEdgePercent: envFloat("VALUE_BET_MIN_EDGE_PERCENT", DEFAULT_VALUE_BET_CONFIG.minEdgePercent),
  };
}

export function getScoreWeights(): ScoreWeights {
  // Individual weight overrides can be added the same way as the odds-drop
  // config above once real signal outcomes justify recalibrating a specific
  // factor (spec section 15) — left as the compile-time default until then.
  return DEFAULT_SCORE_WEIGHTS;
}

/**
 * Detection-pass cadence — only feeds the legacy ODDS_DROP/RISE/etc
 * detectors, whose Telegram delivery has been off since the 2026-08-23 pivot
 * (SEND_LEGACY_DETECTOR_ALERTS). Slowed 30s -> 3min (2026-08-24, Neon->Prisma
 * Postgres migration): each tick runs a pg_advisory_lock query plus several
 * detector reads for zero delivered value while alerts stay off — pure
 * database-operation cost under Prisma Postgres's per-operation free-tier
 * quota (100k ops/month). Bump back down if legacy alerts are re-enabled and
 * responsiveness matters again.
 */
export const WORKER_POLL_INTERVAL_MS = envFloat("WORKER_POLL_INTERVAL_MS", 3 * 60 * 1000);

/**
 * Ingestion (hitting the real provider API) still runs less often than
 * detection (which just re-reads what's already in the DB), but the gap
 * shrank a lot after the Ultra plan upgrade (2026-08-22): 75,000 req/day
 * instead of the free tier's 100. Cost per tick is roughly `2 * N_leagues +
 * 10` API-Football requests (N_leagues = leagues resolved across the
 * target countries, unmeasured — see apiFootball.ts); at 2 minutes that's
 * 720 ticks/day, which stays comfortably under the daily budget
 * (API_FOOTBALL_DAILY_LIMIT, see apiFootball.ts) even at a pessimistic
 * N_leagues estimate. checkAndConsumeBudget() degrades gracefully (skips
 * the rest of a tick, logs a warning) if this estimate is ever wrong, so
 * there's no hard failure mode — just tune the interval or the budget if
 * logs show it maxing out before the day resets.
 */
/**
 * Slowed 2min -> 15min (2026-08-24, Neon->Prisma Postgres migration): this
 * feeds the pre-match fixing-detection pipeline (API-Football target
 * countries + BetExplorer), whose Telegram delivery is also off
 * (SEND_LEGACY_DETECTOR_ALERTS). The live product (strategies/strategyRunner.ts)
 * doesn't depend on this cadence at all — it fetches its own odds directly
 * per fixture. The real API-Football request budget is no longer the
 * binding constraint (Ultra plan, 75k/day) — Prisma Postgres's per-operation
 * free-tier quota (100k ops/month total, worker + web combined) is, so the
 * cadence is now tuned for that instead.
 */
export const INGEST_POLL_INTERVAL_MS = envFloat("INGEST_POLL_INTERVAL_MS", 15 * 60 * 1000);

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
 * League names to skip even within a target country — a country's actual
 * top flight gets real scrutiny too, defeating the point of targeting
 * obscure leagues in the first place (Noaim, 2026-08-22, flagging alerts
 * firing on "première division" matches as useless). Best-effort default
 * list, not authoritative — add to it via env var as more turn out to be
 * too well-watched to matter.
 */
export function getExcludedLeagueNames(): string[] {
  const raw = process.env.API_FOOTBALL_EXCLUDED_LEAGUES ?? "Indian Super League";
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

/**
 * Product-pivot flag (Noaim, 2026-08-23): after switching the bot from
 * "suspicious odds detection" to "InPlay-Alerts-style statistical value
 * bets", the old detectors (ODDS_DROP, MULTI_BOOK_CONFIRMATION, VALUE_BET,
 * etc.) stay in the codebase and keep writing Signal rows for analysis, but
 * their Telegram delivery is gated behind THIS flag — off by default so a
 * plain redeploy of the current worker stops firing the old-style noise
 * that "je ne peux pas vendre ça". The new strategy runner (strategyRunner.ts)
 * is delivered via SEND_LIVE_ALERTS as before.
 *
 * Deliberately separate from SEND_LIVE_ALERTS so re-enabling the old-style
 * feed later (e.g. for a VIP data channel) doesn't require re-enabling the
 * whole worker's outbound path.
 */
export const SEND_LEGACY_DETECTOR_ALERTS = process.env.SEND_LEGACY_DETECTOR_ALERTS === "true";

/**
 * OddsNotifier-lite product switch (Noaim, 2026-08-28 pivot back to
 * suspicious-games): master toggle for the new suspicious-alerts feed.
 * When true, legacy detectors' Signal rows are re-eligible for Telegram
 * delivery BUT only when the accompanying match passes the suspicious
 * league filter AND (if a live state provider is available) the price
 * move is NOT explained by a recent on-pitch event within the last 5
 * minutes. Distinct from SEND_LEGACY_DETECTOR_ALERTS so the old firehose
 * can never come back accidentally; delivery code checks both.
 */
export const SEND_SUSPICIOUS_ALERTS = process.env.SEND_SUSPICIOUS_ALERTS === "true";

/**
 * Minimum bonus-adjusted score (base score + suspicious league bonus) for
 * a signal to reach the suspicious feed. Deliberately higher than
 * getMinScoreToAlert() (35) because this feed is the paid product — the
 * bar for a paying user's Telegram is quality over volume.
 */
export function getSuspiciousMinScore(): number {
  return envFloat("SUSPICIOUS_MIN_SCORE", 55);
}

/**
 * When true, a signal is dropped if the fixture has a Sofascore-resolved
 * live state showing a goal / red card / penalty / VAR decision within the
 * last 5 minutes — the odds move almost certainly reflects the on-pitch
 * event, not sharp money. Keep on unless debugging why alerts aren't firing.
 */
export const SUSPICIOUS_FILTER_EXPLAINED_MOVES = process.env.SUSPICIOUS_FILTER_EXPLAINED_MOVES !== "false";

/**
 * Optional Telegram channel routing for the suspicious feed. When any of
 * these are set, alerts are ALSO posted to the corresponding channel (in
 * addition to individual paying users' direct chats):
 *  - TELEGRAM_SUSPICIOUS_ALERTS_CHAT_ID: primary alert stream
 *  - TELEGRAM_SUSPICIOUS_CLOSURES_CHAT_ID: MARKET_LOCK signals only
 *  - TELEGRAM_SUSPICIOUS_REPLAYS_CHAT_ID: settled signal outcomes
 */
export function getSuspiciousChannels(): { alerts?: string; closures?: string; replays?: string } {
  return {
    alerts: process.env.TELEGRAM_SUSPICIOUS_ALERTS_CHAT_ID || undefined,
    closures: process.env.TELEGRAM_SUSPICIOUS_CLOSURES_CHAT_ID || undefined,
    replays: process.env.TELEGRAM_SUSPICIOUS_REPLAYS_CHAT_ID || undefined,
  };
}

/**
 * Strategy engine cadence — how often runLiveTriggerPass/runHTResultPass
 * fire. Slowed 45s -> 5min (2026-08-24, Neon->Prisma Postgres migration):
 * runHTResultPass alone runs one unconditional `strategyPick.findMany()`
 * every tick regardless of whether there's anything to resolve — at 45s
 * that's ~1,920 DB operations/day (~57,600/month) just from existing, before
 * counting runLiveTriggerPass's per-live-fixture reads/writes on top. Prisma
 * Postgres's free tier caps at 100k operations/month total (worker + web
 * combined) — the 45s cadence alone would have consumed most of that budget
 * doing nothing. 5 minutes still checks each match's first half (~45min)
 * roughly 9 times, which is a real trade-off (less snappy triggering) but
 * keeps the feature actually running for a full month instead of exhausting
 * the database again within days. Revisit if upgrading to a paid DB tier.
 */
export const STRATEGY_POLL_INTERVAL_MS = envFloat("STRATEGY_POLL_INTERVAL_MS", 5 * 60 * 1000);

/**
 * Plausible-outcome odds range for price-move detection (Noaim, 2026-08-20):
 * a fixed match plays on a result that's still credible enough to bet on —
 * nobody fixes a match to move a 12.61 price, because too little real money
 * is riding on an outsider outcome for it to be worth manipulating. Below
 * ~1.20 the outcome is already near-certain (no room left to move), above
 * ~3.00 it's a longshot nobody stakes real money on. Selections whose
 * opening price falls outside this band are skipped entirely before
 * ODDS_DROP/ODDS_RISE even run — not just scored lower.
 */
export function getFixingOddsRange(): { min: number; max: number } {
  return {
    min: envFloat("FIXING_ODDS_MIN", 1.2),
    max: envFloat("FIXING_ODDS_MAX", 3.0),
  };
}

/**
 * Minimum score (0-100) a signal must reach before it's actually sent to
 * Telegram. Signals below this are still detected, scored, and stored (so
 * nothing is lost for later recalibration) — they're just not delivered as
 * a paid alert. Only meaningful now that DEFAULT_SCORE_WEIGHTS no longer
 * reserves 15% of the score for volume/liquidity data we don't have — with
 * the old weights, a threshold this high would have blocked almost every
 * signal, strong or weak, since none could reach it.
 */
/**
 * Tip consensus pipeline (distinct from the odds-movement engine above):
 * how many different source groups must post the same pick within the
 * time window before it's reposted to the VIP group. Noaim's call:
 * 2026-08-22 — 2 groups / 20 minutes (revised down from 4, then 3);
 * 2026-08-27 — 3 groups / 1440 minutes (24h), since real tipsters post the
 * same pick hours apart, not minutes, and 3 distinct channels is the bar
 * Noaim actually watches for ("trois fois sur trois canaux"). Railway vars
 * mirror these; the defaults here keep code and prod in sync.
 */
export function getTipConsensusConfig(): { minGroups: number; windowMinutes: number } {
  return {
    minGroups: envInt("TIP_CONSENSUS_MIN_GROUPS", 3),
    windowMinutes: envInt("TIP_CONSENSUS_WINDOW_MINUTES", 1440),
  };
}

/**
 * How long a chat's last-mentioned fixture stays eligible to resolve a
 * later context-free message ("W2", "Victoire de Cuba") in that same chat.
 * 60 minutes covers "image now, confirmation mid-match" without reaching
 * into an unrelated later fixture the same channel posts that day.
 */
export function getChatFixtureContextWindowMinutes(): number {
  return envInt("CHAT_FIXTURE_CONTEXT_WINDOW_MINUTES", 60);
}

/**
 * Same observation-mode pattern as SEND_LIVE_ALERTS: the tip listener always
 * parses and stores what it sees, but only reposts to the VIP group once
 * this is explicitly turned on — so a fresh deploy never blasts unverified
 * parsing straight to paying subscribers.
 */
export const SEND_TIP_CONSENSUS_ALERTS = process.env.SEND_TIP_CONSENSUS_ALERTS === "true";

/**
 * Guards against stale backlog. `ScrapedTip.detectedAt` was always our own
 * processing timestamp (`@default(now())`), never Telegram's — so when the
 * MTProto link drops (network blip, or the 512MB box getting OOM-killed —
 * confirmed happening 2026-08-31, exit_code=137) and Telegram's own
 * update-gap recovery delivers the messages that piled up while we were
 * disconnected, they got processed and alerted as if freshly live. Confirmed
 * incident 2026-08-30/31: worker silent for 2h33m (22:08→00:41, zero
 * messages across every one of 150+ joined chats — impossible under normal
 * traffic), then on reconnect a pre-match odds screenshot for a match that
 * kicked off ~10h earlier got alerted to the VIP group as a live consensus
 * pick. Comparing the message's OWN `date` (gramjs `message.date`, seconds
 * since epoch — Telegram's timestamp, not ours) against now and dropping
 * anything older than this catches that regardless of *why* it arrived
 * late (crash, reconnect, slow LLM call) — a narrower fix than chasing the
 * OOM cause itself. 30 min comfortably covers normal processing/LLM latency
 * while rejecting hours-old backlog.
 */
export function getMaxTipMessageAgeMinutes(): number {
  return envInt("TIP_MAX_MESSAGE_AGE_MINUTES", 30);
}

/**
 * LLM fallback for tip parsing — when the deterministic parser can't extract
 * a market/selection (typically bet-slip screenshots that show both cotes
 * side by side, with the actual pick indicated only visually), we hand the
 * OCR text + the raw image bytes to Claude and let it identify the pick.
 * Only fires when a fixture is already known (from this message or the
 * chat's remembered last-fixture), so it never runs blindly.
 */
export const TIP_LLM_FALLBACK_ENABLED = (process.env.TIP_LLM_FALLBACK_ENABLED ?? "true") === "true";
export function getTipLlmFallbackConfig(): { apiKey: string | null; model: string; workspaceId: string | null } {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY ?? null,
    model: process.env.TIP_LLM_FALLBACK_MODEL ?? "claude-haiku-4-5-20251001",
    workspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? null,
  };
}

/**
 * Outcome resolution (Signal → real result) — how long after kickoff to
 * wait before even checking (matches can run long: extra time, delays),
 * and how many fixtures to check per pass. Batched via `/fixtures?ids=`
 * (up to 20 per request, unlocked on the Ultra plan 2026-08-22) — 8 was a
 * per-request cap on the free tier's one-fixture-per-request loop; raised
 * to 40 (2 requests/pass) now that the bottleneck is gone, still bounded
 * so a huge backlog can't spend the whole daily budget in one pass.
 */
export function getOutcomeResolutionConfig(): { bufferMinutes: number; maxFixturesPerPass: number } {
  return {
    bufferMinutes: envInt("OUTCOME_RESOLUTION_BUFFER_MINUTES", 150),
    maxFixturesPerPass: envInt("OUTCOME_RESOLUTION_MAX_FIXTURES_PER_PASS", 40),
  };
}

/**
 * League IDs for the live-momentum "good tips" detector (momentum.ts) —
 * deliberately NOT the same list as getIngestTargetCountries() above: that
 * one targets obscure leagues on purpose (low scrutiny, for fixing
 * detection); this one needs the opposite; mainstream leagues, because
 * API-Football's detailed match statistics (shots, xG, possession) only
 * exist for them. Confirmed empirically 2026-08-23 via real API calls:
 * Premier League (39), La Liga (140), Ligue 1 (61), Serie A (135),
 * Eredivisie (88), and Champions League (2) all returned full stats;
 * Brazil's actual top flight (71) returned none, so "major league" alone
 * doesn't predict coverage — this list is what's been verified or is a
 * same-tier extension of a verified league (Bundesliga, Europa League,
 * Primeira Liga), not a guess at "big countries in general". A league
 * without real coverage just produces zero picks, never an error, so an
 * optimistic addition here is safe to try.
 */
export function getMomentumTargetLeagueIds(): number[] {
  const raw = process.env.MOMENTUM_TARGET_LEAGUE_IDS ?? "39,140,61,135,78,88,94,2,3";
  return raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

export function getMomentumConfig(): MomentumConfig {
  return {
    minXgGap: envFloat("MOMENTUM_MIN_XG_GAP", DEFAULT_MOMENTUM_CONFIG.minXgGap),
    minMinutesRemaining: envFloat("MOMENTUM_MIN_MINUTES_REMAINING", DEFAULT_MOMENTUM_CONFIG.minMinutesRemaining),
    minShotsOnGoalCombined: envFloat(
      "MOMENTUM_MIN_SHOTS_ON_GOAL_COMBINED",
      DEFAULT_MOMENTUM_CONFIG.minShotsOnGoalCombined,
    ),
    minXgForBttsSide: envFloat("MOMENTUM_MIN_XG_FOR_BTTS_SIDE", DEFAULT_MOMENTUM_CONFIG.minXgForBttsSide),
  };
}

/**
 * "Still scoreless" live-pick thresholds (Noaim, 2026-08-23 — the InPlay
 * Alerts-style feature, NOT fixing detection). Runs on the same target
 * leagues as the real detection pipeline (getIngestTargetCountries), so no
 * separate league list is needed here — see livePicks.ts.
 */
export function getLiveScorelessConfig(): LiveScorelessConfig {
  return {
    minMinuteHT: envFloat("LIVE_SCORELESS_MIN_MINUTE_HT", DEFAULT_LIVE_SCORELESS_CONFIG.minMinuteHT),
    minMinuteFT: envFloat("LIVE_SCORELESS_MIN_MINUTE_FT", DEFAULT_LIVE_SCORELESS_CONFIG.minMinuteFT),
  };
}

export function getMinScoreToAlert(): number {
  // Recalibrated 55 -> 35 (2026-08-20, confirmed with Noaim after audit):
  // a real-DB check found only 1 of 64 open signals ever cleared 55, and
  // the highest score ever recorded was 56 — with no volume/liquidity data
  // source, our current providers structurally can't produce many signals
  // above the 30s-40s range. 55 was blocking almost everything, not just
  // noise. 35 still filters the weakest below_threshold-adjacent signals
  // while letting real moves through — revisit once MULTI_BOOK_CONFIRMATION
  // gets more coverage (see betexplorer.ts detail-fetch threshold change).
  return envFloat("MIN_SCORE_TO_ALERT", 35);
}
