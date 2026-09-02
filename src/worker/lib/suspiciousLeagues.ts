/**
 * Suspicious-leagues whitelist for the OddsNotifier-lite feed.
 *
 * Sourced verbatim from OddsNotifier Inplay guide 2026-08-28 — the leagues
 * their partner SuspiciousGame explicitly targets for fixed-match detection.
 * Weight (1..3) boosts the base signal score so a move in a monitored
 * league passes the alert threshold that a move in an unlisted league won't.
 *
 * Matched against incoming NormalizedOddsPoint.country + .competitionName
 * fuzzily (case-insensitive substring on both fields) because provider
 * names vary — API-Football calls it "Vietnam V.League 2" where BetExplorer
 * writes "Vietnam - V.League 2" and iSportsAPI has "Vietnam Second League".
 * The matcher tolerates all three without a hand-mapped alias table.
 */

export interface SuspiciousLeagueRule {
  country: string;
  /** Optional — when set, competitionName must contain one of these tokens
   *  (case-insensitive). Absent = whole country's football is monitored. */
  nameContains?: string[];
  /** Score multiplier bonus applied on match (added to base score, capped
   *  at 100 downstream). 3 = highest priority, 1 = mild boost. */
  weight: 1 | 2 | 3;
}

export const SUSPICIOUS_LEAGUES: SuspiciousLeagueRule[] = [
  { country: "Albania", nameContains: ["cup"], weight: 2 },
  { country: "Argentina", nameContains: ["primera b", "primera c", "primera d", "torneo federal", "division 3", "division 4"], weight: 3 },
  { country: "Armenia", weight: 2 },
  { country: "Austria", nameContains: ["2. liga", "regionalliga", "landesliga"], weight: 2 },
  { country: "Bangladesh", weight: 2 },
  { country: "Bolivia", weight: 3 },
  { country: "Brazil", nameContains: ["serie c", "serie d", "estadual"], weight: 2 },
  { country: "Bulgaria", nameContains: ["vtora", "second", "division 2"], weight: 2 },
  { country: "Cambodia", weight: 2 },
  { country: "Cameroon", weight: 1 },
  { country: "Colombia", weight: 1 },
  { country: "Costa Rica", nameContains: ["segunda", "division 2"], weight: 2 },
  { country: "Croatia", nameContains: ["druga", "treca", "u19", "cup"], weight: 3 },
  { country: "Cyprus", nameContains: ["cup", "second", "b division"], weight: 2 },
  { country: "Czech Republic", nameContains: ["fnl", "msfl", "cfl", "second", "cup"], weight: 2 },
  { country: "Ecuador", nameContains: ["serie b", "segunda"], weight: 2 },
  { country: "Europe", nameContains: ["club friendly", "club friendlies"], weight: 3 },
  { country: "International", nameContains: ["club friendly", "club friendlies"], weight: 3 },
  { country: "World", nameContains: ["club friendly", "club friendlies"], weight: 3 },
  { country: "Finland", nameContains: ["ykkonen", "kakkonen", "kolmonen"], weight: 2 },
  { country: "Georgia", weight: 2 },
  { country: "Greece", nameContains: ["super league 2", "gamma ethniki", "cup"], weight: 2 },
  { country: "Guatemala", weight: 2 },
  { country: "India", nameContains: ["i-league", "santosh", "second", "third"], weight: 3 },
  { country: "Indonesia", weight: 2 },
  { country: "Israel", nameContains: ["liga alef", "alef north", "alef south"], weight: 3 },
  { country: "Jamaica", nameContains: ["premier"], weight: 2 },
  { country: "Kazakhstan", weight: 2 },
  { country: "Kenya", weight: 1 },
  { country: "Kosovo", nameContains: ["cup"], weight: 2 },
  { country: "Laos", weight: 2 },
  { country: "Malaysia", weight: 3 },
  { country: "Malta", nameContains: ["challenge league", "division 2", "second"], weight: 2 },
  { country: "Mexico", nameContains: ["liga premier", "serie a", "division 3", "tercera"], weight: 2 },
  { country: "Mongolia", weight: 2 },
  { country: "Montenegro", nameContains: ["cup"], weight: 2 },
  { country: "Myanmar", weight: 2 },
  { country: "Burma", weight: 2 },
  { country: "Nicaragua", weight: 2 },
  { country: "Panama", weight: 2 },
  { country: "Paraguay", nameContains: ["reserva", "reserves"], weight: 2 },
  { country: "Peru", nameContains: ["liga 2", "segunda"], weight: 2 },
  { country: "Poland", nameContains: ["ii liga", "iii liga", "iv liga"], weight: 2 },
  { country: "Romania", nameContains: ["liga ii", "liga iii", "cup", "cupa"], weight: 2 },
  { country: "Russia", nameContains: ["pfl", "fnl", "second", "cup", "kubok"], weight: 2 },
  { country: "Slovakia", nameContains: ["3. liga", "tretia"], weight: 2 },
  { country: "Slovenia", nameContains: ["2. snl", "cup"], weight: 2 },
  { country: "Tanzania", weight: 2 },
  { country: "Thailand", nameContains: ["thai league 2", "thai league 3", "cup"], weight: 3 },
  { country: "Trinidad and Tobago", nameContains: ["premier"], weight: 2 },
  { country: "Tunisia", nameContains: ["ligue 2", "cup", "coupe"], weight: 2 },
  { country: "Turkey", nameContains: ["1. lig", "2. lig", "3. lig", "cup", "kupasi"], weight: 2 },
  { country: "Uganda", weight: 1 },
  { country: "Venezuela", nameContains: ["cup", "copa"], weight: 2 },
  { country: "Vietnam", nameContains: ["v.league 2", "second", "u19", "u21"], weight: 3 },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export interface SuspiciousLeagueMatch {
  matched: true;
  rule: SuspiciousLeagueRule;
  weight: 1 | 2 | 3;
}

export type SuspiciousLeagueResult = SuspiciousLeagueMatch | { matched: false };

/**
 * Returns match+weight when country/league combo appears in the whitelist,
 * else { matched: false }. Score boost is caller's responsibility — the
 * matcher itself is stateless and score-agnostic.
 */
export function matchSuspiciousLeague(country: string, competitionName: string): SuspiciousLeagueResult {
  const normCountry = normalize(country);
  const normLeague = normalize(competitionName);

  for (const rule of SUSPICIOUS_LEAGUES) {
    const normRuleCountry = normalize(rule.country);
    if (!normCountry.includes(normRuleCountry) && !normRuleCountry.includes(normCountry)) continue;

    if (!rule.nameContains) {
      return { matched: true, rule, weight: rule.weight };
    }

    const anyToken = rule.nameContains.some((token) => normLeague.includes(normalize(token)));
    if (anyToken) {
      return { matched: true, rule, weight: rule.weight };
    }
  }
  return { matched: false };
}

/**
 * Bonus points to add to a base signal score when the league is in the
 * suspicious list. Kept small (max +15) so it TIPS a borderline signal
 * over the alert threshold rather than dominating the score.
 */
export function suspiciousLeagueScoreBonus(match: SuspiciousLeagueResult): number {
  if (!match.matched) return 0;
  return match.weight * 5;
}
