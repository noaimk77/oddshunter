import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/guards";
import { stripe, isStripeConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured on this deployment." }, { status: 503 });
  }

  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const dbUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account yet — subscribe first." }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: dbUser.stripeCustomerId,
    return_url: `${appUrl}/account`,
  });

  return NextResponse.json({ url: portalSession.url });
}
