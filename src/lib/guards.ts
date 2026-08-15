import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "This requires an active subscription.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Real server-side enforcement, not a UI convenience — call this at the top
 * of every route handler and server action that touches user data. Hiding a
 * button in React is not access control.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user;
}

export type EntitlementType = "VIP" | "BOT";

/**
 * Active entitlements only — canceled/past_due/incomplete don't count.
 *
 * Not called anywhere yet, and that's correct as of this writing: VIP and
 * Bot Access are delivered outside this web app (a Telegram channel and an
 * automated bot respectively — see the real Stripe product descriptions in
 * src/lib/plans.ts). There is currently no in-app page or API route whose
 * *content* is VIP/Bot-exclusive, so there is nothing here for this guard
 * to protect yet. It stays exported and ready: the day an in-app feature
 * becomes VIP/Bot-gated (e.g. a Telegram-linking page once a real bot
 * token exists), that route's handler should call requireEntitlement("VIP")
 * or requireEntitlement("BOT") exactly like requireAuth() is called
 * elsewhere in this file — never gate premium content by hiding a button.
 */
export async function requireEntitlement(type: EntitlementType) {
  const user = await requireAuth();
  const entitlement = await db.entitlement.findUnique({
    where: { userId_type: { userId: user.id, type } },
  });
  if (!entitlement || entitlement.status !== "ACTIVE") {
    throw new ForbiddenError(`This requires an active ${type} subscription.`);
  }
  return entitlement;
}

export async function getActiveEntitlements(userId: string) {
  const entitlements = await db.entitlement.findMany({ where: { userId, status: "ACTIVE" } });
  return new Set(entitlements.map((e) => e.type));
}
