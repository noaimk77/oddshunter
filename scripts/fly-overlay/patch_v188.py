"""Overlay v188: VIP result shown by editing the alert itself.

Applies on top of the production v187 consensusOutcomeResolver.ts and its
test. Usage: python3 patch_v188.py <root>

Noaim 2026-10-28: every graded VIP pick gets its result, as a line of emojis
added to the original alert (no reply under it any more):
won ✅✅✅✅, lost ❌, refunded 🔁🔁. Only a won pick is then forwarded to the
free channel, as edited, with the short "Prono VIP validé" reply under it
(Noaim 2026-10-28: keep that line).
"""
import sys
root = sys.argv[1]


def patch(rel, edits, marker):
    p = f"{root}/{rel}"
    s = open(p).read()
    if marker in s:
        sys.exit(f"{rel}: already patched")
    for old, new in edits:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
        s = s.replace(old, new)
    open(p, "w").write(s)
    print("patched", rel)


patch("src/worker/telegram/consensusOutcomeResolver.ts", [
    ("""/** Visible "prono validé" in the VIP group (Noaim 2026-10-23): a reply to
 *  the original alert, sent from the same account that posted it, so members
 *  get a notification. Only for winners; losses stay silent. Never throws. */
async function postWonReply(
  client: TelegramClient,
  sentMessageId: bigint | number | null,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  if (sentMessageId == null) return;
  try {
    const entity = await resolveVipGroup(client);
    if (!entity) return;
    await client.sendMessage(entity, {
      message: `✅ PRONO VALIDÉ ✅\\n${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      replyTo: Number(sentMessageId),
    });
  } catch (err) {
    console.error("[consensusOutcomeResolver] failed to post the won reply:", err instanceof Error ? err.message : err);
  }
}
""", """/** Result line added to the VIP alert itself (Noaim 2026-10-28: edit the
 *  pick, don't reply under it; it replaced the v184 "PRONO VALIDÉ" reply). */
export const RESULT_EMOJIS = { WON: "✅✅✅✅", LOST: "❌", VOID: "🔁🔁" } as const;
const RESULT_LINE_RE = /\\n(?:✅|❌|🔁)+\\s*$/u;

/** `text` ending with the result line of `outcome`, replacing any earlier one. */
export function withResultEmojis(text: string, outcome: keyof typeof RESULT_EMOJIS): string {
  return `${text.replace(RESULT_LINE_RE, "")}\\n${RESULT_EMOJIS[outcome]}`;
}

/** Edits the VIP alert so it shows its result; the caption's own formatting
 *  is kept as is. True when the message now carries it. Never throws. */
async function markVipResult(client: TelegramClient, sentMessageId: bigint | number | null, outcome: keyof typeof RESULT_EMOJIS): Promise<boolean> {
  if (sentMessageId == null) return false;
  try {
    const entity = await resolveVipGroup(client);
    if (!entity) return false;
    const id = Number(sentMessageId);
    const [msg] = await client.getMessages(entity, { ids: [id] });
    if (!msg) return false;
    const updated = withResultEmojis(msg.message ?? "", outcome);
    if (updated !== msg.message) await client.editMessage(entity, { message: id, text: updated, formattingEntities: msg.entities ?? [] });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not modified/i.test(msg)) return true;
    console.error("[consensusOutcomeResolver] failed to add the result to the VIP alert:", msg);
    return false;
  }
}
"""),
    ("""/** Public proof on the free channel: forward the original VIP message as is,
 *  then reply to the forward with a short "validé" line. Never throws. */""",
     """/** Public proof on the free channel, winners only: forward the VIP alert
 *  (already ending with its ✅ line), then reply to the forward with a short
 *  "validé" line. Never throws. */"""),
    ("""    if (outcome === "WON") {
      await postWonReply(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
      await forwardWonToFreeChannel(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
    }
""", """    // Every result, won, lost or refunded, shows on the alert itself, before any forward.
    await markVipResult(client, alert.sentMessageId, outcome);
    if (outcome === "WON") {
      await forwardWonToFreeChannel(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
    }
"""),
], "markVipResult")

patch("src/worker/telegram/consensusOutcomeResolver.test.ts", [
    ("""import { gradeFromLive } from "./consensusOutcomeResolver";""",
     """import { gradeFromLive, withResultEmojis } from "./consensusOutcomeResolver";"""),
    ("""describe("gradeFromLive — only reports LOCKED verdicts from a live score", () => {""",
     """describe("résultat ajouté à l'alerte VIP", () => {
  const alert = "⚽ Match : Monori SE vs MTK Budapest\\n🌍 Pays : Hungary\\n📊 Pronostic : Plus de 6 buts\\n💰 Cote au signalement : 1,72";

  it("gagné ✅✅✅✅, perdu ❌, remboursé 🔁🔁, sur une ligne à la fin", () => {
    expect(withResultEmojis(alert, "WON")).toBe(`${alert}\\n✅✅✅✅`);
    expect(withResultEmojis(alert, "LOST")).toBe(`${alert}\\n❌`);
    expect(withResultEmojis(alert, "VOID")).toBe(`${alert}\\n🔁🔁`);
  });

  it("remplace un résultat déjà là au lieu d'empiler", () => {
    expect(withResultEmojis(`${alert}\\n🔁`, "VOID")).toBe(`${alert}\\n🔁🔁`);
    expect(withResultEmojis(withResultEmojis(alert, "LOST"), "WON")).toBe(`${alert}\\n✅✅✅✅`);
  });
});

describe("gradeFromLive — only reports LOCKED verdicts from a live score", () => {"""),
], "withResultEmojis")
