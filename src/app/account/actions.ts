"use server";

import { z } from "zod";
import { signOut } from "@/lib/auth";
import { requireAuth, requireEntitlement, ForbiddenError } from "@/lib/guards";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordSchema, fieldErrorsFrom } from "@/lib/validation";
import { createTelegramLinkToken, buildTelegramDeepLink } from "@/worker/telegram/linking";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export interface TelegramLinkState {
  url?: string;
  error?: string;
}

/**
 * Generates a one-time deep link to pair this account with a Telegram chat.
 * Gated behind an active BOT entitlement (never just a hidden button — see
 * requireEntitlement's doc) and behind TELEGRAM_BOT_USERNAME actually being
 * set, which it isn't yet (spec: no bot created in BotFather as of
 * 2026-08-18) — that failure is reported to the user, not silently ignored.
 */
export async function createTelegramLinkAction(_prev: TelegramLinkState): Promise<TelegramLinkState> {
  const user = await requireAuth();

  try {
    await requireEntitlement("BOT");
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "Un abonnement Bot actif est requis." };
    throw err;
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return { error: "Le bot Telegram n'est pas encore configuré (TELEGRAM_BOT_USERNAME manquant)." };
  }

  const token = await createTelegramLinkToken(db, user.id);
  return { url: buildTelegramDeepLink(botUsername, token) };
}

export interface ChangePasswordState {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await requireAuth();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: String(formData.get("currentPassword") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, record.passwordHash))) {
    return { fieldErrors: { currentPassword: "That's not your current password." } };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: true };
}
