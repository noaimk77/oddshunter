"use server";

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { registerSchema, fieldErrorsFrom } from "@/lib/validation";
import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export interface RegisterState {
  fieldErrors?: Record<string, string>;
}

const EMAIL_TAKEN_ERROR = { fieldErrors: { email: "An account with this email already exists." } };

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  // Bounds repeated registration attempts against the same email (probing,
  // scripted signup spam) — a genuinely new account only ever needs one.
  if (!checkRateLimit(`register:${parsed.data.email}`, 5, 60 * 60 * 1000)) {
    return { fieldErrors: { email: "Too many attempts. Try again later." } };
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return EMAIL_TAKEN_ERROR;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    await db.user.create({ data: { email: parsed.data.email, passwordHash } });
  } catch (err) {
    // The findUnique check above can't prevent two concurrent registrations
    // for the same email from racing each other — the unique constraint is
    // the real guard, this just turns its violation into the same friendly
    // message instead of an unhandled 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return EMAIL_TAKEN_ERROR;
    }
    throw err;
  }

  // Throws a redirect internally on success — nothing after this line runs
  // in the happy path.
  await signIn("credentials", { email: parsed.data.email, password: parsed.data.password, redirectTo: "/" });
  return {};
}
