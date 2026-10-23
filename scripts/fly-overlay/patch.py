import sys
root = sys.argv[1]
def patch(rel, edits):
    p = f"{root}/{rel}"
    s = open(p).read()
    for old, new in edits:
        n = s.count(old)
        if n != 1:
            sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
        s = s.replace(old, new)
    open(p, "w").write(s)
    print("patched", rel)

patch("src/worker/telegram/consensusOutcomeResolver.ts", [
    ('} from "./alertFormat";\n', '} from "./alertFormat";\nimport { publishValidatedPick } from "../social/bufferPublisher";\n'),
    ("""    resolved++;
  };
""", """    resolved++;

    // Public proof on X (via Buffer), after the match and only for winners.
    // Never throws.
    if (outcome === "WON") {
      await publishValidatedPick({
        id: alert.id,
        homeTeam: alert.homeTeam ?? "",
        awayTeam: alert.awayTeam ?? "",
        market: alert.market ?? "",
        selection: alert.selection ?? "",
        homeScore,
        awayScore,
        halfTimeScore: alert.market?.endsWith("_HT") ? halfTimeScore : null,
      });
    }
  };
"""),
])
patch("src/worker/telegram/consensusOutcomeResolver.ts", [
    ("""export async function resolvePendingConsensusOutcomes(""", """/** Visible "prono validé" in the VIP group: a reply to the original alert,
 *  so members get a notification (the in-place status edit is silent).
 *  Never throws. */
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
      message: `✅ PRONO VALIDÉ ✅\n${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      replyTo: Number(sentMessageId),
    });
  } catch (err) {
    console.error("[consensusOutcomeResolver] failed to post the won reply:", err instanceof Error ? err.message : err);
  }
}

export async function resolvePendingConsensusOutcomes("""),
    ("""      await editConsensusStatusLine(client, alert.sentMessageId, verdictLine);
""", """      await editConsensusStatusLine(client, alert.sentMessageId, verdictLine);
      if (outcome === "WON") {
        await postWonReply(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
      }
"""),
])
patch("src/worker/telegram/pickShare.ts", [
    ('import { sanitizeTeamName } from "./alertFormat";\n', 'import { sanitizeTeamName } from "./alertFormat";\nimport { publishFreePick } from "../social/bufferPublisher";\n'),
    ("""        console.log(`[pickShare] ${label} posted as a free pick on the free channel.`);
""", """        console.log(`[pickShare] ${label} posted as a free pick on the free channel.`);
        await publishFreePick(p.tip); // same pick on X (rebuilt short), never throws
"""),
])
