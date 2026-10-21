/**
 * Live-momentum pick detector — a different product than the rest of this
 * detector family: those all score SUSPICION (is this move fishy?); this
 * one scores CONFIDENCE in a legitimate in-play pick (will another goal
 * plausibly arrive?), inspired by commercial "good tips" bots (InPlayGuru
 * and friends — see Noaim's screenshots, 2026-08-23). Deliberately NOT
 * routed through the shared `scoreSignal`/`ScoreFactors` engine in score.ts:
 * that engine's factors (amplitude of a price MOVE, "explainability" that
 * LOWERS suspicion when a move matches game state) are shaped around price
 * anomalies and would produce nonsensical reasons text here — a legitimate
 * pick being "explained by the match state" is the entire point, not
 * something to subtract for.
 *
 * The core idea: expected goals (xG) already earned by both teams, compared
 * against the actual score — a large gap means the match has been more
 * dangerous than the scoreline shows, i.e. a goal is statistically
 * "overdue". Corroborated by raw shot volume so a single fluky high-xG shot
 * doesn't fire alone. Confirmed empirically (2026-08-23): API-Football only
 * returns detailed match statistics (shots, xG, possession, corners) for a
 * handful of leagues — see getMomentumTargetLeagueIds() in config.ts — NOT
 * the obscure leagues the fixing-detection engine targets. This detector
 * necessarily runs on a different, more mainstream set of competitions.
 */

export interface TeamMatchStats {
  shotsOnGoal: number;
  totalShots: number;
  cornerKicks: number;
  possessionPct: number;
  /** 0 when API-Football didn't return an xG figure for this match. */
  expectedGoals: number;
  goals: number;
}

export interface MomentumInput {
  elapsedMinutes: number;
  home: TeamMatchStats;
  away: TeamMatchStats;
}

export interface MomentumConfig {
  /** Combined xG minus combined actual goals — how "overdue" a goal is. */
  minXgGap: number;
  minMinutesRemaining: number;
  minShotsOnGoalCombined: number;
  /** xG threshold for the specific scoreless side, for the BTTS variant. */
  minXgForBttsSide: number;
}

export const DEFAULT_MOMENTUM_CONFIG: MomentumConfig = {
  minXgGap: 1.0,
  minMinutesRemaining: 15,
  minShotsOnGoalCombined: 6,
  minXgForBttsSide: 0.8,
};

export interface MomentumReason {
  label: string;
  contribution: number;
}

interface MomentumFireBase {
  fires: true;
  confidence: number;
  reasons: MomentumReason[];
  combinedXg: number;
  actualGoals: number;
  minutesRemaining: number;
  homeStats: TeamMatchStats;
  awayStats: TeamMatchStats;
}

export type MomentumOutcome =
  | (MomentumFireBase & { market: "OVER"; line: number })
  | (MomentumFireBase & { market: "BTTS"; scorelessTeam: "home" | "away" })
  | { fires: false; reason: string };

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Shared across both pick variants: how strong is the underlying pressure. */
function buildReasons(xgGapOrSideXg: number, shotsOnGoalCombined: number, minutesRemaining: number): MomentumReason[] {
  return [
    { label: "écart entre xG cumulé et buts réels", contribution: clamp01(xgGapOrSideXg / 2) * 0.5 },
    { label: "pression offensive (tirs cadrés)", contribution: clamp01(shotsOnGoalCombined / 12) * 0.3 },
    { label: "temps restant suffisant pour concrétiser", contribution: clamp01(minutesRemaining / 45) * 0.2 },
  ];
}

export function detectMomentumPick(
  input: MomentumInput,
  config: MomentumConfig = DEFAULT_MOMENTUM_CONFIG,
): MomentumOutcome {
  const minutesRemaining = 90 - input.elapsedMinutes;
  if (minutesRemaining < config.minMinutesRemaining) {
    return { fires: false, reason: "not_enough_time_remaining" };
  }

  const actualGoals = input.home.goals + input.away.goals;
  const combinedXg = input.home.expectedGoals + input.away.expectedGoals;
  const xgGap = combinedXg - actualGoals;
  const shotsOnGoalCombined = input.home.shotsOnGoal + input.away.shotsOnGoal;

  if (xgGap >= config.minXgGap && shotsOnGoalCombined >= config.minShotsOnGoalCombined) {
    const reasons = buildReasons(xgGap, shotsOnGoalCombined, minutesRemaining);
    const confidence = reasons.reduce((sum, r) => sum + r.contribution, 0);
    return {
      fires: true,
      market: "OVER",
      line: actualGoals + 0.5,
      confidence,
      reasons,
      combinedXg,
      actualGoals,
      minutesRemaining,
      homeStats: input.home,
      awayStats: input.away,
    };
  }

  // BTTS variant: exactly one side is still scoreless but pressing hard.
  const homeScoreless = input.home.goals === 0;
  const awayScoreless = input.away.goals === 0;
  if (homeScoreless !== awayScoreless) {
    const scorelessTeam: "home" | "away" = homeScoreless ? "home" : "away";
    const scorelessStats = homeScoreless ? input.home : input.away;
    if (scorelessStats.expectedGoals >= config.minXgForBttsSide && scorelessStats.shotsOnGoal >= 2) {
      const reasons = buildReasons(scorelessStats.expectedGoals, shotsOnGoalCombined, minutesRemaining);
      const confidence = reasons.reduce((sum, r) => sum + r.contribution, 0);
      return {
        fires: true,
        market: "BTTS",
        scorelessTeam,
        confidence,
        reasons,
        combinedXg,
        actualGoals,
        minutesRemaining,
        homeStats: input.home,
        awayStats: input.away,
      };
    }
  }

  return { fires: false, reason: "insufficient_pressure" };
}
