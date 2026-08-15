"use server";

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { forgotPasswordSchema, fieldErrorsFrom } from "@/lib/validation";

export interface ForgotPasswordState {
  submitted?: boolean;
  fieldErrors?: Record<string, string>;
  /** Only populated outside production, since no email provider is wired up — see the mission report. */
  devResetUrl?: string;
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({ email: String(formData.get("email") ?? "") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // Always report success, even for unknown emails, so the response can't be
  // used to enumerate registered accounts.
  if (!user) return { submitted: true };

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;

  // No transactional email provider is connected in this environment (see
  // the mission report's "remaining blockers" section) — never claim an
  // email was sent when it wasn't. Log server-side instead.
  console.log(`[password-reset] no email provider configured — reset link for ${user.email}: ${resetUrl}`);

  return {
    submitted: true,
    devResetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
  };
}
