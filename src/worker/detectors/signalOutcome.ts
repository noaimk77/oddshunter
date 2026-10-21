/**
 * Resolves whether a signal's implied pick actually happened, given the
 * match's final (and, for HT markets, half-time) score. Pure function, same
 * shape as every other detector — the orchestration that fetches real
 * results and calls this lives in outcomeResolver.ts.
 *
 * Returns null (not false) for anything this can't interpret yet — a
 * missing half-time score, a push (draw on a Draw No Bet market voids the
 * bet, neither won nor lost), or a market type not covered — rather than
 * guessing. Covers every market type actually in production: "match_winner"
 * (1X2), "over_under_live" (any Over/Under line, full match or "(1st
 * Half)"), "dnb" (Draw No Bet), "double_chance", and "btts" — the last
 * three added 2026-08-22 alongside BetExplorer result resolution, matching
 * MARKET_META in betexplorer.ts.
 */

export interface MatchResult {
  fullTimeHomeGoals: number;
  fullTimeAwayGoals: number;
  halftimeHomeGoals: number | null;
  halftimeAwayGoals: number | null;
}

function parseHandicap(marketName: string): number | null {
  const match = marketName.match(/(-?\d+(?:\.\d+)?)\s*$/);
  return match ? Number.parseFloat(match[1]) : null;
}

export function resolveSelectionOutcome(
  marketType: string,
  marketName: string,
  selectionPosition: string,
  result: MatchResult,
): boolean | null {
  if (marketType === "match_winner") {
    const diff = result.fullTimeHomeGoals - result.fullTimeAwayGoals;
    if (selectionPosition === "home") return diff > 0;
    if (selectionPosition === "away") return diff < 0;
    if (selectionPosition === "draw") return diff === 0;
    return null;
  }

  if (marketType === "over_under_live") {
    const handicap = parseHandicap(marketName);
    if (handicap === null) return null;

    const isFirstHalf = marketName.includes("(1st Half)");
    const home = isFirstHalf ? result.halftimeHomeGoals : result.fullTimeHomeGoals;
    const away = isFirstHalf ? result.halftimeAwayGoals : result.fullTimeAwayGoals;
    if (home === null || away === null) return null;

    const isOver = home + away > handicap;
    if (selectionPosition === "over") return isOver;
    if (selectionPosition === "under") return !isOver;
    return null;
  }

  const diff = result.fullTimeHomeGoals - result.fullTimeAwayGoals;

  if (marketType === "dnb") {
    if (diff === 0) return null; // draw voids a Draw No Bet ticket — not a win or a loss
    if (selectionPosition === "home") return diff > 0;
    if (selectionPosition === "away") return diff < 0;
    return null;
  }

  if (marketType === "double_chance") {
    if (selectionPosition === "1x") return diff >= 0;
    if (selectionPosition === "12") return diff !== 0;
    if (selectionPosition === "x2") return diff <= 0;
    return null;
  }

  if (marketType === "btts") {
    const bothScored = result.fullTimeHomeGoals > 0 && result.fullTimeAwayGoals > 0;
    if (selectionPosition === "yes") return bothScored;
    if (selectionPosition === "no") return !bothScored;
    return null;
  }

  return null;
}
