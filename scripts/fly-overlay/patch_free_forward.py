"""Overlay v185: forward each won VIP pick to the free channel.

Applies on top of the production v184 consensusOutcomeResolver.ts (the one
that already has postWonReply). Usage: python3 patch_free_forward.py <root>
Needs the TELEGRAM_FREE_CHANNEL secret: @username, t.me/username or an
invite link (t.me/+hash) of the free channel.
"""
import sys
root = sys.argv[1]
rel = "src/worker/telegram/consensusOutcomeResolver.ts"
p = f"{root}/{rel}"
s = open(p).read()
if "forwardWonToFreeChannel" in s:
    sys.exit(f"{rel}: already patched")

edits = [
    ("""export async function resolvePendingConsensusOutcomes(""", """/** Free-channel entity from TELEGRAM_FREE_CHANNEL (@username, t.me/username
 *  or t.me/+invite). Cached per process; null when unset or unreachable. */
let cachedFreeEntity: EntityLike | null = null;
async function resolveFreeChannel(client: TelegramClient): Promise<EntityLike | null> {
  if (cachedFreeEntity) return cachedFreeEntity;
  const ref = process.env.TELEGRAM_FREE_CHANNEL?.trim();
  if (!ref) return null;
  const invite = ref.match(/\\+([A-Za-z0-9_-]+)/) ?? ref.match(/joinchat\\/([A-Za-z0-9_-]+)/);
  if (invite) {
    const check = await client.invoke(new Api.messages.CheckChatInvite({ hash: invite[1] }));
    if (check instanceof Api.ChatInviteAlready || check instanceof Api.ChatInvitePeek) {
      cachedFreeEntity = check.chat as EntityLike;
    }
    return cachedFreeEntity;
  }
  const username = ref.replace(/^https?:\\/\\/t\\.me\\//, "").replace(/^@/, "");
  cachedFreeEntity = (await client.getEntity(username)) as EntityLike;
  return cachedFreeEntity;
}

/** Public proof on the free channel: forward the original VIP message as is,
 *  then reply to the forward with a short "validé" line. Never throws. */
async function forwardWonToFreeChannel(
  client: TelegramClient,
  sentMessageId: bigint | number | null,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  if (sentMessageId == null) return;
  try {
    const [vip, free] = await Promise.all([resolveVipGroup(client), resolveFreeChannel(client)]);
    if (!vip || !free) return;
    const [forwarded] = await client.forwardMessages(free, { messages: [Number(sentMessageId)], fromPeer: vip });
    await client.sendMessage(free, {
      message: `✅✅✅ Prono VIP validé !\\n${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`,
      replyTo: forwarded?.id,
    });
  } catch (err) {
    console.error("[consensusOutcomeResolver] failed to forward the won pick to the free channel:", err instanceof Error ? err.message : err);
  }
}

export async function resolvePendingConsensusOutcomes("""),
    ("""        await postWonReply(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
""", """        await postWonReply(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
        await forwardWonToFreeChannel(client, alert.sentMessageId, alert.homeTeam ?? "", alert.awayTeam ?? "", homeScore, awayScore);
"""),
]
for old, new in edits:
    n = s.count(old)
    if n != 1:
        sys.exit(f"{rel}: expected 1 match, found {n} for {old[:60]!r}")
    s = s.replace(old, new)
open(p, "w").write(s)
print("patched", rel)
