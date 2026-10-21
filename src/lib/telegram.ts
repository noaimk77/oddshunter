import { db } from "@/lib/db";

/**
 * VIP channel access, driven by the bot (TELEGRAM_BOT_TOKEN) as an admin of
 * the private channel (TELEGRAM_VIP_CHAT_ID).
 *
 * Entry: each VIP subscriber gets their own invite link, created with
 * `creates_join_request` — joining through it doesn't let anyone in, it asks
 * the bot, which approves only if that link's owner has an ACTIVE VIP
 * entitlement (see /api/telegram/webhook). The first Telegram account
 * approved is bound to the user, so a forwarded link is useless to anyone
 * else.
 *
 * Exit: when the VIP entitlement leaves ACTIVE, the bound Telegram account
 * is removed from the channel (see syncEntitlementFromSubscription).
 *
 * The bot needs the "Invite users via link" and "Ban users" admin rights.
 */

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly errorCode: number | undefined,
    readonly description: string
  ) {
    super(`Telegram ${method} failed: ${errorCode ?? "?"} ${description}`);
    this.name = "TelegramApiError";
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_VIP_CHAT_ID);
}

export function vipChatId(): string {
  const chatId = process.env.TELEGRAM_VIP_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_VIP_CHAT_ID is not set — check isTelegramConfigured() first.");
  return chatId;
}

export async function callTelegram<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set — check isTelegramConfigured() first.");

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; error_code?: number; description?: string }
    | null;

  if (!body?.ok) {
    throw new TelegramApiError(method, body?.error_code ?? res.status, body?.description ?? "no response body");
  }
  return body.result;
}

/** The user's personal join-request link, created once and reused. */
export async function getOrCreateVipInviteLink(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.telegramInviteLink) return user.telegramInviteLink;

  const link = await callTelegram<{ invite_link: string }>("createChatInviteLink", {
    chat_id: vipChatId(),
    name: `user ${userId}`.slice(0, 32),
    creates_join_request: true,
  });

  // A concurrent render may have created one first — keep whichever landed
  // in the DB, the extra Telegram link just never gets handed out.
  const updated = await db.user.updateMany({
    where: { id: userId, telegramInviteLink: null },
    data: { telegramInviteLink: link.invite_link },
  });
  if (updated.count === 0) {
    const current = await db.user.findUniqueOrThrow({ where: { id: userId } });
    return current.telegramInviteLink ?? link.invite_link;
  }
  return link.invite_link;
}

/**
 * Removes a member from the VIP channel without banning them, so they can
 * come back through their link once they pay again. unbanChatMember on a
 * current member removes them (documented Bot API behaviour); on someone who
 * already left it is a no-op.
 */
export async function removeFromVipChannel(telegramUserId: string): Promise<void> {
  await callTelegram("unbanChatMember", { chat_id: vipChatId(), user_id: Number(telegramUserId) });
}

/**
 * Called whenever a VIP entitlement is written. Throws on a Telegram error so
 * the Stripe webhook answers 500 and Stripe retries the event.
 */
export async function enforceVipChannelAccess(userId: string, status: string): Promise<void> {
  if (status === "ACTIVE") return; // entry goes through the join request
  if (!isTelegramConfigured()) {
    console.warn("[telegram] VIP access ended but the bot isn't configured — member left in the channel", { userId });
    return;
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.telegramUserId) return; // never joined through their link
  try {
    await removeFromVipChannel(user.telegramUserId);
  } catch (err) {
    // A 400 is deterministic (e.g. the member is a channel admin) — retrying
    // for three days won't change it. Anything else (429, 5xx, network, bot
    // lost its rights) is worth Stripe's retry.
    if (err instanceof TelegramApiError && err.errorCode === 400) {
      console.error("[telegram] could not remove member from the VIP channel", { userId, err });
      return;
    }
    throw err;
  }
}
