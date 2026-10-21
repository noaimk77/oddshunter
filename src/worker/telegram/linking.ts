import crypto from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Secure, single-use pairing between a web account and a Telegram chat
 * (spec section 12.3: "reste à construire"). Mirrors the password-reset
 * token pattern already in this codebase (`forgot-password/actions.ts`):
 * a random 32-byte token, short expiry, `usedAt` marks single-use. The bot
 * never trusts a chat id supplied any other way than by consuming one of
 * these tokens.
 */

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes — long enough to open Telegram and tap Start

export function generateLinkToken(): { token: string; expiresAt: Date } {
  return {
    token: crypto.randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
  };
}

export function buildTelegramDeepLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`;
}

/** Called from the account page (site side) to start a linking flow. */
export async function createTelegramLinkToken(db: PrismaClient, userId: string): Promise<string> {
  const { token, expiresAt } = generateLinkToken();
  await db.telegramLinkToken.create({ data: { token, userId, expiresAt } });
  return token;
}

export type ConsumeLinkTokenResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "already_used" };

/**
 * Called from the bot's `/start <token>` handler once Telegram hands us the
 * chat id. Single-use and time-boxed: a token that's expired or already
 * consumed is rejected outright, never silently re-accepted.
 */
export async function consumeTelegramLinkToken(
  db: PrismaClient,
  token: string,
  telegramChatId: string,
  telegramUsername: string | undefined,
): Promise<ConsumeLinkTokenResult> {
  const record = await db.telegramLinkToken.findUnique({ where: { token } });
  if (!record) return { ok: false, reason: "not_found" };
  if (record.usedAt) return { ok: false, reason: "already_used" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

  await db.$transaction([
    db.telegramLinkToken.update({ where: { token }, data: { usedAt: new Date() } }),
    db.telegramLink.upsert({
      where: { userId: record.userId },
      create: { userId: record.userId, telegramChatId, telegramUsername },
      update: { telegramChatId, telegramUsername, revokedAt: null },
    }),
  ]);

  return { ok: true, userId: record.userId };
}

/** Called when a subscription is canceled/expired — cuts Telegram delivery immediately. */
export async function revokeTelegramLink(db: PrismaClient, userId: string): Promise<void> {
  await db.telegramLink.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
