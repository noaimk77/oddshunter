import type { ParsedTip } from "./tipParser";
import { slugTeam } from "./tipParser";

/**
 * Rendered VIP alert. Kept in one place so `sendConsensusAlert` (worker
 * runtime) and the tests share the exact same pipeline: sanitize the raw
 * team names first, translate the market/selection codes to French, then
 * assemble the message. The gate `shouldSendConsensusAlert` runs BEFORE
 * this pipeline so obviously broken picks never reach the VIP group even
 * if two chats posted them.
 */

const NAME_JUNK_CHARS_RE = /[©®™•·]/g;
const NAME_LEADING_SEPARATOR_RE = /^[\s&|,;:@#*+/\\.\-–—]+/;
const NAME_TRAILING_SEPARATOR_RE = /[\s&|,;:@#*+/\\.\-–—]+$/;

/**
 * Cleans display-only cruft that OCR/copy-paste leaves in team names —
 * copyright/trademark glyphs, a stray "&" the parser kept because it sat
 * between team words, quote marks, a single leading punctuation char.
 * Never touches the fingerprint / consensus logic (those use slugTeam).
 * Only visual polish for the message the user actually reads.
 */
export function sanitizeTeamName(raw: string): string {
  if (!raw) return raw;
  let out = raw.replace(NAME_JUNK_CHARS_RE, " ");
  out = out.replace(/["'`"«»]/g, "");
  out = out.replace(/\s+/g, " ");
  out = out.replace(NAME_LEADING_SEPARATOR_RE, "");
  out = out.replace(NAME_TRAILING_SEPARATOR_RE, "");
  return out.trim();
}

/**
 * Team-slug tokens that are actually meta / marketing labels the parser
 * mistakenly took as a team name (real cases from prod: "Only Asian
 * Bookmakers vs Maximum Value!", "Dail vs free bets in public channel",
 * "🐼 PANDA vs Odds drop"). A fixture where either side matches one of
 * these was never a real match and must never trigger an alert.
 */
const META_TEAM_SLUGS = new Set([
  "freebetsinpublicchannel", "freebets", "onlyasianbookmakers", "maximumvalue",
  "oddsdrop", "oddsdropping", "panda", "populaires", "populairest",
  "touslesmarchesme", "touslesmarches", "spokoinonamomentsignala",
  "fonbetpinnakl", "fpon", "hopactpaha", "gaming", "sample", "test",
  "tempsecoule", "tempsecoulebodoglimt",
  // English caption/menu fragments the parser sometimes rips out of a
  // bet-slip screenshot's UI chrome and treats as fixture sides. Real
  // cases 2026-09-02: "Main Same Game Multi vs Goals Asic", "LEAGUE OF
  // LEGENDS vs LCK > MONEY LINE HANDICAP OVER UNDER".
  "mainsamegamemulti", "samegamemulti", "goalsasic",
  "leagueoflegends", "lckmoneylinehandicapoverunder",
  "moneylinehandicapoverunder", "moneyline",
]);

/**
 * Russian narrative words that survive Cyrillic→Latin transliteration
 * (see tipParser.ts). If a "team name" contains one of these it's almost
 * always a phrase the parser tore out of a tipster's commentary text, not
 * a real fixture side. Real case 2026-09-02: "Для них гол этой команде"
 * ("For them scoring a goal is already an achievement") was posted as if
 * it were a home-team name. Applied word-by-word AFTER transliteration so
 * a Cyrillic-only channel's tips are still checked.
 */
const RUSSIAN_NARRATIVE_TOKENS = new Set([
  "dlya", "nih", "etoi", "eto", "etomu", "etim", "etoy",
  "uzhe", "gol", "gola", "goly", "golov", "golu",
  "komande", "komandy", "komandu", "komanda",
  "matcha", "matchu", "protiv", "vzyat", "budet",
  "dostizhenie", "moya", "logika", "cha", "zapas",
  "znachit", "znachitel", "znachitelnyi", "shto", "chto",
]);

function transliterateForCheck(s: string): string {
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"i",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  let out = "";
  for (const ch of s.toLowerCase()) out += ch in map ? map[ch] : ch;
  return out;
}

const NON_TEAM_WORD_TOKENS = new Set([
  "vip", "premium", "channel", "public", "private", "bookmakers", "bookmaker",
  "value", "signal", "signals", "prono", "pronostic", "tip", "tips",
]);

/** How many raw digits a token contains once its punctuation is dropped —
 *  used to reject over/under selections like OVER_18 where the parser
 *  captured "18" as a 2-digit line (OCR dropped the "." in "1.8"). */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/**
 * Whether this pick is credible enough to be posted to the VIP group. Runs
 * BEFORE the message is formatted — a rejection here means no alert, not a
 * blank/broken alert. Cases blocked (all seen in prod today):
 *   - Team name reads as marketing/label copy, not a real fixture
 *   - Selection is a bare number with no decimal (OCR mangled "1.8" → "18")
 *   - Handicap is aberrantly large (|N| >= 20)
 *   - Team names still contain OCR junk after sanitize (e.g. leftover "vs")
 * A "silent drop" here is far better than posting nonsense — the user
 * reads a nonsense alert as reason to trust the whole feed less.
 */
export function shouldSendConsensusAlert(
  tip: Pick<ParsedTip, "homeTeam" | "awayTeam" | "market" | "selection">,
): { ok: true } | { ok: false; reason: string } {
  const home = sanitizeTeamName(tip.homeTeam ?? "");
  const away = sanitizeTeamName(tip.awayTeam ?? "");

  if (home.length < 2 || away.length < 2) return { ok: false, reason: "team name too short after sanitize" };

  const homeSlug = slugTeam(home);
  const awaySlug = slugTeam(away);

  if (META_TEAM_SLUGS.has(homeSlug) || META_TEAM_SLUGS.has(awaySlug)) {
    return { ok: false, reason: `team slug is a known meta label (${META_TEAM_SLUGS.has(homeSlug) ? homeSlug : awaySlug})` };
  }

  // Narrative-text rejection: the parser occasionally tears a phrase out
  // of a tipster's commentary (real case 2026-09-02: "Для них гол этой
  // команде vs уже достижение", pulled from a paragraph explaining the
  // pick's rationale — meant nothing as a fixture). Two signals:
  //  - word count: real team names are 1-4 tokens; a 5+ word "team" is
  //    almost always a torn-out phrase.
  //  - Russian grammar words after transliteration: dlya/nih/etoi/uzhe/
  //    komande/gol/… are not team names in any league. See
  //    RUSSIAN_NARRATIVE_TOKENS above.
  for (const raw of [tip.homeTeam, tip.awayTeam]) {
    if (!raw) continue;
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length > 4) {
      return { ok: false, reason: `team name has ${words.length} words — reads as narrative text, not a fixture side (${raw})` };
    }
    const translit = transliterateForCheck(raw)
      .replace(/[^a-z\s]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    for (const w of translit) {
      if (RUSSIAN_NARRATIVE_TOKENS.has(w)) {
        return { ok: false, reason: `team name contains Russian narrative token "${w}" — not a real team name (${raw})` };
      }
    }
  }

  // A team name whose slug boils down to only marketing words is almost
  // always a caption/CTA the parser accidentally took as a fixture side.
  const homeIsMeta = homeSlug.length > 0 && homeSlug.split(/(?=[A-Z])/).every(() => false) &&
    Array.from(homeSlug.matchAll(/[a-z]+/g)).every((m) => NON_TEAM_WORD_TOKENS.has(m[0]));
  const awayIsMeta = awaySlug.length > 0 && awaySlug.split(/(?=[A-Z])/).every(() => false) &&
    Array.from(awaySlug.matchAll(/[a-z]+/g)).every((m) => NON_TEAM_WORD_TOKENS.has(m[0]));
  if (homeIsMeta || awayIsMeta) return { ok: false, reason: "team name reads as meta label only" };

  if (tip.market === "OVER_UNDER") {
    // Two shapes to reject: (a) the raw number is >= 15 (nobody bets on
    // that many goals — a 2-digit line means the decimal got eaten by OCR
    // ["Over 1.8" → "18"]); (b) a bare 2-digit number with no underscore
    // where prod format is "OVER_1_8" not "OVER_18".
    const bareNumber = tip.selection.replace(/^(?:OVER|UNDER)_/, "");
    if (!bareNumber.includes("_") && digitCount(bareNumber) >= 2) {
      const n = Number.parseFloat(bareNumber);
      if (Number.isFinite(n) && n >= 15) {
        return { ok: false, reason: `over/under line ${n} is implausible (OCR likely dropped a decimal)` };
      }
      if (!bareNumber.includes(".")) {
        return { ok: false, reason: `over/under selection has no decimal separator (${tip.selection}) — likely OCR-broken` };
      }
    }
    // Real-world Over/Under lines only exist at .0 (integer), .25, .5, .75.
    // A selection like OVER_1_4 means the parser saw a stray "1.4" that was
    // actually the odds of another line ("Over 1.43"), not a line at all
    // (real case 2026-09-02: Sporting Liesti vs Dinamo Bucuresti). Any
    // fractional part outside {25, 5, 75} is not a real market — reject.
    const m = tip.selection.match(/^(?:OVER|UNDER)_(\d+)(?:_(\d+))?$/);
    if (m && m[2]) {
      const frac = m[2];
      if (frac !== "5" && frac !== "25" && frac !== "75") {
        return { ok: false, reason: `over/under line has non-standard fraction (${tip.selection}) — real lines are only .0/.25/.5/.75` };
      }
    }
  }

  // Handicap must carry a team side (parser format `HOME_-1.5` /
  // `AWAY_+2.5` since 2026-09-02); a bare "-1.5" is ambiguous and gets
  // dropped. Also reject aberrant magnitudes (|N| >= 30 = OCR broke
  // something, real handicaps go to about -20 for basketball at most).
  if (tip.market === "HANDICAP") {
    const withSide = tip.selection.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
    if (!withSide) {
      return { ok: false, reason: `handicap "${tip.selection}" has no team side identified — parser needs "Handicap: 1/2 ±X.X" or "MARKET: TeamName ±X.X"` };
    }
    const n = Number.parseFloat(withSide[2]);
    if (Math.abs(n) >= 30) return { ok: false, reason: `handicap ${n} is implausible (OCR likely broke)` };
  }

  return { ok: true };
}

/**
 * Sport inferred from the pick shape — the ParsedTip has no explicit sport
 * field (source channels don't tell us reliably), so this is a heuristic
 * driven by the numeric line: a football over/under maxes out around 7-8
 * goals, so anything ≥ 15 is basketball points, not goals. Confirmed real
 * miss 2026-09-02 00:53 local: alert for "Capiata Bulls vs Deportivo San
 * Jose — OVER_162_5" rendered as "Plus de 162,5 buts ⚽" — obvious basket
 * game read as football. Same reasoning for a large handicap (|N| ≥ 15
 * only makes sense as basket points).
 *
 * Markets with no numeric line (1X2, DOUBLE_CHANCE) stay "unknown" — we
 * can't tell foot from tennis on a 1X2 alone, and lying with a confident
 * emoji is worse than a neutral one.
 */
export type Sport = "football" | "basketball" | "unknown";

const SPORT_EMOJI: Record<Sport, string> = {
  football: "⚽",
  basketball: "🏀",
  unknown: "🏆",
};

const SPORT_TOTAL_UNIT: Record<Sport, string> = {
  football: "buts",
  basketball: "points",
  unknown: "points", // neutral fallback — never used except by pre-existing tests
};

export function inferSport(tip: Pick<ParsedTip, "market" | "selection">): Sport {
  if (tip.market === "OVER_UNDER") {
    const raw = tip.selection.replace(/^(?:OVER|UNDER)_/, "").replace(/_/g, ".");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n >= 15 ? "basketball" : "football";
    return "unknown";
  }
  if (tip.market === "HANDICAP") {
    const numMatch = tip.selection.match(/([+-]?\d+(?:\.\d+)?)/);
    if (numMatch) {
      const n = Number.parseFloat(numMatch[1]);
      if (Number.isFinite(n)) return Math.abs(n) >= 15 ? "basketball" : "football";
    }
    return "unknown";
  }
  // BTTS only exists as a football market (both teams score a goal).
  if (tip.market === "BTTS") return "football";
  // 1X2 / DOUBLE_CHANCE can be any sport — don't guess.
  return "unknown";
}

/** Human-readable French for an over/under selection code (OVER_2_5 → "Plus
 *  de 2,5 buts", or "Plus de 162,5 points" for basketball). Returns null
 *  when the code doesn't parse, so the caller can fall back rather than
 *  showing gibberish. */
function formatOverUnder(selection: string, sport: Sport): string | null {
  const match = selection.match(/^(OVER|UNDER)_(\d+(?:_\d+)?)$/);
  if (!match) return null;
  const [, dir, rawLine] = match;
  const line = rawLine.replace(/_/g, ",");
  const label = dir === "OVER" ? "Plus de" : "Moins de";
  return `${label} ${line} ${SPORT_TOTAL_UNIT[sport]}`;
}

/** French label for a market+selection pair, or a graceful fallback when
 *  the codes are shapes we didn't anticipate (rather than throwing). */
export function formatMarketSelection(tip: Pick<ParsedTip, "homeTeam" | "awayTeam" | "market" | "selection">): string {
  const home = sanitizeTeamName(tip.homeTeam ?? "");
  const away = sanitizeTeamName(tip.awayTeam ?? "");
  const sport = inferSport(tip);

  switch (tip.market) {
    case "OVER_UNDER": {
      const fr = formatOverUnder(tip.selection, sport);
      if (fr) return fr;
      return `Total : ${tip.selection}`;
    }
    case "1X2": {
      if (tip.selection === "DRAW") return "Match nul";
      const homeSlug = slugTeam(home);
      const awaySlug = slugTeam(away);
      if (tip.selection === homeSlug) return `Victoire ${home}`;
      if (tip.selection === awaySlug) return `Victoire ${away}`;
      return `Vainqueur : ${tip.selection}`;
    }
    case "DOUBLE_CHANCE":
      if (tip.selection === "1X") return `Double chance : ${home} ou match nul`;
      if (tip.selection === "X2") return `Double chance : match nul ou ${away}`;
      if (tip.selection === "12") return `Double chance : ${home} ou ${away}`;
      return `Double chance : ${tip.selection}`;
    case "BTTS":
      if (tip.selection === "YES") return "Les deux équipes marquent : oui";
      if (tip.selection === "NO") return "Les deux équipes marquent : non";
      return `BTTS : ${tip.selection}`;
    case "HANDICAP": {
      // New format `HOME_-1.5` / `AWAY_+2.5` — render as "Handicap TeamName ±X,Y".
      const withSide = tip.selection.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
      if (withSide) {
        const team = withSide[1] === "HOME" ? home : away;
        const n = Number.parseFloat(withSide[2]);
        if (Number.isFinite(n)) {
          const sign = n > 0 ? "+" : "";
          const value = String(n).replace(".", ",");
          return `Handicap ${team} ${sign}${value}`;
        }
      }
      // Legacy bare-number format (should be filtered out by the gate, but
      // render it correctly if ever it slips through).
      const n = Number.parseFloat(tip.selection);
      if (!Number.isFinite(n)) return `Handicap ${tip.selection}`;
      const sign = n > 0 ? "+" : "";
      const value = String(n).replace(".", ",");
      return `Handicap ${sign}${value}`;
    }
    default:
      return `${tip.market} — ${tip.selection}`;
  }
}

/** The final message posted to the VIP group. Human-readable French, one
 *  clear line per piece of information — the format the user asked for
 *  (2026-09-02) after receiving raw-code alerts like "OVER_UNDER —
 *  OVER_2_5" that read as gibberish. The sport emoji on the Match line
 *  adapts to what the pick actually reads as (football / basketball /
 *  unknown) — a football emoji on a 162,5-points basketball pick reads as
 *  a bug and undermines trust in the whole feed. */
export function formatConsensusMessage(
  tip: ParsedTip & { groupCount: number; oddsAtAlert?: number | null },
): string {
  const home = sanitizeTeamName(tip.homeTeam);
  const away = sanitizeTeamName(tip.awayTeam);
  const sport = inferSport(tip);
  const pick = formatMarketSelection(tip);

  const lines = [
    "🎯 Consensus détecté",
    "",
    `${SPORT_EMOJI[sport]} Match : ${home} vs ${away}`,
    `📊 Pronostic : ${pick}`,
  ];
  if (tip.oddsAtAlert && Number.isFinite(tip.oddsAtAlert) && tip.oddsAtAlert >= 1.15 && tip.oddsAtAlert <= 15) {
    // French decimal comma, two decimals — matches how the tipster
    // channels themselves post odds ("cote 1,85"), not "1.85". A value
    // outside [1.15, 15] is almost always the parser picking up an odds
    // value from a market menu row rather than the actual pick's price
    // (real case 2026-09-02: cote "1,02" surfaced from a Sporting Liesti
    // odds board where the real pick was elsewhere on the screen). Skip
    // rendering rather than displaying a misleading number.
    lines.push(`💰 Cote au signalement : ${tip.oddsAtAlert.toFixed(2).replace(".", ",")}`);
  }
  lines.push(`👥 Signalé par : ${tip.groupCount} groupes différents`);
  lines.push("");
  lines.push(
    "⚠️ Agrégation automatique de pronostics venus d'ailleurs — pas un signal Odds Hunter, à vérifier avant de miser.",
  );
  return lines.join("\n");
}

/**
 * Follow-up posted as a reply to the original alert once the match ends.
 * Kept as a single short line — the reader already has the pick above; here
 * they need the verdict and the final score, nothing else.
 *
 * `outcome`: "WON" (pick hit), "LOST" (didn't), "VOID" (push/refund, e.g.
 * exact-line over on the exact goal total).
 */
export function formatConsensusOutcomeMessage(args: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  outcome: "WON" | "LOST" | "VOID";
  oddsAtAlert?: number | null;
}): string {
  const home = sanitizeTeamName(args.homeTeam);
  const away = sanitizeTeamName(args.awayTeam);
  const scoreLine = `${home} ${args.homeScore}-${args.awayScore} ${away}`;
  const label =
    args.outcome === "WON"
      ? "✅ Passé"
      : args.outcome === "LOST"
        ? "❌ Perdu"
        : "⚪ Remboursé (push)";
  const parts = [`${label} — ${scoreLine}`];
  if (args.oddsAtAlert && Number.isFinite(args.oddsAtAlert) && args.oddsAtAlert >= 1.15 && args.oddsAtAlert <= 15) {
    parts.push(`Cote au signalement : ${args.oddsAtAlert.toFixed(2).replace(".", ",")}`);
  }
  return parts.join("\n");
}

/**
 * Grade a consensus pick against the final score. Returns null for markets
 * where we can't tell (handicap without a stated team side, unknown market
 * shape) — the resolver leaves those "UNRESOLVED" rather than guessing.
 */
export function evaluateConsensusOutcome(
  market: string,
  selection: string,
  fixture: { homeTeam: string; awayTeam: string },
  score: { homeScore: number; awayScore: number },
): "WON" | "LOST" | "VOID" | null {
  const diff = score.homeScore - score.awayScore;
  const total = score.homeScore + score.awayScore;
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);

  if (market === "OVER_UNDER") {
    const m = selection.match(/^(OVER|UNDER)_(\d+(?:_\d+)?)$/);
    if (!m) return null;
    const dir = m[1];
    const line = Number.parseFloat(m[2].replace(/_/g, "."));
    if (!Number.isFinite(line)) return null;
    if (total === line) return "VOID"; // push
    const isOver = total > line;
    return (dir === "OVER" ? isOver : !isOver) ? "WON" : "LOST";
  }
  if (market === "1X2") {
    if (selection === "DRAW") return diff === 0 ? "WON" : "LOST";
    if (selection === homeSlug) return diff > 0 ? "WON" : "LOST";
    if (selection === awaySlug) return diff < 0 ? "WON" : "LOST";
    return null;
  }
  if (market === "DOUBLE_CHANCE") {
    if (selection === "1X") return diff >= 0 ? "WON" : "LOST";
    if (selection === "X2") return diff <= 0 ? "WON" : "LOST";
    if (selection === "12") return diff !== 0 ? "WON" : "LOST";
    return null;
  }
  if (market === "BTTS") {
    const both = score.homeScore > 0 && score.awayScore > 0;
    if (selection === "YES") return both ? "WON" : "LOST";
    if (selection === "NO") return !both ? "WON" : "LOST";
    return null;
  }
  if (market === "HANDICAP") {
    // Since 2026-09-02 the parser records the team side as `HOME_<n>` /
    // `AWAY_<n>`. Adjusted score for the backed side: sideScore + n. Wins
    // if > other side, pushes if exactly equal, loses otherwise. A legacy
    // bare-number selection (no side) stays ungradeable → null.
    const m = selection.match(/^(HOME|AWAY)_([+-]?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const n = Number.parseFloat(m[2]);
    if (!Number.isFinite(n)) return null;
    const sideScore = m[1] === "HOME" ? score.homeScore : score.awayScore;
    const otherScore = m[1] === "HOME" ? score.awayScore : score.homeScore;
    const adjusted = sideScore + n;
    if (adjusted > otherScore) return "WON";
    if (adjusted < otherScore) return "LOST";
    return "VOID";
  }
  return null;
}
