/**
 * Live "still scoreless" pick — pure function, same shape as the other
 * detectors. Inspired by InPlay Alerts' "Timer 6 / Over 0.5 HT all league"
 * format (Noaim, 2026-08-23): a plain, market-agnostic in-play angle that
 * needs only live score + elapsed minute, not the detailed shots/xG stats
 * that only exist for mainstream leagues (see momentum.ts). This is NOT a
 * fixing-detection signal — it's a generic statistical tip, deliberately
 * kept separate from the ODDS_DROP/VALUE_BET family, which is why it has
 * its own Signal type and its own simple confidence formula instead of
 * going through scoreSignal()'s ScoreFactors (those factors — amplitude,
 * multiBookAgreement, etc. — don't apply to "the game is still 0-0").
 */

export interface LiveScorelessInput {
  elapsedMinutes: number;
  homeGoals: number;
  awayGoals: number;
}

export interface LiveScorelessConfig {
  /** Minimum minute (within the first half) to flag a still-scoreless HT. */
  minMinuteHT: number;
  /** Minimum minute (within the second half) to flag a still-scoreless FT. */
  minMinuteFT: number;
}

export const DEFAULT_LIVE_SCORELESS_CONFIG: LiveScorelessConfig = {
  minMinuteHT: 35,
  minMinuteFT: 75,
};

export type LiveScorelessMarket = "OVER_0_5_HT" | "OVER_0_5_FT";

export type LiveScorelessOutcome =
  | { fires: true; market: LiveScorelessMarket; elapsedMinutes: number; confidence: number }
  | { fires: false; reason: "already_scored" | "too_early_ht" | "too_early_ft" | "half_break" };

/** Simple, deliberately modest confidence: starts at 0.55 at the trigger
 *  minute, climbs linearly with every extra minute still scoreless, caps at
 *  0.9 — never claims near-certainty for what's still a probabilistic bet. */
function confidenceFor(elapsedMinutes: number, triggerMinute: number, windowEnd: number): number {
  const progress = (elapsedMinutes - triggerMinute) / Math.max(1, windowEnd - triggerMinute);
  return Math.min(0.9, 0.55 + Math.max(0, progress) * 0.35);
}

export function detectLiveScorelessPick(
  input: LiveScorelessInput,
  config: LiveScorelessConfig = DEFAULT_LIVE_SCORELESS_CONFIG,
): LiveScorelessOutcome {
  if (input.homeGoals + input.awayGoals > 0) return { fires: false, reason: "already_scored" };

  if (input.elapsedMinutes <= 45) {
    if (input.elapsedMinutes < config.minMinuteHT) return { fires: false, reason: "too_early_ht" };
    return {
      fires: true,
      market: "OVER_0_5_HT",
      elapsedMinutes: input.elapsedMinutes,
      confidence: confidenceFor(input.elapsedMinutes, config.minMinuteHT, 45),
    };
  }

  if (input.elapsedMinutes < 46) return { fires: false, reason: "half_break" };
  if (input.elapsedMinutes < config.minMinuteFT) return { fires: false, reason: "too_early_ft" };
  return {
    fires: true,
    market: "OVER_0_5_FT",
    elapsedMinutes: input.elapsedMinutes,
    confidence: confidenceFor(input.elapsedMinutes, config.minMinuteFT, 90),
  };
}
