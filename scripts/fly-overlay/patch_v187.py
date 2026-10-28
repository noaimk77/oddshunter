"""Overlay v187: VIP alert team names + photo.

Applies on top of the production v186 files (tipParser.ts and its test,
tipLlmFallback.ts, vipGroup.ts). Usage: python3 patch_v187.py <root>
Also copy alertImage.ts and alertImage.test.ts next to them (see README).

Real miss 2026-10-28 11:10 Paris (Khon Kaen United U21 vs Rasi Salai United
U21 posted as "U21 vs U21"): the source groups posted a phone screenshot of
another Telegram channel. Its OCR has the names on one line and
"U21 03 : 48 U21" under them; the score-line parser took the match clock for
a score and "U21" for both teams, and the VIP got the chat screenshot as is.
- tipParser: a side that is only an age/reserve tag (U21, II, Res…) or the
  same team on both sides is not a fixture, so the vision model reads the
  names off the image instead;
- vipGroup: before posting, a chat screenshot is cropped to the bookmaker
  screenshot showing the pick (alertImage.ts, box from Gemini).
"""
import sys
root = sys.argv[1]


def patch(rel, edits, marker, append=""):
    p = f"{root}/{rel}"
    s = open(p).read()
    if marker in s:
        sys.exit(f"{rel}: already patched")
    for old, new in edits:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
        s = s.replace(old, new)
    open(p, "w").write(s + append)
    print("patched", rel)


patch("src/worker/telegram/tipParser.ts", [
    ("""function isRealTeamName(candidate: string): boolean {
  const words = normalize(candidate)
    .replace(/[^a-z0-9\\s]+/g, " ")
    .split(/\\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  // At least one word must be a real team-name-looking token — every word
  // being a country/competition word is what betrays the phantom.
  return words.some((w) => !NON_TEAM_TOKENS.has(w) && w.length >= 2);
}
""", """/** Age group / reserve side tags: part of a team name, never one on their
 *  own ("U21 03 : 48 U21" is the clock line under the names on a scoreboard,
 *  real 2026-10-28 miss). Whole words only, so "Istra1961U19" is untouched. */
const SIDE_TAG_RE = /^(?:u\\d{2}|ii|iii|res|reserve|reserves)$/;

function isRealTeamName(candidate: string): boolean {
  const words = normalize(candidate)
    .replace(/[^a-z0-9\\s]+/g, " ")
    .split(/\\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  // At least one word must be a real team-name-looking token — every word
  // being a country/competition word (or a bare U21) is what betrays the phantom.
  return words.some((w) => !NON_TEAM_TOKENS.has(w) && !SIDE_TAG_RE.test(w) && w.length >= 2);
}
"""),
    ("""  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  return [a, b];
}
""", """  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  if (slugTeam(a) === slugTeam(b)) return null;
  return [a, b];
}
"""),
    ("""  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  return [a.trim(), b.trim()];
}
""", """  if (slugTeam(a).length < 2 || slugTeam(b).length < 2) return null;
  if (!isRealTeamName(a) || !isRealTeamName(b)) return null;
  if (slugTeam(a) === slugTeam(b)) return null;
  return [a.trim(), b.trim()];
}
"""),
], "SIDE_TAG_RE")

patch("src/worker/telegram/tipParser.test.ts", [
    ("""  it("still rejects a score line where one side is only digits (stats fragment, not a team)", () => {""",
     """  // Real 2026-10-28 miss: phone screenshot of another channel, names on one
  // line, "U21 <clock> U21" under them. Posted to the VIP as "U21 vs U21".
  it("rejects a side that is only an age/reserve tag, and the same team on both sides", () => {
    expect(extractFixture("Khon Kaen United Rasi Salai United\\nU21 03 : 48 U21")).toBeNull();
    expect(extractFixture("U21 0 : 0 U21")).toBeNull();
    expect(extractFixture("U21 vs U21")).toBeNull();
    expect(extractFixture("Arsenal II 1-1 Arsenal II")).toBeNull();
    // Names with digits on a "vs" line were already left to the vision model.
    expect(extractFixture("Khon Kaen United vs Rasi Salai United")).toEqual({
      homeTeam: "Khon Kaen United",
      awayTeam: "Rasi Salai United",
    });
  });

  it("still rejects a score line where one side is only digits (stats fragment, not a team)", () => {"""),
], "Khon Kaen")

patch("src/worker/telegram/tipLlmFallback.ts", [], "locateBetImage", append="""
const BET_IMAGE_PROMPT = `Tu reçois une image postée dans un groupe de pronostics sportifs. Dis si c'est une capture d'écran d'une CONVERSATION de messagerie (Telegram, WhatsApp… : en-tête du chat, bulles de messages, heures, vues, champ de saisie) qui contient une ou plusieurs captures d'un site ou d'une appli de paris.
Si oui, donne le cadre de la capture de paris qui montre le prono indiqué (à défaut la plus complète) : uniquement la capture elle-même, sans la bulle, l'en-tête du chat, le nom du canal, l'heure ni les vues.
Une capture directe d'un site de paris, d'un ticket ou d'un score n'est PAS une conversation : chat=false.
JSON strict : {"chat": true|false, "box_2d": [ymin, xmin, ymax, xmax] ou null}, coordonnées de 0 à 1000.`;

/** [ymin, xmin, ymax, xmax], 0–1000 (Gemini's own box format). */
export type BetImageBox = [number, number, number, number];

/**
 * Is this photo a screenshot of a chat (another tipster channel shown on a
 * phone) rather than the bookmaker screenshot itself? If so, where is the
 * bookmaker screenshot showing `pick`. null when the model can't be asked.
 */
export async function locateBetImage(imageBuffer: Buffer, pick: string): Promise<{ chat: boolean; box: BetImageBox | null } | null> {
  if (!isConfigured()) return null;
  const raw = await callGemini({ system: BET_IMAGE_PROMPT, userText: `Prono : ${pick}`, imageBuffer, maxTokens: 120, tag: "tipLlmFallback:betImage" });
  if (!raw) return null;
  const parsed = parseModelObject<{ chat?: boolean; box_2d?: unknown }>(raw, "tipLlmFallback:betImage");
  if (!parsed || typeof parsed.chat !== "boolean") return null;
  const b = parsed.box_2d;
  const box =
    Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === "number" && Number.isFinite(v)) && b[2] > b[0] && b[3] > b[1]
      ? (b as BetImageBox)
      : null;
  return { chat: parsed.chat, box };
}
""")

patch("src/worker/telegram/vipGroup.ts", [
    ("""import { formatConsensusMessage, withDisplayNames, type Sport } from "./alertFormat";""",
     """import { formatConsensusMessage, formatMarketSelection, withDisplayNames, type Sport } from "./alertFormat";
import { cleanAlertImage } from "./alertImage";"""),
    ("""  let sent: Api.Message | null = null;
  if (tip.image) {
    try {
      sent = await client.sendFile(entity, { file: new CustomFile("prono.jpg", tip.image.length, "", tip.image), caption: text, forceDocument: false });""",
     """  let sent: Api.Message | null = null;
  // A screenshot of another channel's chat is cut down to the slip itself (Noaim 2026-10-28).
  const image = tip.image ? await cleanAlertImage(tip.image, `${label} — ${formatMarketSelection(tip)}`) : undefined;
  if (image) {
    try {
      sent = await client.sendFile(entity, { file: new CustomFile("prono.jpg", image.length, "", image), caption: text, forceDocument: false });"""),
    ("""vipText: text, image: tip.image, live: inPlay,""", """vipText: text, image, live: inPlay,"""),
], "cleanAlertImage")
