import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isEmailConfigured, sendCryptoRenewalReminder } from "@/lib/email";
import { expireCryptoEntitlements, findCryptoEntitlementsToRemind } from "@/lib/crypto-payments";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Daily: reminds crypto subscribers whose month ends soon, then expires the
 * ones that ended (which removes them from the VIP channel).
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  let reminded = 0;
  if (isEmailConfigured()) {
    for (const entitlement of await findCryptoEntitlementsToRemind()) {
      try {
        await sendCryptoRenewalReminder(entitlement.user.email, entitlement.type, entitlement.currentPeriodEnd!, `${appUrl}/account`);
        await db.entitlement.update({ where: { id: entitlement.id }, data: { renewalReminderSentAt: new Date() } });
        reminded++;
      } catch (err) {
        console.error("[cron] renewal reminder failed", { entitlementId: entitlement.id, err });
      }
    }
  }

  const expired = await expireCryptoEntitlements();
  return NextResponse.json({ reminded, expired });
}
