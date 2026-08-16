"use server";

import { z } from "zod";
import { signOut } from "@/lib/auth";
import { requireAuth } from "@/lib/guards";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordSchema, fieldErrorsFrom } from "@/lib/validation";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
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
