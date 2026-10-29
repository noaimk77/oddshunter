"""Overlay v191: a won VIP pick gets its score on the edited alert, no reply.

Applies on top of the production v188-v190 consensusOutcomeResolver.ts and
its test. Usage: python3 patch_v191.py <root> (Dockerfile.v191 runs it during
the build, on the files of the production image).

Noaim 2026-10-29: the short "✅✅✅ Prono VIP validé ! + score" reply under
the free-channel forward is not needed any more. A won alert is edited to end
with "✅✅✅✅ <home> <score> <away>", then forwarded as is; nothing is sent.
Lost ❌ and refunded 🔁🔁 are unchanged.
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
    ("""const RESULT_LINE_RE = /\\n(?:✅|❌|🔁)+\\s*$/u;

/** `text` ending with the result line of `outcome`, replacing any earlier one. */
export function withResultEmojis(text: string, outcome: keyof typeof RESULT_EMOJIS): string {
  return `${text.replace(RESULT_LINE_RE, "")}\\n${RESULT_EMOJIS[outcome]}`;
}""", """const RESULT_LINE_RE = /\\n(?:✅|❌|🔁)+[^\\n]*$/u;

/** `text` ending with the result line of `outcome`, the emojis then `detail`
 *  (the final score for a win), replacing any earlier one. */
export function withResultEmojis(text: string, outcome: keyof typeof RESULT_EMOJIS, detail = ""): string {
  const line = detail ? `${RESULT_EMOJIS[outcome]} ${detail}` : RESULT_EMOJIS[outcome];
  return `${text.replace(RESULT_LINE_RE, "")}\\n${line}`;
}"""),
    ("""async function markVipResult(client: TelegramClient, sentMessageId: bigint | number | null, outcome: keyof typeof RESULT_EMOJIS): Promise<boolean> {""",
     """async function markVipResult(client: TelegramClient, sentMessageId: bigint | number | null, outcome: keyof typeof RESULT_EMOJIS, detail = ""): Promise<boolean> {"""),
    ("""    const updated = withResultEmojis(msg.message ?? "", outcome);""",
     """    const updated = withResultEmojis(msg.message ?? "", outcome, detail);"""),
    ("""/** Public proof on the free channel, winners only: forward the VIP alert
 *  (already ending with its ✅ line), then reply to the forward with a short
 *  "validé" line. Never throws. */
async function forwardWonToFreeChannel(
  client: TelegramClient,
  sentMessageId: bigint | number | null,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {""", """/** Public proof on the free channel, winners only: forward the VIP alert,
 *  which already ends with its ✅ line and the score. Nothing else is sent
 *  (Noaim 2026-10-29: no "validé" reply under the forward). Never throws. */
async function forwardWonToFreeChannel(client: TelegramClient, sentMessageId: bigint | number | null): Promise<void> {"""),
    ("""    const [forwarded] = await client.forwardMessages(free, { messages: [Number(sentMessageId)], fromPeer: vip });
    await client.sendMessage(free, {
      message: `✅✅✅ Prono VIP validé !\\n${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      replyTo: forwarded?.id,
    });
""", """    await client.forwardMessages(free, { messages: [Number(sentMessageId)], fromPeer: vip });
"""),
    ("""    // Every result, won, lost or refunded, shows on the alert itself, before any forward.
    await markVipResult(client, alert.sentMessageId, outcome);
    if (outcome === "WON") {
      await forwardWonToFreeChannel(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
    }
""", """    // Every result, won, lost or refunded, shows on the alert itself, before any forward;
    // a win also gets the final score on that line.
    const score = `${alert.homeTeam ?? ""} ${homeScore}-${awayScore} ${alert.awayTeam ?? ""}`.trim();
    const marked = await markVipResult(client, alert.sentMessageId, outcome, outcome === "WON" ? score : "");
    // Without its ✅ line the forward would show no result, so a failed edit is not forwarded.
    if (outcome === "WON" && marked) {
      await forwardWonToFreeChannel(client, alert.sentMessageId);
    }
"""),
], 'detail = ""')

patch("src/worker/telegram/consensusOutcomeResolver.test.ts", [
    ("""  it("remplace un résultat déjà là au lieu d'empiler", () => {""",
     """  it("gagné : le score suit les ✅✅✅✅ sur la même ligne", () => {
    expect(withResultEmojis(alert, "WON", "Zangazur 1-4 Karvan")).toBe(`${alert}\\n✅✅✅✅ Zangazur 1-4 Karvan`);
    expect(withResultEmojis(`${alert}\\n✅✅✅✅`, "WON", "Zangazur 1-4 Karvan")).toBe(`${alert}\\n✅✅✅✅ Zangazur 1-4 Karvan`);
    expect(withResultEmojis(`${alert}\\n✅✅✅✅ Zangazur 1-4 Karvan`, "WON", "Zangazur 1-4 Karvan")).toBe(
      `${alert}\\n✅✅✅✅ Zangazur 1-4 Karvan`,
    );
  });

  it("remplace un résultat déjà là au lieu d'empiler", () => {"""),
], "le score suit")
