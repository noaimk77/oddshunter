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

const NAME_JUNK_CHARS_RE = /[©®™•·°~^]/g;
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

  // An EMPTY slug is nothing to bet on. A ≤2-char slug on either side is
  // OCR debris (real 2026-09-04: "Opanxap vs ra" — the "ra" side is not a
  // real Serbian abbreviation, it's an OCR fragment) UNLESS the RAW side
  // reads as an all-caps abbreviation ("OM", "AC", "PSG"). Two lowercase
  // letters after slugging = broken; two capital letters in the source =
  // legitimate club shortcut.
  if (!homeSlug || !awaySlug) {
    return { ok: false, reason: `team slug empty after slugging (${homeSlug || "∅"} / ${awaySlug || "∅"})` };
  }
  const isRealAbbreviation = (raw: string): boolean => {
    const trimmed = raw.trim();
    return trimmed.length >= 2 && trimmed.length <= 4 && /^[A-Z]+$/.test(trimmed);
  };
  if (homeSlug.length <= 2 && !isRealAbbreviation(home)) {
    return { ok: false, reason: `home slug too short and raw name isn't an all-caps abbreviation — OCR fragment (${homeSlug} / raw "${home}")` };
  }
  if (awaySlug.length <= 2 && !isRealAbbreviation(away)) {
    return { ok: false, reason: `away slug too short and raw name isn't an all-caps abbreviation — OCR fragment (${awaySlug} / raw "${away}")` };
  }

  if (META_TEAM_SLUGS.has(homeSlug) || META_TEAM_SLUGS.has(awaySlug)) {
    return { ok: false, reason: `team slug is a known meta label (${META_TEAM_SLUGS.has(homeSlug) ? homeSlug : awaySlug})` };
  }

  // Non-Latin team names (Noaim 2026-09-06: "je ne parle pas russe"). If
  // EITHER side of the fixture carries Cyrillic characters — real cases from
  // the screenshot: "BaacaH Harnoceypa vs IHACTaH", "Сингапур vs Монголия",
  // "AmMepuka MuHeHpo vs NoHapnHa" — the subscriber has no way to look up
  // the match on a bookmaker in French. Suppress rather than send something
  // he can't act on. Same rule for other non-Latin scripts (Greek, Arabic,
  // CJK) — we don't have a translation pipeline, and posting an
  // unreadable-to-the-audience alert is worse than skipping it.
  const NON_LATIN_RE = /[Ѐ-ӿͰ-Ͽ؀-ۿ一-鿿぀-ヿ가-힯]/;
  for (const raw of [home, away]) {
    if (NON_LATIN_RE.test(raw)) {
      return { ok: false, reason: `team name uses non-Latin script (${raw}) — no French/Latin lookup available for subscriber` };
    }
  }
  // OCR/transliteration of Cyrillic into "Latin lookalikes" a French
  // speaker still can't read — "BaacaH Harnoceypa" (Cyrillic "н" comes out
  // as Latin "H" mid-word), "IHACTaH" (mostly majuscules), "AmMepuka
  // MuHeHpo vs NoHapnHa" (alternating case). None of these normal Latin
  // team names have these letter patterns:
  //   - a Latin H sitting between a lowercase vowel and end-of-word/space
  //     (Cyrillic н transliteration): "aH", "oH", "uH", "eH", "iH"
  //   - 3+ consecutive uppercase letters mid-word (IHACT, ANSTA…)
  //   - alternating case inside a word ("mMe" in AmMepuka)
  const LOOKALIKE = [
    /[aeiou]H(?:$|\s|\b)/g, // aH/oH/uH/eH/iH ending a token
    /[A-Z]{3,}/g, // 3+ caps in a row
    /[a-z][A-Z][a-z]/g, // camelCase mid-word (foreign in team names)
  ];
  const lookalikeHits = LOOKALIKE.reduce((n, re) => n + (home.match(re)?.length ?? 0) + (away.match(re)?.length ?? 0), 0);
  if (lookalikeHits >= 2) {
    return { ok: false, reason: `team names read as cyrillic-lookalike OCR garble (${home} / ${away}, ${lookalikeHits} lookalike signals)` };
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

  if (tip.market === "OVER_UNDER" || tip.market === "OVER_UNDER_HT") {
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

  // A full-match total whose line reads as basketball (≥ 15 points, so
  // inferSport calls it basketball) but sits well below any real
  // full-game total is almost always a TEAM total or a half/quarter line
  // the parser couldn't qualify — there is no market code for "team
  // total", so it would render as a bare "Plus de 71,5 points" and read
  // as the whole-match line, which it is not (Noaim 2026-09-09, "Dugave
  // Odema vs Metalac — Plus de 71,5 points": "c'était le total d'une
  // équipe, pas tout le match, sinon ce n'est pas cohérent"). Real
  // full-game totals: NBA ~210+, EuroLeague ~150, women's / youth / low
  // divisions ~120-140 — nothing legitimate lands under ~115. HT lines
  // are already tagged "1ère mi-temps" and a ~60-90 half total is real,
  // so this only screens the full-match market.
  if (tip.market === "OVER_UNDER") {
    const line = Number.parseFloat(tip.selection.replace(/^(?:OVER|UNDER)_/, "").replace(/_/g, "."));
    if (Number.isFinite(line) && line >= 15 && line < 115) {
      return {
        ok: false,
        reason: `total ${line} is below any real full-match basketball total — likely a team/half total the parser couldn't qualify`,
      };
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
  if (tip.market === "OVER_UNDER" || tip.market === "OVER_UNDER_HT") {
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
export function formatMarketSelection(
  tip: Pick<ParsedTip, "homeTeam" | "awayTeam" | "market" | "selection">,
  sportOverride?: Sport,
): string {
  const home = sanitizeTeamName(tip.homeTeam ?? "");
  const away = sanitizeTeamName(tip.awayTeam ?? "");
  const sport = sportOverride ?? inferSport(tip);

  switch (tip.market) {
    case "OVER_UNDER": {
      const fr = formatOverUnder(tip.selection, sport);
      if (fr) return fr;
      return `Total : ${tip.selection}`;
    }
    case "OVER_UNDER_HT": {
      const fr = formatOverUnder(tip.selection, sport);
      if (fr) return `${fr} (1ère mi-temps)`;
      return `Total 1ère mi-temps : ${tip.selection}`;
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
const ODDS_MIN = 1.15;
const ODDS_MAX = 15;
const frOdds = (n: number): string => n.toFixed(2).replace(".", ",");

/** The odds line for the alert. When multiple groups stated different
 *  odds we show the AVERAGE (Noaim, 2026-09-05: "si un groupe envoie 1.50
 *  et l'autre 2.00 tu fais la moyenne, ça fait 1.75" — reversing his
 *  earlier 2026-09-03 stance because a single-value line is what
 *  subscribers actually want to see, not a spread). `samples` are every
 *  DISTINCT labeled odds seen across the groups that formed this
 *  consensus; the average is arithmetic mean, rounded to 2 decimals. */
function formatOddsLine(samples: number[] | undefined, fallback: number | null | undefined): string | null {
  const clean = Array.from(
    new Set((samples ?? []).filter((n) => Number.isFinite(n) && n >= ODDS_MIN && n <= ODDS_MAX).map((n) => Math.round(n * 100) / 100)),
  );
  if (clean.length === 0) {
    if (fallback != null && Number.isFinite(fallback) && fallback >= ODDS_MIN && fallback <= ODDS_MAX) {
      return `💰 Cote au signalement : ${frOdds(fallback)}`;
    }
    return null;
  }
  if (clean.length === 1) return `💰 Cote au signalement : ${frOdds(clean[0])}`;
  // Averaged into a single value (Noaim, 2026-09-05: "1.50 et 2.00, tu fais
  // la moyenne, ça fait 1.75") — the "(moyenne de N groupes)" tag was
  // dropped right after shipping it (Noaim, same day: "ça ne sert à rien,
  // ça prend de la place pour rien"), so this now reads identically to the
  // single-value case.
  const avg = clean.reduce((a, b) => a + b, 0) / clean.length;
  const rounded = Math.round(avg * 100) / 100;
  return `💰 Cote au signalement : ${frOdds(rounded)}`;
}

export function formatConsensusMessage(
  tip: ParsedTip & {
    groupCount: number;
    oddsAtAlert?: number | null;
    /** Every distinct labeled odds the contributing groups stated. */
    oddsSamples?: number[];
    country?: string | null;
    /** Authoritative sport when a provider resolved the fixture — overrides
     *  the numeric-line guess in inferSport (which read a basketball match
     *  as football). */
    sport?: Sport;
    /** Set when the match is already in play at post time — the status line
     *  starts as "match en cours (N min)" instead of "en attente". */
    live?: { minute?: number | null } | null;
  },
): string {
  const home = sanitizeTeamName(tip.homeTeam);
  const away = sanitizeTeamName(tip.awayTeam);
  const sport = tip.sport ?? inferSport(tip);
  const pick = formatMarketSelection(tip, sport);

  // Simplified 2026-09-05 (Noaim: "on va essayer de tout simplifier") — no
  // more "🎯 Consensus détecté" header, no "Signalé par : N groupes" line,
  // no closing disclaimer. Straight to the pick. `groupCount` is still
  // tracked on the ConsensusAlert row and in logs, just not shown here.
  const lines = [`${SPORT_EMOJI[sport]} Match : ${home} vs ${away}`];
  // Best-effort country of the competition (resolved from TheSportsDB at
  // send time — see vipGroup.ts). Omitted rather than shown blank when the
  // fixture couldn't be resolved, which is common for the obscure
  // reserve/youth leagues this feed leans on.
  if (tip.country && tip.country.trim()) {
    lines.push(`🌍 Pays : ${tip.country.trim()}`);
  }
  lines.push(`📊 Pronostic : ${pick}`);
  const oddsLine = formatOddsLine(tip.oddsSamples, tip.oddsAtAlert);
  if (oddsLine) lines.push(oddsLine);
  // No status line at post time (Noaim 2026-09-06: "enlève le statut"). The
  // message stays clean — Match / Pays / Pronostic / Cote — and the outcome
  // resolver APPENDS a single "✅ Résultat : …" / "❌ …" line once the match
  // is graded, nothing before that.
  return lines.join("\n");
}

/**
 * The single status line every consensus alert carries. It starts life as
 * "en attente du résultat", flips to "match en cours" once kickoff has
 * passed, then to the graded verdict + final score once the match ends —
 * and the outcome resolver EDITS the original Telegram message in place to
 * do each flip (never a separate follow-up reply — Noaim, 2026-09-04: "tu
 * n'envoies pas un nouveau message pour le résultat, tu restes sur le même
 * message"). replaceConsensusStatusLine swaps only this line and leaves
 * every other line of the alert untouched.
 */
export type ConsensusStatusInput =
  | { state: "pending" }
  | { state: "live"; minute?: number | null }
  | { state: "unresolved" }
  | {
      state: "won" | "lost" | "void";
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      halfTimeScore?: { homeScore: number; awayScore: number } | null;
    };

/** Every prefix a status line can start with — replaceConsensusStatusLine
 *  scans for one of these to find the line it must swap. Order doesn't
 *  matter; they're mutually exclusive in a real message. */
export const CONSENSUS_STATUS_PREFIXES = [
  "🔄 Statut :",
  "🔴 Statut :",
  "✅ Résultat :",
  "❌ Résultat :",
  "⚪ Résultat :",
] as const;

export function consensusStatusLine(input: ConsensusStatusInput): string {
  // 🔄 = "chargement" (Noaim, 2026-09-05) — a true animated Telegram emoji
  // needs Premium + a custom emoji asset id, not plain Bot API text, so
  // this is the closest reliable stand-in that reads as "en cours de
  // traitement" on every client. ✅/❌ below are unchanged, as asked.
  if (input.state === "pending") return "🔄 Statut : en attente du résultat";
  if (input.state === "live") {
    return input.minute != null && Number.isFinite(input.minute)
      ? `🔴 Statut : match en cours (${input.minute}e min)`
      : "🔴 Statut : match en cours";
  }
  // Terminal state for a fixture we could never find a score for — a
  // garbled/OCR-mangled team name ("ghas vs Atletica Portugue"), a
  // postponed match, an ultra-obscure league neither source covers. Better
  // than leaving the alert on "en attente du résultat" forever (Noaim
  // 2026-09-05).
  if (input.state === "unresolved") return "⚪ Résultat : indisponible (match introuvable)";
  const home = sanitizeTeamName(input.homeTeam);
  const away = sanitizeTeamName(input.awayTeam);
  const score = input.halfTimeScore
    ? `${home} ${input.halfTimeScore.homeScore}-${input.halfTimeScore.awayScore} ${away} à la mi-temps (${input.homeScore}-${input.awayScore} au final)`
    : `${home} ${input.homeScore}-${input.awayScore} ${away}`;
  const verdict =
    input.state === "won"
      ? "✅ Résultat : pari validé"
      : input.state === "lost"
        ? "❌ Résultat : pari perdu"
        : "⚪ Résultat : remboursé (push)";
  return `${verdict} — ${score}`;
}

/**
 * Returns `originalText` with its status line swapped for `newStatusLine`,
 * every other line kept byte-for-byte (so the country / odds-spread lines
 * survive an edit made from data the resolver doesn't itself hold). If the
 * message predates the status line — alerts posted before 2026-09-04 — the
 * new line is inserted just above the ⚠️ disclaimer instead.
 */
export function replaceConsensusStatusLine(originalText: string, newStatusLine: string): string {
  const lines = originalText.split("\n");
  const idx = lines.findIndex((l) => CONSENSUS_STATUS_PREFIXES.some((p) => l.startsWith(p)));
  if (idx !== -1) {
    lines[idx] = newStatusLine;
    return lines.join("\n");
  }
  const disclaimerIdx = lines.findIndex((l) => l.startsWith("⚠️"));
  if (disclaimerIdx === -1) return `${originalText}\n${newStatusLine}`;
  let insertAt = disclaimerIdx;
  if (insertAt > 0 && lines[insertAt - 1] === "") insertAt -= 1; // keep the blank line before the disclaimer
  lines.splice(insertAt, 0, newStatusLine);
  return lines.join("\n");
}

/** The status prefix currently on a posted message, or null — lets the
 *  resolver skip a redundant "→ live" edit on a message that already shows
 *  a live or resolved line. */
export function currentConsensusStatusPrefix(text: string): (typeof CONSENSUS_STATUS_PREFIXES)[number] | null {
  for (const line of text.split("\n")) {
    const hit = CONSENSUS_STATUS_PREFIXES.find((p) => line.startsWith(p));
    if (hit) return hit;
  }
  return null;
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
  /** When set, the pick was a first-half line — the score that graded it is
   *  the half-time one, so show that (with the full-time score alongside for
   *  context) instead of a bare full-time score the reader would misread. */
  halfTimeScore?: { homeScore: number; awayScore: number } | null;
}): string {
  const home = sanitizeTeamName(args.homeTeam);
  const away = sanitizeTeamName(args.awayTeam);
  const scoreLine = args.halfTimeScore
    ? `${home} ${args.halfTimeScore.homeScore}-${args.halfTimeScore.awayScore} ${away} à la mi-temps (${args.homeScore}-${args.awayScore} au final)`
    : `${home} ${args.homeScore}-${args.awayScore} ${away}`;
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
  halfTimeScore?: { homeScore: number; awayScore: number } | null,
): "WON" | "LOST" | "VOID" | null {
  const diff = score.homeScore - score.awayScore;
  const total = score.homeScore + score.awayScore;
  const homeSlug = slugTeam(fixture.homeTeam);
  const awaySlug = slugTeam(fixture.awayTeam);

  if (market === "OVER_UNDER" || market === "OVER_UNDER_HT") {
    const m = selection.match(/^(OVER|UNDER)_(\d+(?:_\d+)?)$/);
    if (!m) return null;
    const dir = m[1];
    const line = Number.parseFloat(m[2].replace(/_/g, "."));
    if (!Number.isFinite(line)) return null;
    // A first-half line is graded against the half-time score, not the
    // full-time one. No HT score available (Sofascore didn't expose
    // period1) → ungradeable, caller records UNRESOLVED rather than guessing.
    if (market === "OVER_UNDER_HT") {
      if (!halfTimeScore) return null;
      const htTotal = halfTimeScore.homeScore + halfTimeScore.awayScore;
      if (htTotal === line) return "VOID";
      return (dir === "OVER" ? htTotal > line : htTotal < line) ? "WON" : "LOST";
    }
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
