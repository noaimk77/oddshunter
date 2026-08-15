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

/** Active entitlements only — canceled/past_due/incomplete don't count. */
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
