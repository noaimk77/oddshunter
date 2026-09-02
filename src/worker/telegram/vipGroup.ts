import type { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import type { EntityLike } from "telegram/define";
import type { ParsedTip } from "./tipParser";
import { formatConsensusMessage } from "./alertFormat";
export { formatConsensusMessage, shouldSendConsensusAlert } from "./alertFormat";

let cachedEntity: EntityLike | null = null;

function extractInviteHash(link: string): string {
  const match = link.match(/\+([A-Za-z0-9_-]+)/) ?? link.match(/joinchat\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Lien d'invitation VIP invalide : ${link}`);
  return match[1];
}

/**
 * Resolves the VIP group's entity from its invite link — cached for the
 * process lifetime since it can't change without a redeploy. Handles both
 * cases: the account is already a member (the expected, steady state) or
 * needs to join once (first run after the invite link changes).
 */
async function resolveVipGroup(client: TelegramClient): Promise<EntityLike> {
  if (cachedEntity) return cachedEntity;

  const inviteLink = process.env.TELEGRAM_VIP_INVITE_LINK;
  if (!inviteLink) throw new Error("TELEGRAM_VIP_INVITE_LINK n'est pas configuré.");
  const hash = extractInviteHash(inviteLink);

  const result = await client.invoke(new Api.messages.CheckChatInvite({ hash }));

  if (result instanceof Api.ChatInviteAlready || result instanceof Api.ChatInvitePeek) {
    cachedEntity = result.chat as EntityLike;
  } else {
    const updates = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
    const chats = "chats" in updates ? updates.chats : [];
    if (!chats[0]) throw new Error("Impossible de rejoindre le groupe VIP via le lien d'invitation.");
    cachedEntity = chats[0] as EntityLike;
  }

  return cachedEntity;
}

/**
 * Posts the consensus alert to the VIP group. Returns the Telegram
 * (chatId, messageId) pair so the caller can persist it — the outcome
 * resolver replies to this exact message once the match ends, threading
 * "✅ Passé"/"❌ Perdu" under the pick.
 */
export async function sendConsensusAlert(
  client: TelegramClient,
  tip: ParsedTip & { groupCount: number; oddsAtAlert?: number | null },
): Promise<{ chatId: string; messageId: number } | null> {
  const entity = await resolveVipGroup(client);
  const sent = await client.sendMessage(entity, { message: formatConsensusMessage(tip) });
  // gramjs returns Api.Message; peerId is the chat, id is the message id.
  const chatId = sent.chatId ? String(sent.chatId) : sent.peerId ? String((sent.peerId as { channelId?: bigint | number }).channelId ?? sent.peerId) : null;
  const messageId = typeof sent.id === "number" ? sent.id : Number(sent.id);
  if (!chatId || !Number.isFinite(messageId)) return null;
  return { chatId, messageId };
}
