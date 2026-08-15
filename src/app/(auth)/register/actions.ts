"use server";

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema, fieldErrorsFrom } from "@/lib/validation";
import { signIn } from "@/lib/auth";

export interface RegisterState {
  fieldErrors?: Record<string, string>;
}

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { fieldErrors: { email: "An account with this email already exists." } };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.create({ data: { email: parsed.data.email, passwordHash } });

  // Throws a redirect internally on success — nothing after this line runs
  // in the happy path.
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  return {};
}
