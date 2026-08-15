"use server";

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { forgotPasswordSchema, fieldErrorsFrom } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { isEmailConfigured, sendPasswordResetEmail } from "@/lib/email";

export interface ForgotPasswordState {
  submitted?: boolean;
  fieldErrors?: Record<string, string>;
  /** Only populated when no email provider is configured — see isEmailConfigured(). */
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

  // Checked before the user lookup and reported identically to success below
  // (rate-limited vs. unknown-email both just return {submitted: true}) —
  // otherwise a distinguishable response would leak which emails exist.
  if (!checkRateLimit(`reset:${parsed.data.email}`, 3, 60 * 60 * 1000)) {
    return { submitted: true };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // Always report success, even for unknown emails, so the response can't be
  // used to enumerate registered accounts.
  if (!user) return { submitted: true };

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await db.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;

  if (!isEmailConfigured()) {
    // No transactional email provider connected — never claim an email was
    // sent when it wasn't. Log server-side and expose the link on-screen
    // instead, so the flow is still testable end-to-end.
    console.log(`[password-reset] no email provider configured — reset link for ${user.email}: ${resetUrl}`);
    return { submitted: true, devResetUrl: resetUrl };
  }

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (err) {
    // The token now exists whether or not the email arrives — logging this
    // is for us to notice a real provider outage, not for the requester:
    // the response must stay identical to the success/unknown-email case
    // above, or a distinguishable response would itself leak account
    // existence.
    console.error(`[password-reset] failed to send email to ${user.email}`, err);
  }

  return { submitted: true };
}
