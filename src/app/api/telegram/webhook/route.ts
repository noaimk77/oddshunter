import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { callTelegram, isTelegramConfigured, TelegramApiError, vipChatId } from "@/lib/telegram";

interface ChatJoinRequest {
  chat: { id: number };
  from: { id: number };
  invite_link?: { invite_link: string };
}

interface TelegramUpdate {
  update_id: number;
  chat_join_request?: ChatJoinRequest;
}

/** Telegram echoes the secret_token given to setWebhook in this header. */
function hasValidSecret(request: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const received = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Approves a VIP channel join request only when it comes through a link we
 * issued to a user whose VIP entitlement is ACTIVE, and from the Telegram
 * account bound to that user (or binds it, on first approval).
 */
async function shouldApprove(request: ChatJoinRequest): Promise<boolean> {
  const link = request.invite_link?.invite_link;
  if (!link) return false; // joined via a link we didn't issue

  const user = await db.user.findUnique({
    where: { telegramInviteLink: link },
    include: { entitlements: { where: { type: "VIP" } } },
  });
  const vip = user?.entitlements[0];
  if (!user || vip?.status !== "ACTIVE") return false;
  // A prepaid crypto month past its end is expired even before the cron runs.
  if (vip.provider === "CRYPTO" && (!vip.currentPeriodEnd || vip.currentPeriodEnd <= new Date())) return false;

  const telegramUserId = String(request.from.id);
  if (user.telegramUserId) return user.telegramUserId === telegramUserId;

  // First join: bind this Telegram account, unless it's already bound to
  // another user (the unique index makes that the same check, atomically).
  try {
    const bound = await db.user.updateMany({
      where: { id: user.id, telegramUserId: null },
      data: { telegramUserId },
    });
    if (bound.count === 1) return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
    throw err;
  }
  const current = await db.user.findUnique({ where: { id: user.id } });
  return current?.telegramUserId === telegramUserId;
}

export async function POST(request: Request) {
  if (!isTelegramConfigured() || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Telegram is not configured on this deployment." }, { status: 503 });
  }
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: "Invalid secret token." }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const joinRequest = update?.chat_join_request;
  if (!joinRequest || String(joinRequest.chat.id) !== vipChatId()) {
    return NextResponse.json({ ok: true }); // nothing we act on
  }

  try {
    const approve = await shouldApprove(joinRequest);
    await callTelegram(approve ? "approveChatJoinRequest" : "declineChatJoinRequest", {
      chat_id: joinRequest.chat.id,
      user_id: joinRequest.from.id,
    });
  } catch (err) {
    // A 400 is deterministic (typically the request was already handled on
    // an earlier delivery) — acknowledge it so Telegram stops redelivering.
    if (err instanceof TelegramApiError && err.errorCode === 400) {
      console.warn("[telegram-webhook] join request rejected by Telegram", err);
      return NextResponse.json({ ok: true });
    }
    console.error("[telegram-webhook] failed to handle join request", err);
    // Non-2xx makes Telegram redeliver the update.
    return NextResponse.json({ error: "Internal processing error." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
