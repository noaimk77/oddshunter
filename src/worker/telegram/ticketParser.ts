/**
 * Extracts the two signals needed to log a ticket independent of the
 * consensus pipeline: an odds value and (when the message states one) an
 * outcome. Deliberately narrow — a market line ("-9.5", "Over 2.5") looks
 * exactly like an odds value in isolation, so extractOdds only trusts a
 * number that's clearly labeled as odds or sits alone at the end of the
 * message, favoring a missed ticket over a market line miscounted as odds.
 */

const LABELED_ODDS_RE = /(?:c[oô]tes?|odds?|@)\s*[:\-]?\s*(\d{1,2}[.,]\d{1,3})\b/i;
/** A decimal odds value on its own trailing line, e.g. the "1.632" at the
 *  end of "San Alfonso - Deportivo Amambay 1.632". */
const TRAILING_ODDS_RE = /^(\d{1,2}[.,]\d{2,3})$/;

/**
 * Odds ONLY when the message explicitly labels a number as such
 * ("cote 1,85", "odds: 2.10", "@1.90"). No trailing-number / bare-line
 * guessing — that heuristic (fine for rough per-group ticket stats) was the
 * main source of the wrong "Cote au signalement" values the VIP alert kept
 * showing: it happily picked up a market line, a scoreline, or a random
 * price off a bookmaker menu. For a number we put in front of subscribers,
 * "no odds line" beats "a confident wrong one". Band [1.15, 15] drops the
 * obvious mis-reads (a "1,02" torn out of an odds board, a "23" that was a
 * minute).
 */
export function extractLabeledOdds(rawText: string): number | null {
  const labeled = rawText.match(LABELED_ODDS_RE);
  if (!labeled) return null;
  const value = Number.parseFloat(labeled[1].replace(",", "."));
  if (Number.isFinite(value) && value >= 1.15 && value <= 15) return value;
  return null;
}

export function extractOdds(rawText: string): number | null {
  const labeled = rawText.match(LABELED_ODDS_RE);
  if (labeled) {
    const value = Number.parseFloat(labeled[1].replace(",", "."));
    if (value >= 1.01 && value <= 50) return value;
  }

  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    // A line that's ONLY a decimal number (no other text) is very likely an
    // odds value rather than a market line, since market lines always carry
    // a label ("Handicap", "Over", a team name...) alongside the number.
    const words = line.split(/\s+/);
    const lastWord = words[words.length - 1];
    const trailingMatch = lastWord.match(TRAILING_ODDS_RE);
    if (trailingMatch && words.length <= 6) {
      const value = Number.parseFloat(trailingMatch[1].replace(",", "."));
      if (value >= 1.01 && value <= 50) return value;
    }
  }

  return null;
}

const WON_RE = /(✅|✔️|🟢|\bwon\b|\bgagne\b|\bgagné\b|\bcash(?:ed)?\b)/i;
const LOST_RE = /(❌|🔴|\blost\b|\bperdu\b)/i;

export function extractResult(rawText: string): "WON" | "LOST" | "PENDING" {
  const won = WON_RE.test(rawText);
  const lost = LOST_RE.test(rawText);
  if (won && !lost) return "WON";
  if (lost && !won) return "LOST";
  return "PENDING";
}
