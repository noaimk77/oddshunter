/**
 * Result of a VIP pick read off the source groups' own Telegram messages
 * (Noaim 2026-10-29): the tipsters often say themselves that a pick passed,
 * long before (or instead of) any score site listing the match — esports,
 * Myanmar U20, Mumbai Super League… Pure functions; the resolver fetches the
 * messages and applies the verdict.
 *
 * A message counts for a pick when it is, in this order:
 *   1. the pick message itself, edited since to carry a result;
 *   2. a reply to the pick message;
 *   3. a later message naming one of the two teams;
 *   4. a short "result only" message ("✅✅✅", "Passé", photo + "❌") posted
 *      after the pick, when that chat posted no other pick from 6h before it
 *      up to that message (otherwise the result could be another pick's).
 * Each source chat gives at most one verdict; chats that disagree give none.
 *
 * Unicode lookarounds instead of `\b`: JS `\b` is ASCII-only and breaks on
 * accented/Cyrillic words.
 */
export type ChatVerdict = "WON" | "LOST" | "VOID";

export interface ChatMessage {
  id: number;
  /** Unix seconds, as Telegram gives it. */
  date: number;
  text: string;
  editDate: number | null;
  replyToId: number | null;
}

export interface SourcePick {
  detectedAt: Date;
  rawText: string;
}

const L = "(?<![\\p{L}\\p{N}])";
const R = "(?![\\p{L}\\p{N}])";

const VOID_RE = new RegExp(
  `(🔁|${L}(?:annul[\\p{L}]*|cancel(?:l)?ed|void(?:ed)?|refund(?:ed)?|rembours[\\p{L}]*|postpon[\\p{L}]*|abandon[\\p{L}]*|отмен[\\p{L}]*|возврат[\\p{L}]*)${R})`,
  "iu",
);
const LOST_RE = new RegExp(`(❌|✖️|🔴|⛔|${L}(?:lost|perdu[es]?|perdant|не\\s+зашл[\\p{L}]*|проигр[\\p{L}]*|минус)${R})`, "iu");
const WON_RE = new RegExp(
  `(✅|✔️|☑️|🟢|${L}(?:won|gagn(?:é|ée|ant)s?|valid(?:é|ée)s?|pass(?:é|ée)s?|зашл[\\p{L}]*|зашёл|выигр[\\p{L}]*|плюс)${R})`,
  "iu",
);

/** The result a message states, or null when it states none (or both). */
export function readVerdict(text: string): ChatVerdict | null {
  if (!text.trim()) return null;
  if (VOID_RE.test(text)) return "VOID";
  const lost = LOST_RE.test(text);
  // "не зашло" (didn't pass) also matches the WON stem, so LOST wins it.
  const won = WON_RE.test(text.replace(new RegExp(`не\\s+зашл[\\p{L}]*`, "giu"), ""));
  if (won && !lost) return "WON";
  if (lost && !won) return "LOST";
  return null;
}

/** A message that is a result and little else: at most 25 letters once
 *  emojis, digits and punctuation are gone ("✅✅✅", "Passé ✅", "Perdu"). */
export function isBareVerdict(text: string): boolean {
  return readVerdict(text) !== null && (text.match(/\p{L}/gu) ?? []).length <= 25;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** True when `text` names one of the teams by a distinctive word (4+ letters,
 *  not a category like "united" or "u20"). */
export function mentionsTeam(text: string, teams: { homeTeam: string; awayTeam: string }): boolean {
  const hay = ` ${norm(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const COMMON = new Set(["united", "city", "club", "team", "sport", "sports", "esports", "gaming", "reserve", "reserves", "women", "youth", "real", "athletic", "atletico", "sporting"]);
  return [teams.homeTeam, teams.awayTeam].some((team) =>
    norm(team)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4 && !COMMON.has(w) && !/^u\d+$/.test(w))
      .some((w) => hay.includes(` ${w} `)),
  );
}

const PICK_WINDOW_BEFORE_S = 15 * 60;
const PICK_WINDOW_AFTER_S = 90;
const BARE_VERDICT_WINDOW_S = 8 * 3600;
const QUIET_BEFORE_PICK_MS = 6 * 3600_000;

/** The chat message the pick was read from: posted shortly before it was
 *  stored, the one with the same text if any, else the closest in time. */
export function locatePickMessage(pick: SourcePick, messages: ChatMessage[]): ChatMessage | null {
  const at = Math.floor(pick.detectedAt.getTime() / 1000);
  const window = messages.filter((m) => m.date >= at - PICK_WINDOW_BEFORE_S && m.date <= at + PICK_WINDOW_AFTER_S);
  const raw = pick.rawText.trim();
  const sameText = window.find((m) => m.text.trim() && raw.startsWith(m.text.trim()));
  if (sameText) return sameText;
  return window.sort((a, b) => Math.abs(a.date - at) - Math.abs(b.date - at))[0] ?? null;
}

/**
 * The verdict one source chat gives for its pick. `otherPicksMs` are the
 * times this chat's OTHER picks (other matches) were stored.
 */
export function verdictFromChat(
  pick: SourcePick,
  messages: ChatMessage[],
  otherPicksMs: number[],
  teams: { homeTeam: string; awayTeam: string },
): ChatVerdict | null {
  const pickMsg = locatePickMessage(pick, messages);
  if (!pickMsg) return null;

  // 1. The tipster edited the pick itself to add the result.
  if (pickMsg.editDate && readVerdict(pick.rawText) === null) {
    const v = readVerdict(pickMsg.text);
    if (v) return v;
  }

  const after = messages.filter((m) => m.date >= pickMsg.date && m.id > pickMsg.id).sort((a, b) => a.id - b.id);

  // 2. A reply to the pick.
  for (const m of after) {
    if (m.replyToId !== pickMsg.id) continue;
    const v = readVerdict(m.text);
    if (v) return v;
  }

  // 3. A later message naming the match.
  for (const m of after) {
    if (!mentionsTeam(m.text, teams)) continue;
    const v = readVerdict(m.text);
    if (v) return v;
  }

  // 4. A bare result right after the pick, only when nothing else of this chat could own it.
  const pickMs = pick.detectedAt.getTime();
  if (otherPicksMs.some((t) => t < pickMs && t > pickMs - QUIET_BEFORE_PICK_MS)) return null;
  const nextPickMs = Math.min(...otherPicksMs.filter((t) => t > pickMs), Infinity);
  for (const m of after) {
    if (m.date * 1000 >= nextPickMs || m.date > pickMsg.date + BARE_VERDICT_WINDOW_S) break;
    if (m.replyToId && m.replyToId !== pickMsg.id) continue;
    if (isBareVerdict(m.text)) return readVerdict(m.text);
  }
  return null;
}

/** One verdict out of every chat's: the one they all give, else null. */
export function combineVerdicts(verdicts: (ChatVerdict | null)[]): ChatVerdict | null {
  const found = new Set(verdicts.filter((v): v is ChatVerdict => v !== null));
  return found.size === 1 ? [...found][0] : null;
}
